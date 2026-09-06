// Add a member to a collection. The DB guard (addAtlasCollectionItem) enforces
// that the collection is the caller's and the public item is the caller's own
// approved item in the collection's target language.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { addAtlasCollectionItem } from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { sourceItemId?: unknown; publicItemId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // `publicItemId` remains accepted for one client release. New clients send
  // the stable source item id, which exists before publication.
  const sourceItemId =
    typeof body.sourceItemId === "string"
      ? body.sourceItemId
      : typeof body.publicItemId === "string"
        ? body.publicItemId
        : "";
  if (invalidId(sourceItemId)) return NextResponse.json({ error: "invalid item" }, { status: 400 });

  const added = await addAtlasCollectionItem({
    collectionId: params.id,
    ownerUserId: userId,
    sourceItemId,
  });
  // Not added means the guard rejected it (not owner / not confirmed / wrong
  // language) or it was already a member. Either way there's nothing to change.
  if (!added) return NextResponse.json({ error: "cannot add item" }, { status: 409 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
