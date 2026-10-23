// The official-atlas study gate (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §3).
//
// Under policy v2 a signed-in non-member may learn and review only the free
// series below, and their 自製圖鑑 / saved 物見 cards stay out of the queue.
// Members, and everyone under v1, are untouched. Browsing (definitions,
// examples, audio) is never gated here — only study.
//
// Layered on top of resolveQueueThemeScope rather than folded into it: that
// module answers "which sources did the user pick", this one answers "which of
// those may this account study". The answer route asks canStudyCard, the same
// rule per card, so a stale client queue can't write progress the queue
// wouldn't have served.

import type { MembershipPolicy, MembershipTier } from "@/lib/atlas/membership";
import type { QueueThemeScope } from "@/lib/study-sources";

/**
 * Category ids (words.category), not word lists: newly published words join automatically.
 *
 * All of the 留學生 主題組合 plus the original two (ADR-0020). Kept as its own list,
 * not derived from the preset: what is free is pricing, what is in a preset is
 * curation. Removing a theme from here takes its learned words out of a
 * non-member's reviews too.
 */
export const FREE_STUDY_CATEGORIES: readonly string[] = [
  "fruits",
  "bedroom",
  "campus",
  "identity-documents",
  "bank",
  "postal-services",
  "station-commuting",
  "convenience-store",
];

export interface StudyAccess {
  tier: MembershipTier;
  policy: MembershipPolicy;
}

function gated(access: StudyAccess): boolean {
  return access.policy === "v2" && access.tier === "free";
}

export function applyMembershipStudyScope(scope: QueueThemeScope, access: StudyAccess): QueueThemeScope {
  if (!gated(access)) return scope;
  // An empty publicCategories means "every category" to fetchDue — it must be
  // replaced by the whitelist, never passed through.
  const allowed =
    scope.publicCategories.length === 0
      ? [...FREE_STUDY_CATEGORIES]
      : scope.publicCategories.filter((c) => FREE_STUDY_CATEGORIES.includes(c));
  return {
    publicCategories: allowed,
    wantsCustom: false,
    wantsCommunity: false,
    shouldFetchPublic: scope.shouldFetchPublic && allowed.length > 0,
  };
}

/**
 * What a client should present as studyable, so locked themes can show a lock
 * instead of an empty queue. The same whitelist the gate enforces; null means
 * "every category" (members, and everyone under v1).
 */
export function studyableCategories(access: StudyAccess): readonly string[] | null {
  return gated(access) ? FREE_STUDY_CATEGORIES : null;
}

export function canStudyCard(
  access: StudyAccess,
  card: { source: "public"; category: string | null } | { source: "custom" | "community" },
): boolean {
  if (!gated(access)) return true;
  if (card.source !== "public") return false;
  return card.category !== null && FREE_STUDY_CATEGORIES.includes(card.category);
}
