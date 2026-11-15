// Remove a member from a collection (owner-gated).

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { removeAtlasCollectionItem } from "@/lib/atlas-db";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string; publicItemId: string }> }
) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id) || !isUuid(params.publicItemId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const removed = await removeAtlasCollectionItem({
    collectionId: params.id,
    ownerUserId: userId,
    sourceItemId: params.publicItemId,
  });
  if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
