import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  clearLearningProgress,
  getActivityHeatmap,
  getSettings,
  getStudyStreak,
} from "@/lib/users-db";
import { categoryProgress } from "@/lib/cards-db";
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
  const [streak, heatmap, categories] = await Promise.all([
    getStudyStreak(userId, "Asia/Taipei", targetLanguage),
    getActivityHeatmap(userId, "Asia/Taipei", targetLanguage),
    categoryProgress(userId, deckKey),
  ]);
  return NextResponse.json({ streak, heatmap, categories });
}

// Clear the signed-in user's learning progress (learned / mastery / SRS state /
// study history). Favorites and settings are kept.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearLearningProgress(userId);
  return NextResponse.json({ ok: true });
}
