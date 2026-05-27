// Daily pg_partman maintenance: creates next month's child partition for
// study_logs and drops any aged past the configured retention (12 months).
// Scheduled by vercel.json -> /api/cron/partman at 03:00 UTC.
//
// Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. Without the
// env var, the endpoint refuses to run (so a public probe can't trigger DB
// work).

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
// Disable response caching — this is a side-effecting cron, not a read.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    // run_maintenance does the heavy lifting: pre-creates premake partitions,
    // detaches/drops any partitions past the retention window, runs ANALYZE
    // on newly-created children.
    await sql`SELECT partman.run_maintenance()`;

    // Surface visibility: what child partitions of study_logs exist after
    // this run? Useful for the cron's success body and for spot-checks.
    const rows = (await sql`
      SELECT child.relname AS partition
      FROM pg_inherits
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      WHERE parent.relname = 'study_logs'
      ORDER BY child.relname
    `) as unknown as { partition: string }[];

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      partitions: rows.map((r) => r.partition),
    });
  } catch (err) {
    console.error("[cron/partman] maintenance failed", err);
    return NextResponse.json(
      { error: "maintenance failed", message: String(err) },
      { status: 500 },
    );
  }
}
