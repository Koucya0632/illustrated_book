// Admin-gated by middleware (ADMIN_COOKIE). Approve / reject / takedown a
// submitted collection. Mirrors the item review route; the rules are the
// publication lifecycle's (lib/atlas/publication.ts, `moderateCollection`).

import { NextResponse } from "next/server";
import { atlasPublication } from "@/lib/atlas/publication-live";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "takedown") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  const result = await atlasPublication().moderateCollection(params.id, action);
  if (!result.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (result.pendingMembers) return NextResponse.json({ ok: true, pendingMembers: true });
  return NextResponse.json({ ok: true, collection: result.collection });
}
