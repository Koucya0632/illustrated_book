// 自製圖鑑 cards tagged to a 景點 (parent repo CONTEXT.md「景點」, docs/adr/0002).
//
// A card is tagged by where its photo was taken, not by what it shows. The
// server only ever sees the spot id: the iOS app matches a photo's own GPS to
// a spot on the device, and everyone else picks one by hand. These are the
// rules both the confirm and the card page's spot route apply.
//
//   - A card may sit at a spot only in its own language: Japan's spots take
//     Japanese cards.
//   - Tagging is private. Others see the card at the spot only when it is
//     public on 物見 AND the owner opted in (`spot_shared`).
//   - After an admin upholds a 「不是在這裡拍的」 report the card may not be
//     shared to that spot again (`spot_share_revoked`).
//
// No "server-only": the routes and the Postgres tests both import it.

import {
  TRAVEL_DESTINATIONS,
  allTravelSpots,
  destinationOfSpot,
  type SpotGeo,
  type TravelDestination,
  type TravelSpot,
} from "./destinations";

/** The spot a card in `targetLanguage` may be tagged to, or null. */
export function spotForCard(
  spotId: string,
  targetLanguage: string,
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): TravelSpot | null {
  const destination = destinationOfSpot(spotId, destinations);
  if (!destination || destination.language !== targetLanguage) return null;
  return allTravelSpots([destination]).find((s) => s.id === spotId) ?? null;
}

/** The columns these rules read off `user_atlas_items`. */
export interface SpotTagState {
  visibility: string;
  review_status: string;
  spot_id: string | null;
  spot_share_revoked: string | null;
}

/** Submitted to 物見 and not refused, withdrawn or taken down. */
const SHAREABLE_REVIEW = new Set(["pending", "pending_auto", "pending_review", "approved"]);

/** An admin took it off this very spot; it may not be put back. */
export function spotShareBlocked(item: Pick<SpotTagState, "spot_id" | "spot_share_revoked">): boolean {
  return item.spot_id !== null && item.spot_share_revoked === item.spot_id;
}

/** Whether the owner may share the card to the spot it carries. */
export function canShareToSpot(item: SpotTagState): boolean {
  return (
    item.spot_id !== null &&
    item.visibility === "public" &&
    SHAREABLE_REVIEW.has(item.review_status) &&
    !spotShareBlocked(item)
  );
}

/** The body of PUT /api/atlas/items/[id]/spot, or null when it is not one. */
export function parseSpotUpdate(body: unknown): { spotId: string; shared: boolean } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { spotId, shared } = body as Record<string, unknown>;
  if (typeof spotId !== "string" || !spotId.trim() || spotId.length > 64) return null;
  if (shared !== undefined && typeof shared !== "boolean") return null;
  return { spotId: spotId.trim(), shared: shared === true };
}

/** Great-circle distance in metres. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The spot a point falls in, for a card in `targetLanguage`. The server never
 * receives a point; this is the reference for the rule the iOS app runs on the
 * device, pinned by tests so the two agree.
 */
export function spotAt(
  point: { lat: number; lng: number },
  targetLanguage: string,
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): TravelSpot | null {
  let best: { spot: TravelSpot; distance: number } | null = null;
  for (const d of destinations) {
    if (d.language !== targetLanguage) continue;
    for (const spot of allTravelSpots([d])) {
      const distance = distanceMeters(point, spot.geo);
      if (distance <= spot.geo.radiusM && (!best || distance < best.distance)) best = { spot, distance };
    }
  }
  return best?.spot ?? null;
}

export type { SpotGeo };
