// Add a member to a collection. The DB guard (addAtlasCollectionItem) enforces
// that the collection is the caller's and that it can actually take this item:
// the owner's own confirmed item in the collection's language.
//
// A member that isn't public yet joins either way. Which review path it takes
// depends on where the collection is (lib/atlas/collection-membership.ts):
// an unpublished collection carries it at publish time, a live one cannot — so
// this route sends it through the item gate right here. Until it passes, the
// member is in the collection and invisible to everyone else, which is what the
// public read already does with a NULL `public_item_id`.
//
// The alternative, and what this replaces: 取消公開 the whole 合集 to add one
// photo, then publish again and hope the text gate still clears.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { addAtlasCollectionItem, isAtlasAuthorBlocked, submitAtlasItemForReview } from "@/lib/atlas-db";
import { messageForRefusal } from "@/lib/atlas/collection-membership";
import { processAtlasSubmission } from "@/lib/atlas/submit-pipeline";

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
    const moderation = outcome.needsOwnReview
      ? await submitNewMemberForReview(userId, sourceItemId)
      : null;
    return NextResponse.json(
      { ok: true, moderation },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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

/**
 * Sends a member that joined a live collection through the item gate. Clean
 * photos publish immediately and appear in the collection at once; risky ones
 * wait for a human and stay invisible there until they clear.
 *
 * Never throws: the member is already in the collection, and a failure here
 * leaves it exactly where an unreviewed member belongs — out of sight. The
 * author can retry by removing and re-adding it.
 */
async function submitNewMemberForReview(
  userId: string,
  sourceItemId: string,
): Promise<{ reviewStatus: string; published: boolean } | null> {
  try {
    // Publishing is a privilege this account may have lost. The item stays a
    // member; it simply never becomes visible.
    if (await isAtlasAuthorBlocked(userId)) return null;
    const item = await submitAtlasItemForReview(userId, sourceItemId);
    if (!item) return null;
    const outcome = await processAtlasSubmission(item);
    return { reviewStatus: outcome.reviewStatus, published: outcome.published };
  } catch {
    return null;
  }
}
