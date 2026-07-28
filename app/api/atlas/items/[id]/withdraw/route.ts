// 取消公開 — the author pulling their own item back off the community wall.
//
// The counterpart to publish, and the reason it exists: before this, the only
// way to un-publish was to delete the card, which cascades atlas_saved_cards
// and destroys the review progress of everyone who saved it (scripts/migrate.ts
// → atlas_saved_cards.public_item_id ON DELETE CASCADE).
//
// Withdrawal is not moderation: it leaves no mark on the author and the item
// can be submitted again (AtlasReviewStatus.canSubmit accepts 'withdrawn').

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { withdrawAtlasPublicItem } from "@/lib/atlas-db";
import { removeAtlasPublicObjects } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 404 also covers an item under moderation takedown: that is not the
  // author's to reverse, and saying so would confirm the takedown.
  const result = await withdrawAtlasPublicItem(userId, params.id);
  if (!result.ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Best-effort: the row already says withdrawn, so a failed unlink leaves an
  // orphaned object rather than a still-public item. Never fails the request —
  // the user asked for it to stop being public, and it has.
  if (result.publicPath) {
    try {
      await removeAtlasPublicObjects([result.publicPath]);
    } catch (e) {
      console.error("[atlas/withdraw] public object unlink failed", e);
    }
  }

  return NextResponse.json(
    { ok: true, reviewStatus: "withdrawn" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
