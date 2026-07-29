import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  clearLearningProgress,
  getActivityHeatmap,
  getSettings,
  getStudyStreak,
} from "@/lib/users-db";
import { categoryProgress } from "@/lib/cards-db";
import { atlasCategoryProgress, savedCommunityCategoryProgress } from "@/lib/atlas-db";
import { studyDeckFor, targetLanguageFor } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read endpoint for Today hero + the full Progress tab. Streak +
// 42-cell heatmap + per-category completion come from the same payload so
// iOS renders the whole Progress tab from one round-trip. `categories`
// gives {category,total,seen} where seen = words studied at least once.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getSettings(userId);
  const targetLanguage = targetLanguageFor(settings.learningDirection);
  const deckKey = studyDeckFor(settings.learningDirection);
  const [streak, heatmap, categories, customCategory, savedCommunity] = await Promise.all([
    getStudyStreak(userId, "Asia/Taipei", targetLanguage),
    getActivityHeatmap(userId, "Asia/Taipei", targetLanguage),
    categoryProgress(userId, deckKey),
    atlasCategoryProgress(userId, targetLanguage),
    savedCommunityCategoryProgress(userId, targetLanguage),
  ]);
  // 社群圖鑑 counts like 自製圖鑑: its own {total, seen} row, appended. Saving
  // raises the denominator before you study it, so the completion figure dips
  // — the same shape capturing a photo already has, and the reason the number
  // is worth trusting: it counts everything you took on, not just the easy
  // parts. Rows with nothing saved are dropped so an empty theme never appears.
  const synthetic = [customCategory, savedCommunity.total > 0
    ? { category: "community", ...savedCommunity }
    : null].filter((c): c is NonNullable<typeof c> => c !== null);
  return NextResponse.json({
    streak,
    heatmap,
    categories: [...categories, ...synthetic],
  });
}

// Clear the signed-in user's learning progress (learned / mastery / SRS state /
// study history). Favorites and settings are kept.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearLearningProgress(userId);
  return NextResponse.json({ ok: true });
}
