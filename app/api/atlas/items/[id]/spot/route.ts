// 景點 on a 自製圖鑑 card — the card page's 「選景點」 and 「放到景點頁」.
//
// PUT tags the card to a spot and says whether it is shared there; DELETE takes
// the tag off. The rules are the publication lifecycle's (lib/atlas/publication.ts,
// `shareToSpot`): a card sits only at a spot in its own language, sharing needs
// the card public on 物見, and a spot an admin removed it from stays closed to it.
//
// Sharing is a 物見 write and needs membership; tagging privately and taking
// the tag off are housekeeping and never do.

import { NextResponse } from "next/server";
import { communityWriteRefusal } from "@/lib/atlas/community-gate";
import { getCurrentUserId } from "@/lib/current-user";
import { atlasPublication } from "@/lib/atlas/publication-live";
import type { Refusal } from "@/lib/atlas/publication";
import { isUuid } from "@/lib/http/ids";
import { parseSpotUpdate } from "@/lib/travel/spot-tagging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

function refused(reason: Refusal): Response {
  switch (reason) {
    case "restricted":
      return NextResponse.json({ error: "publishing_restricted" }, { status: 403, headers: PRIVATE });
    case "spot_not_allowed":
      return NextResponse.json({ error: "spot_not_allowed" }, { status: 422, headers: PRIVATE });
    case "not_public":
    case "spot_share_blocked":
      return NextResponse.json({ error: reason }, { status: 409, headers: PRIVATE });
    default:
      return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

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
  }

  const result = await atlasPublication().shareToSpot(userId, params.id, update.spotId, update.shared);
  if (!result.ok) return refused(result.reason);
  return NextResponse.json({ item: result.spot }, { headers: PRIVATE });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await atlasPublication().shareToSpot(userId, params.id, null, false);
  if (!result.ok) return refused(result.reason);
  return NextResponse.json({ item: result.spot }, { headers: PRIVATE });
}
