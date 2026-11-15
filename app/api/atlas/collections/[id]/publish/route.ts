// Submit a collection for review. Like the item publish route, this is a
// *submission*: the text gate (title + description) may auto-publish it or send
// it to the human queue. A collection must have at least one member first.

import { NextResponse } from "next/server";
import { communityWriteRefusal } from "@/lib/atlas/community-gate";
import { getCurrentUserId } from "@/lib/current-user";
import { getOwnedAtlasCollection } from "@/lib/atlas-db";
import { processAtlasCollectionSubmission } from "@/lib/atlas/collection-submit-pipeline";
import { canSubmit } from "@/lib/atlas/lifecycle-rules";
import { atlasPublication } from "@/lib/atlas/publication-live";
import { publishAtlasShareImage, removeAtlasPublicObjects } from "@/lib/atlas/storage";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const membershipRefusal = await communityWriteRefusal(userId);
  if (membershipRefusal) return membershipRefusal;
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Repeat offenders lose publishing (docs/COMMUNITY_ATLAS_PLAN.md §5.5).
  const publication = atlasPublication();
  if (await publication.isAuthorRestricted(userId)) {
    return NextResponse.json(
      { error: "publishing_restricted", message: "你的帳號目前無法公開內容。" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const owned = await getOwnedAtlasCollection(params.id, userId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A moderation takedown is not re-submittable, and a 合集 in review — or one
  // reports pulled back — waits for its decision. The client hides the button;
  // this is what actually stops a plain POST from re-publishing it.
  if (owned.collection.review_status === "takedown") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!canSubmit(owned.collection.review_status)) {
    return NextResponse.json({ error: "not_submittable" }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
  const items = owned.members;
  if (items.length === 0) {
    return NextResponse.json(
      { error: "empty_collection", message: "合集至少要有一個項目才能公開。" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const unpublishedMembers = owned.members.filter((member) => !member.public_item_id);
  const problemItemIds: string[] = [];
  for (const member of unpublishedMembers) {
    if (!member.eligible) {
      problemItemIds.push(member.id);
      continue;
    }
    if (member.review_status === "rejected" || member.review_status === "takedown") {
      problemItemIds.push(member.id);
      continue;
    }
    if (
      member.review_status === "pending" ||
      member.review_status === "pending_auto" ||
      member.review_status === "pending_review"
    ) {
      problemItemIds.push(member.id);
      continue;
    }
    if (member.review_status === "approved") continue;
    const itemOutcome = await publication.submit(userId, member.id, { deferPublication: true });
    if (!itemOutcome.ok || itemOutcome.reviewStatus !== "approved") problemItemIds.push(member.id);
  }

  if (problemItemIds.length === 0) {
    const uploaded: Array<{ itemId: string; path: string }> = [];
    let uploadingItemId: string | null = null;
    try {
      for (const member of unpublishedMembers) {
        uploadingItemId = member.id;
        const image = await publishAtlasShareImage({
          publicItemId: member.id,
          privateThumbPath: member.thumb_path,
        });
        uploaded.push({ itemId: member.id, path: image.path });
      }
      for (const image of uploaded) {
        await publication.prepareForCollection(image.itemId, image.path);
      }
    } catch {
      if (uploadingItemId) problemItemIds.push(uploadingItemId);
      await removeAtlasPublicObjects(uploaded.map((image) => image.path)).catch(() => {});
    }
  }

  // Text gate: clean submissions publish immediately, risky ones wait for a
  // human. Never throws — a failure leaves the collection queued for review.
  const outcome = await processAtlasCollectionSubmission(owned.collection);

  return NextResponse.json(
    {
      collection: { ...owned.collection, review_status: outcome.reviewStatus },
      moderation: {
        reviewStatus: outcome.reviewStatus,
        published: outcome.published,
        categories: outcome.categories,
        unpublishedItemCount: unpublishedMembers.length,
        problemItemIds,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
