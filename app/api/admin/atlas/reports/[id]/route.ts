// Admin-gated by middleware (ADMIN_COOKIE). Resolve a report as reviewed /
// dismissed, take down the item / 合集 it points at (`action: "takedown"`,
// which also closes the other open reports on the same target), or uphold a
// 「不是在這裡拍的」 with `action: "remove_from_spot"`: the card leaves that 景點
// for good and stays on 物見. lib/atlas/publication.ts, `resolveReport`.

import { NextResponse } from "next/server";
import { atlasPublication } from "@/lib/atlas/publication-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["reviewed", "dismissed"]);

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

  const action =
    body.action === "takedown" || body.action === "remove_from_spot"
      ? body.action
      : typeof body.status === "string" && STATUSES.has(body.status)
        ? (body.status as "reviewed" | "dismissed")
        : null;
  if (!action) return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const result = await atlasPublication().resolveReport(params.id, action);
  if (!result.ok) {
    if (result.reason === "unsupported") {
      return NextResponse.json(
        { error: action === "remove_from_spot" ? "這則檢舉不是景點檢舉" : "這個目標無法下架" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "內容已不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
