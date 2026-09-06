import { NextResponse } from "next/server";
import {
  markAtlasCollectionContentApproved,
  publishAtlasCollectionAtomically,
  rejectAtlasCollection,
  takedownAtlasCollection,
} from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-gated by middleware (ADMIN_COOKIE). Approve / reject / takedown a
// submitted collection. Mirrors the item review route.
function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (body.action === "reject") {
    const c = await rejectAtlasCollection(params.id);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, collection: c });
  }
  if (body.action === "takedown") {
    const c = await takedownAtlasCollection(params.id);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, collection: c });
  }
  if (body.action === "approve") {
    await markAtlasCollectionContentApproved(params.id);
    const c = await publishAtlasCollectionAtomically(params.id);
    if (!c) {
      return NextResponse.json({ ok: true, pendingMembers: true });
    }
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, collection: c });
  }
  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
