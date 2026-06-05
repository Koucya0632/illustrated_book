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

export async function GET(req: Request) {
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const t0 = performance.now();
    const stats = await studyStats(userId);
    const dbMs = Math.round(performance.now() - t0);
    return NextResponse.json(
      { stats },
      { headers: { "Server-Timing": `db;dur=${dbMs}` } },
    );
  } catch (err) {
    console.error("[study/stats] failed", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "stats_failed" }, { status: 500 });
  }
}
