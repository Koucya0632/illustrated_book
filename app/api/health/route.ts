import { NextResponse } from "next/server";
import { dbTransactionSummary, getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cloud Run liveness probe (deploy/README.md). On 2026-11-24 one instance's
// connection pool filled with queries that never returned; every DB route on it
// hung until the 300 s limit for two hours while the probe-less service kept
// routing to it. This runs through the same pool, so a full pool fails it and
// Cloud Run restarts the instance.
const DB_CHECK_TIMEOUT_MS = 3_000;
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: true, db: "disabled" }, { headers });
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("db check timed out")), DB_CHECK_TIMEOUT_MS);
      }),
    ]);
    return NextResponse.json({ ok: true, dbMs: Math.round(performance.now() - started) }, { headers });
  } catch (error) {
    console.error("[health] db check failed", JSON.stringify({
      error: String(error),
      ms: Math.round(performance.now() - started),
      transactions: dbTransactionSummary(),
    }));
    return NextResponse.json({ ok: false }, { status: 503, headers });
  } finally {
    clearTimeout(timer);
  }
}
