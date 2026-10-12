import { NextResponse } from "next/server";
import {
  takedownAtlasReportTarget,
  updateAtlasReportStatus,
  type AtlasReportStatus,
} from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-gated by middleware (ADMIN_COOKIE). Resolve a report as reviewed /
// dismissed, or take down the item / 合集 it points at (`action: "takedown"`),
// which also closes the other open reports on the same target.
const STATUSES = new Set<AtlasReportStatus>(["open", "reviewed", "dismissed"]);

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^\d+$/.test(params.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  let body: { status?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (body.action === "takedown") {
    const result = await takedownAtlasReportTarget(params.id);
    if (result === "not_found") {
      return NextResponse.json({ error: "內容已不存在" }, { status: 404 });
    }
    if (result === "unsupported") {
      return NextResponse.json({ error: "作者身分無法下架" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (!STATUSES.has(status as AtlasReportStatus)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  await updateAtlasReportStatus(params.id, status as AtlasReportStatus);
  return NextResponse.json({ ok: true });
}
