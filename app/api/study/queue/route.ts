import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  attachChoices,
  attachMasteryAndSort,
  fetchDue,
  studyStats,
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
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));
  const newLimit = Math.min(20, Math.max(0, Number(searchParams.get("new") || 10)));
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

  const [queue, stats] = await Promise.all([
    fetchDue(userId, limit, newLimit, { cefr, tags, categories, deckKeys }),
    studyStats(userId),
  ]);
  await attachMasteryAndSort(userId, queue);
  await attachChoices(queue);
  const localized = await localizeStudyQueue(queue, settings.uiLang);

  return NextResponse.json({ queue: localized, stats });
}
