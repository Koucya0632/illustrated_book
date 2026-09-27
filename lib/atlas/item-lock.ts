// Which 自製圖鑑 items are locked because the account is over its slot cap
// (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §4). Pure, so the rule is testable.
//
// Decided 2026-09-27: keep the most recent N automatically, lock the rest,
// delete nothing; a picker for "which N" waits until someone actually exceeds
// the cap. v2 only. A lifetime member inside the 30 days after Pro ended keeps
// everything usable (only adding is capped, by the capacity gate).
//
// Locked means: out of the study queue and stats, refused on answer / edit /
// card generation / 補充 / publish. Still listed and readable, still deletable —
// the user must be able to see what they have and clear space.

import type { MembershipPolicy, MembershipTier } from "@/lib/atlas/membership";

export interface ItemLockAccess {
  policy: MembershipPolicy;
  tier: MembershipTier;
  graceActive: boolean;
  /** The slot cap in force (limitsFor(tier, policy).atlasSlotsLimit). */
  keep: number;
}

/**
 * `idsNewestFirst` must be ordered by creation time, newest first. By creation,
 * not by recent use: a use-based order would make locked items rotate every
 * time the user studies.
 */
export function atlasItemsToLock(access: ItemLockAccess, idsNewestFirst: readonly string[]): string[] {
  if (access.policy !== "v2") return [];
  if (access.tier === "pro") return [];
  if (access.tier === "lifetime" && access.graceActive) return [];
  return idsNewestFirst.slice(Math.max(0, access.keep));
}
