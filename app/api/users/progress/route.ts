import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { clearLearningProgress } from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Clear the signed-in user's learning progress (learned / mastery / SRS state /
// study history). Favorites and settings are kept.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearLearningProgress(userId);
  return NextResponse.json({ ok: true });
}
