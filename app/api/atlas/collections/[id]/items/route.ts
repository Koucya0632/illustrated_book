// Add a member to a collection. The DB guard (addAtlasCollectionItem) enforces
// that the collection is the caller's and that it can actually take this item:
// the owner's own confirmed item in the collection's language, and — once the
// collection is live or in review — one that is already public.
//
// A refusal carries its reason (lib/atlas/collection-membership.ts), because
// 「已公開的合集不能加入未公開的項目」 is a rule the author can follow and
// 「cannot add item」 is not.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { addAtlasCollectionItem } from "@/lib/atlas-db";
import { messageForRefusal } from "@/lib/atlas/collection-membership";

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

  const outcome = await addAtlasCollectionItem({
    collectionId: params.id,
    ownerUserId: userId,
    sourceItemId,
  });
  if (outcome.added) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // Someone else's collection, or none — never a conflict.
  if (outcome.reason === "no_collection") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // A refusal with a name. `error` is the machine-readable reason a client maps
  // to its own localized copy; `message` is the zh-Hant fallback for anything
  // that doesn't know this one. 「cannot add item」 — the string that used to be
  // here — reached the reader as 「伺服器出了點問題（409）」.
  return NextResponse.json(
    { error: outcome.reason, message: messageForRefusal(outcome.reason) },
    { status: 409, headers: { "Cache-Control": "private, no-store" } },
  );
}
