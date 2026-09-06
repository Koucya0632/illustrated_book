// Submit a collection for review. Like the item publish route, this is a
// *submission*: the text gate (title + description) may auto-publish it or send
// it to the human queue. A collection must have at least one member first.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  getOwnedAtlasCollection,
  isAtlasAuthorBlocked,
  prepareAtlasItemForCollectionPublication,
  submitAtlasItemForReview,
} from "@/lib/atlas-db";
import { processAtlasCollectionSubmission } from "@/lib/atlas/collection-submit-pipeline";
import { processAtlasSubmission } from "@/lib/atlas/submit-pipeline";
import { publishAtlasShareImage, removeAtlasPublicObjects } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Repeat offenders lose publishing (docs/COMMUNITY_ATLAS_PLAN.md §5.5).
  if (await isAtlasAuthorBlocked(userId)) {
    return NextResponse.json(
      { error: "publishing_restricted", message: "你的帳號目前無法公開內容。" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const owned = await getOwnedAtlasCollection(params.id, userId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A moderation takedown is not re-submittable. The client hides the button;
  // this is what actually stops a plain POST from re-publishing it.
  if (owned.collection.review_status === "takedown") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
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
    const submitted = await submitAtlasItemForReview(userId, member.id, {
      deferPublication: true,
    });
    if (!submitted) {
      problemItemIds.push(member.id);
      continue;
    }
    const itemOutcome = await processAtlasSubmission(submitted, { deferPublication: true });
    if (itemOutcome.reviewStatus !== "approved") problemItemIds.push(member.id);
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
        await prepareAtlasItemForCollectionPublication(image.itemId, image.path);
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
