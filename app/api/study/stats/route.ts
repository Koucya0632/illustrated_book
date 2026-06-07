// Lightweight stats endpoint used by /study landing to render the
// "新學 N / 複習 M / backlog warning" tiles without paying for a full
// queue fetch (no card rows, no JOIN, no distractor scoring).
//
// Returns the same shape as the `stats` field on /api/study/queue —
// { total, seen, due, new, byStatus } — so the client can compute
// `computeNewLimit(base, stats.due)` and decide which buttons to enable.
import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { studyStats } from "@/lib/cards-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Multi-theme filter — same shape as /api/study/queue. Empty list = no
  // theme filter; landing displays global counts.
  const { searchParams } = new URL(req.url);
  const categories = (searchParams.get("category") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "all");
  try {
    const t0 = performance.now();
    const stats = await studyStats(userId, categories);
    const dbMs = Math.round(performance.now() - t0);
    return NextResponse.json(
      { stats },
      { headers: { "Server-Timing": `db;dur=${dbMs}` } },
    );
  } catch (err) {
    // Two-line emit: Vercel's log column truncates ~50 chars, so the
    // message gets its own line (the part you actually want to read) and
    // the structured context (userId + postgres code/detail) goes on a
    // second line. Without this, [study/stats] failed hides the cause.
    const e = err as Error & { code?: string; detail?: string; severity?: string };
    console.error(`[study/stats] ${e.message}`);
    console.error(`[study/stats] context`, {
      userId,
      code: e.code,
      severity: e.severity,
      detail: e.detail,
    });
    return NextResponse.json({ error: "stats_failed" }, { status: 500 });
  }
}
