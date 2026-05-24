import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { attachChoices, fetchDue, studyStats } from "@/lib/cards-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));
  const newLimit = Math.min(20, Math.max(0, Number(searchParams.get("new") || 10)));

  const [queue, stats] = await Promise.all([
    fetchDue(userId, limit, newLimit),
    studyStats(userId),
  ]);
  await attachChoices(queue);

  return NextResponse.json({ queue, stats });
}
