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
import { studyDeckFor, targetLanguageFor } from "@/lib/settings";

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
  // Multi-theme study filter: comma-separated category ids (words.category).
  // Empty list = no filter. Legacy "all" sentinel still stripped for safety
  // — clients used to send it as a single value.
  const categories = (searchParams.get("category") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "all");
  // Mode: "new" (only first-time cards), "review" (only due reviews), or
  // "both" (legacy mixed queue). Unknown values fall back to "both".
  const modeParam = (searchParams.get("mode") ?? "both").trim();
  const mode: QueueMode =
    modeParam === "new" || modeParam === "review" ? modeParam : "both";

  try {
    // The selected learning direction determines both the card deck and the
    // independent mastery namespace, so resolve settings before queue work.
    const tDb = performance.now();
    const settings = await getSettings(userId);
    const directionDeck = studyDeckFor(settings.learningDirection);
    const targetLanguage = targetLanguageFor(settings.learningDirection);
    // Learning direction is authoritative. Legacy client deck filters must
    // never widen a Japanese queue back to all decks when they disagree.
    const effectiveDecks = [directionDeck];
    const [queue, stats, masteryRows] = await Promise.all([
      fetchDue(
        userId,
        limit,
        newLimit,
        { cefr, tags, categories, deckKeys: effectiveDecks },
        mode,
      ),
      studyStats(userId, categories, directionDeck),
      getAllMastery(userId, targetLanguage),
    ]);
    const dbMs = Math.round(performance.now() - tDb);

    if (req.signal.aborted) return new NextResponse(null, { status: 499 });

    const tMastery = performance.now();
    await attachMasteryAndSort(userId, queue, masteryRows);
    const masteryMs = Math.round(performance.now() - tMastery);

    // New-learn now uses 4-choice MCQs in Step 2 (英文辨認) and Step 3
    // (拼字), so it needs `choices` and `spellingChoices` attached too.
    // The +1 query for the distractor pool is paid every queue load.
    const tChoices = performance.now();
    await attachChoices(queue);
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
    //
    // Two-line emit: Vercel's MESSAGE column truncates ~50 chars, so the
    // postgres error message goes on its own line first.
    const e = err as Error & { code?: string; detail?: string; severity?: string };
    console.error(`[study/queue] ${e.message}`);
    console.error(`[study/queue] context`, {
      userId,
      mode,
      limit,
      newLimit,
      categories,
      code: e.code,
      severity: e.severity,
      detail: e.detail,
    });
    return NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
}
