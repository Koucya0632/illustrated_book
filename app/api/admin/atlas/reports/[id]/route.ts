import { NextResponse } from "next/server";
import { updateAtlasReportStatus, type AtlasReportStatus } from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-gated by middleware (ADMIN_COOKIE). Resolve a report as reviewed /
// dismissed. Takedown of the underlying item is done on the 圖鑑審核 page.
const STATUSES = new Set<AtlasReportStatus>(["open", "reviewed", "dismissed"]);

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!/^\d+$/.test(params.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (!STATUSES.has(status as AtlasReportStatus)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  await updateAtlasReportStatus(params.id, status as AtlasReportStatus);
  return NextResponse.json({ ok: true });
}
