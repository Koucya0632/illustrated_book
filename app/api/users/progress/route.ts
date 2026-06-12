import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  clearLearningProgress,
  getActivityHeatmap,
  getStudyStreak,
} from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read endpoint for Today hero + the full Progress tab. Streak +
// 42-cell heatmap come from the same payload so iOS doesn't make two
// round-trips. Mastery / topCategories will join once the aggregate
// queries land.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [streak, heatmap] = await Promise.all([
    getStudyStreak(userId),
    getActivityHeatmap(userId),
  ]);
  return NextResponse.json({ streak, heatmap });
}

// Clear the signed-in user's learning progress (learned / mastery / SRS state /
// study history). Favorites and settings are kept.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearLearningProgress(userId);
  return NextResponse.json({ ok: true });
}
