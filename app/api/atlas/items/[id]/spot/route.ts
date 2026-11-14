// 景點 on a 自製圖鑑 card — the card page's 「選景點」 and 「放到景點頁」.
//
// PUT tags the card to a spot and says whether it is shared there; DELETE takes
// the tag off. The rules live in lib/travel/spot-tagging.ts: a card sits only
// at a spot in its own language, sharing needs the card public on 物見, and a
// spot an admin removed it from stays closed to it. The confirm can also tag a
// card, from the photo's own location matched on the device.
//
// Sharing is a 物見 write and needs membership; tagging privately and taking
// the tag off are housekeeping and never do.

import { NextResponse } from "next/server";
import { communityWriteRefusal } from "@/lib/atlas/community-gate";
import { getCurrentUserId } from "@/lib/current-user";
import { getOwnedAtlasItemForSpot, isAtlasAuthorBlocked, setAtlasItemSpot } from "@/lib/atlas-db";
import { canShareToSpot, parseSpotUpdate, spotForCard, spotShareBlocked } from "@/lib/travel/spot-tagging";
import type { AtlasItemRow } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** What the card page needs back; sync carries the same three fields. */
function spotView(item: AtlasItemRow) {
  const spotId = item.spot_id ?? null;
  return {
    spotId,
    spotShared: item.spot_shared ?? false,
    spotShareBlocked: spotShareBlocked({ spot_id: spotId, spot_share_revoked: item.spot_share_revoked ?? null }),
  };
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const update = parseSpotUpdate(raw);
  if (!update) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (update.shared) {
    const membershipRefusal = await communityWriteRefusal(userId);
    if (membershipRefusal) return membershipRefusal;
    if (await isAtlasAuthorBlocked(userId)) {
      return NextResponse.json({ error: "publishing_restricted" }, { status: 403, headers: PRIVATE });
    }
  }

  const item = await getOwnedAtlasItemForSpot(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const spot = spotForCard(update.spotId, item.target_language);
  if (!spot) return NextResponse.json({ error: "spot_not_allowed" }, { status: 422, headers: PRIVATE });

  if (update.shared) {
    const after = {
      visibility: item.visibility,
      review_status: item.review_status,
      spot_id: spot.id,
      spot_share_revoked: item.spot_share_revoked ?? null,
    };
    if (!canShareToSpot(after)) {
      return NextResponse.json(
        { error: spotShareBlocked(after) ? "spot_share_blocked" : "not_public" },
        { status: 409, headers: PRIVATE },
      );
    }
  }

  const saved = await setAtlasItemSpot({ userId, itemId: item.id, spotId: spot.id, shared: update.shared });
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ item: spotView(saved) }, { headers: PRIVATE });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const saved = await setAtlasItemSpot({ userId, itemId: params.id, spotId: null, shared: false });
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ item: spotView(saved) }, { headers: PRIVATE });
}
