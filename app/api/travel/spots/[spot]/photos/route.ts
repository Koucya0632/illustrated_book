// 「大家拍的」 at a 景點: approved 物見 cards their owners chose to share there
// (lib/travel/spot-tagging.ts). Public and CDN-cached like the other 物見
// reads — the same payload for everyone — so a client drops its own cards and
// authors it blocked itself. A short edge TTL, so an admin removing a card from
// a spot shows within minutes.

import { NextResponse } from "next/server";
import { listAtlasPublicItemsAtSpot } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";
import { findTravelSpot } from "@/lib/travel/destinations";

export const runtime = "nodejs";

export async function GET(_req: Request, props: { params: Promise<{ spot: string }> }) {
  const { spot: spotId } = await props.params;
  const spot = findTravelSpot(spotId);
  if (!spot) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await listAtlasPublicItemsAtSpot(spot.id, 24);
  return NextResponse.json(
    { spot: spot.id, items: rows.map(serializeAtlasPublicItem) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
