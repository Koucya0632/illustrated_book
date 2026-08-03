// Remove a member from a collection (owner-gated).

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { removeAtlasCollectionItem } from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; publicItemId: string } },
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id) || invalidId(params.publicItemId)) {
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
