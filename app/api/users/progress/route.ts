import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { clearLearningProgress, getStudyStreak } from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read endpoint for the Today hero — currently just the study-streak block.
// Mastery / topCategories will join once aggregate queries land.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const streak = await getStudyStreak(userId);
  return NextResponse.json({ streak });
}

// Clear the signed-in user's learning progress (learned / mastery / SRS state /
// study history). Favorites and settings are kept.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearLearningProgress(userId);
  return NextResponse.json({ ok: true });
}
