import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import {
  attachChoices,
  attachMasteryAndSort,
  fetchDue,
  studyStats,
  type QueueMode,
} from "@/lib/cards-db";
import { getAllMastery, getSettings } from "@/lib/users-db";
import { localizeStudyQueue } from "@/lib/study-localize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t0 = performance.now();
  // Best-effort early bail: if the browser already gave up on this request
  // (page nav, tab close, double-click), don't bother spinning up the
  // Promise.all of DB work. Saves Supabase compute and reduces the
  // "status 0, 0ms" pattern in Vercel logs.
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });

  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // Hard ceiling matches DAILY_GOAL_MAX in lib/settings.ts so a user who
  // sets dailyGoal=100 gets all 100 (used as new-card cap or review batch).
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
  const newLimit = Math.min(100, Math.max(0, Number(searchParams.get("new") || 10)));
  // Comma-separated lists, e.g. `?cefr=A1,A2&tags=daily-life,kitchen`.
  // fetchDue validates CEFR strictly; tags are passed through (free-form).
  const cefr = (searchParams.get("cefr") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = (searchParams.get("tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Single study theme (a category id); "all"/empty = no filter.
  const category = (searchParams.get("category") ?? "").trim();
  const categories = category && category !== "all" ? [category] : [];
  // Card decks (deck_key) to study; comma-separated, "all"/empty = no filter.
  const deckKeys = (searchParams.get("decks") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "all");
  // Mode: "new" (only first-time cards), "review" (only due reviews), or
  // "both" (legacy mixed queue). Unknown values fall back to "both".
  const modeParam = (searchParams.get("mode") ?? "both").trim();
  const mode: QueueMode =
    modeParam === "new" || modeParam === "review" ? modeParam : "both";

  try {
    // getSettings + fetchDue + studyStats + getAllMastery have no data
    // dependency between them — fanning them out collapses ~4 sequential
    // round-trips into one. attachChoices / localize still depend on `queue`.
    const tDb = performance.now();
    const [settings, queue, stats, masteryRows] = await Promise.all([
      getSettings(userId),
      fetchDue(userId, limit, newLimit, { cefr, tags, categories, deckKeys }, mode),
      studyStats(userId),
      getAllMastery(userId),
    ]);
    const dbMs = Math.round(performance.now() - tDb);

    if (req.signal.aborted) return new NextResponse(null, { status: 499 });

    const tMastery = performance.now();
    await attachMasteryAndSort(userId, queue, masteryRows);
    const masteryMs = Math.round(performance.now() - tMastery);

    // 新學 session skips the MCQ render entirely (StudyClient auto-reveals
    // each card), so distractor scoring + the word_relations JOIN would be
    // wasted work. Only attach choices for the modes that actually use them.
    const tChoices = performance.now();
    if (mode !== "new") await attachChoices(queue);
    const choicesMs = Math.round(performance.now() - tChoices);

    const tLocalize = performance.now();
    const localized = await localizeStudyQueue(queue, settings.uiLang);
    const localizeMs = Math.round(performance.now() - tLocalize);

    const totalMs = Math.round(performance.now() - t0);
    return NextResponse.json(
      { queue: localized, stats },
      {
        headers: {
          "Server-Timing": [
            `db;dur=${dbMs}`,
            `mastery;dur=${masteryMs}`,
            `choices;dur=${choicesMs}`,
            `localize;dur=${localizeMs}`,
            `total;dur=${totalMs}`,
          ].join(", "),
        },
      },
    );
  } catch (err) {
    // Surface a JSON error instead of letting Next return an opaque HTML 500.
    // Client (StudyClient.loadQueue) shows a coral banner; structured log
    // lets us correlate to Vercel runtime logs by userId + mode.
    console.error("[study/queue] failed", {
      userId,
      mode,
      limit,
      newLimit,
      category,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
}
