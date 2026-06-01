// Lightweight stats endpoint used by /study landing to render the
// "新學 N / 複習 M / backlog warning" tiles without paying for a full
// queue fetch (no card rows, no JOIN, no distractor scoring).
//
// Returns the same shape as the `stats` field on /api/study/queue —
// { total, seen, due, new, byStatus } — so the client can compute
// `computeNewLimit(base, stats.due)` and decide which buttons to enable.
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { studyStats } from "@/lib/cards-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stats = await studyStats(userId);
  return NextResponse.json({ stats });
}
