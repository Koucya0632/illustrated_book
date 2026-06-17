import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  clearLearningProgress,
  getActivityHeatmap,
  getStudyStreak,
} from "@/lib/users-db";
import { categoryProgress } from "@/lib/cards-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read endpoint for Today hero + the full Progress tab. Streak +
// 42-cell heatmap + per-category completion come from the same payload so
// iOS renders the whole Progress tab from one round-trip. `categories`
// gives {category,total,seen} where seen = words studied at least once.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [streak, heatmap, categories] = await Promise.all([
    getStudyStreak(userId),
    getActivityHeatmap(userId),
    categoryProgress(userId),
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
