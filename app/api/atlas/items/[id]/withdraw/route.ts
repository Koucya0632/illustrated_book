// 取消公開 — the author pulling their own live item back off the community wall.
//
// The counterpart to publish, and the reason it exists: before this, the only
// way to un-publish was to delete the card, which cascades atlas_saved_cards
// and destroys the review progress of everyone who saved it.
//
// Withdrawal is not moderation: it leaves no mark on the author and the item
// can be submitted again. Only a live item can be withdrawn — one under review
// or taken down is not the author's to move (lib/atlas/publication.ts).

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { atlasPublication } from "@/lib/atlas/publication-live";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await atlasPublication().withdraw(userId, params.id);
  if (!result.ok) {
    return result.reason === "not_allowed"
      ? NextResponse.json({ error: "not_withdrawable" }, { status: 409, headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, reviewStatus: "withdrawn" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
