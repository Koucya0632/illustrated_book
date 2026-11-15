// The 物見 lifecycle's rules, once (lib/atlas/publication.ts applies them).
//
// What an author may do with their own item or 合集 depends only on where it
// sits in review. These are the same sets iOS `AtlasReviewStatus.canSubmit` /
// `canWithdraw` draw buttons from; the server enforces them, because the client
// is not the enforcement point.
//
//   - Submit from draft / rejected / withdrawn. Anything in review stays there
//     until it is decided, so an item reports pulled back (pending_review) is
//     not the author's to put back up.
//   - Withdraw only what is live (approved). A takedown is moderation's and final.
//
// No I/O: tests and every caller ask these directly.

import type { AtlasCollectionReviewStatus, AtlasReviewStatus } from "./types";

type Status = AtlasReviewStatus | AtlasCollectionReviewStatus | string;

const SUBMITTABLE = new Set<Status>(["draft", "rejected", "withdrawn"]);

/** The author may hand it to the gate (item or 合集). */
export function canSubmit(status: Status): boolean {
  return SUBMITTABLE.has(status);
}

/** The author may take it off 物見 (item or 合集). */
export function canWithdraw(status: Status): boolean {
  return status === "approved";
}

/** Moderation removed it for good. */
export function isFinal(status: Status): boolean {
  return status === "takedown";
}

/** The 景點 a public row shows its card at: only while shared and not taken off that spot. */
export function sharedSpotOf(item: {
  spot_id?: string | null;
  spot_shared?: boolean | null;
  spot_share_revoked?: string | null;
}): string | null {
  const spot = item.spot_id ?? null;
  return spot && item.spot_shared && item.spot_share_revoked !== spot ? spot : null;
}
