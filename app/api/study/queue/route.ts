import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  attachChoices,
  attachMasteryAndSort,
  fetchDue,
  studyStats,
  type QueueMode,
} from "@/lib/cards-db";
import { getSettings } from "@/lib/users-db";
import { localizeStudyQueue } from "@/lib/study-localize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getSettings(userId);

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

  const [queue, stats] = await Promise.all([
    fetchDue(userId, limit, newLimit, { cefr, tags, categories, deckKeys }, mode),
    studyStats(userId),
  ]);
  await attachMasteryAndSort(userId, queue);
  // 新學 session skips the MCQ render entirely (StudyClient auto-reveals
  // each card), so distractor scoring + the word_relations JOIN would be
  // wasted work. Only attach choices for the modes that actually use them.
  if (mode !== "new") await attachChoices(queue);
  const localized = await localizeStudyQueue(queue, settings.uiLang);

  return NextResponse.json({ queue: localized, stats });
}
