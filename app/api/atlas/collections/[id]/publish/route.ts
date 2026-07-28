// Submit a collection for review. Like the item publish route, this is a
// *submission*: the text gate (title + description) may auto-publish it or send
// it to the human queue. A collection must have at least one member first.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getOwnedAtlasCollection, isAtlasAuthorBlocked } from "@/lib/atlas-db";
import { hasConfirmedPublicAuthor } from "@/lib/users-db";
import { processAtlasCollectionSubmission } from "@/lib/atlas/collection-submit-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  // Same consent gate as item publishing: the collection card carries the
  // author's name and avatar, so it may not go public before that identity
  // exists by the user's own choice.
  if (!(await hasConfirmedPublicAuthor(userId))) {
    return NextResponse.json(
      { error: "author_identity_required", message: "請先設定你的公開作者身分。" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const owned = await getOwnedAtlasCollection(params.id, userId);
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (owned.items.length === 0) {
    return NextResponse.json(
      { error: "empty_collection", message: "合集至少要有一個項目才能公開。" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
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
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
