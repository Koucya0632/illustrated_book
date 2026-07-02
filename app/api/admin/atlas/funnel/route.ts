import { NextResponse } from "next/server";
import { getAtlasFunnel } from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-gated by middleware (ADMIN_COOKIE). Capture funnel + AI cost over the
// last ?days=N (default 30, clamped 1..365). Consumable by dashboards.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? 30);
  const report = await getAtlasFunnel(Number.isFinite(days) ? days : 30);
  return NextResponse.json(report, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
