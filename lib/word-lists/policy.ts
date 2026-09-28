// 個人詞表 — who may do what (docs/MEMBERSHIP_TIER_STATUS.md §6 1.1).
//
// Pure, so every rule here is tested by calling it. The routes ask these and
// only these; the client shows what the server answers.
//
// THE RULES:
//   - v1: the feature does not exist. Every route answers not_available and the
//     app shows no entry point (decided 2026-09-28: new benefits are v2-only).
//   - v2 non-member: may read, reorder, remove words from and delete what they
//     already have (a refund must not destroy data), but not create, rename,
//     add, or study from a list.
//   - v2 member: up to `lists` lists and `words` words per list, by tier.
//   - Over the list cap after a downgrade, the first `lists` lists in the
//     user's own order stay usable and the rest are locked: kept, readable,
//     deletable, not editable or studyable. Reordering is how a person chooses
//     which ones stay, so reordering is never gated.
//   - Over the word cap after a downgrade, a list stays studyable; it only
//     stops accepting words.

import type { MembershipPolicy, MembershipTier } from "@/lib/atlas/membership";
import { upgradeTarget } from "@/lib/atlas/membership-limits";

export interface WordListLimits {
  lists: number;
  words: number;
}

export const WORD_LIST_LIMITS: Record<MembershipTier, WordListLimits> = {
  free: { lists: 0, words: 0 },
  lifetime: { lists: 20, words: 500 },
  pro: { lists: 100, words: 2000 },
};

export const WORD_LIST_NAME_MAX = 40;

export interface WordListAccess {
  tier: MembershipTier;
  policy: MembershipPolicy;
}

export function wordListsAvailable(access: WordListAccess): boolean {
  return access.policy === "v2";
}

export function wordListLimits(access: WordListAccess): WordListLimits {
  return { ...WORD_LIST_LIMITS[access.tier] };
}

/** Ids past the list cap, given the lists in the user's order. */
export function lockedWordListIds(orderedIds: readonly string[], access: WordListAccess): string[] {
  return orderedIds.slice(wordListLimits(access).lists);
}

export type WordListRefusal = {
  status: 402 | 404 | 429;
  error: "not_available" | "membership_required" | "word_list_limit" | "word_limit" | "word_list_locked";
  upgradeTo: MembershipTier | null;
};

function refuse(
  access: WordListAccess,
  error: WordListRefusal["error"],
): WordListRefusal {
  if (error === "not_available") return { status: 404, error, upgradeTo: null };
  const upgradeTo = upgradeTarget(access.tier, access.policy);
  // Pro at its ceiling: upgrading won't help, so no paywall.
  return { status: upgradeTo ? 402 : 429, error, upgradeTo };
}

export function checkCreateList(access: WordListAccess, currentCount: number): WordListRefusal | null {
  if (!wordListsAvailable(access)) return refuse(access, "not_available");
  if (access.tier === "free") return refuse(access, "membership_required");
  if (currentCount >= wordListLimits(access).lists) return refuse(access, "word_list_limit");
  return null;
}

/** Rename. */
export function checkEditList(access: WordListAccess, locked: boolean): WordListRefusal | null {
  if (!wordListsAvailable(access)) return refuse(access, "not_available");
  if (access.tier === "free") return refuse(access, "membership_required");
  if (locked) return refuse(access, "word_list_locked");
  return null;
}

export function checkAddWord(
  access: WordListAccess,
  locked: boolean,
  currentWords: number,
): WordListRefusal | null {
  const edit = checkEditList(access, locked);
  if (edit) return edit;
  if (currentWords >= wordListLimits(access).words) return refuse(access, "word_limit");
  return null;
}

export function checkStudyList(access: WordListAccess, locked: boolean): WordListRefusal | null {
  return checkEditList(access, locked);
}

/** Read, reorder, remove a word, delete a list: only the feature has to exist. */
export function checkKeepList(access: WordListAccess): WordListRefusal | null {
  return wordListsAvailable(access) ? null : refuse(access, "not_available");
}

/** Trimmed name, or null when empty or too long. */
export function normalizeWordListName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length === 0 || [...name].length > WORD_LIST_NAME_MAX) return null;
  return name;
}
