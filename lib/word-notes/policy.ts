// 個人筆記 — who may do what (docs/MEMBERSHIP_TIER_STATUS.md §6 1.2).
//
// THE RULES:
//   - v1: the feature does not exist (new member benefits are v2-only).
//   - v2 member: read, write, delete.
//   - v2 non-member (including after a refund): read and delete what they
//     already wrote — data does not disappear with a downgrade — but not write.

import type { MembershipPolicy, MembershipTier } from "@/lib/atlas/membership";
import { upgradeTarget } from "@/lib/atlas/membership-limits";

export const WORD_NOTE_MAX = 500;

export interface WordNoteAccess {
  tier: MembershipTier;
  policy: MembershipPolicy;
}

export type WordNoteRefusal = {
  status: 402 | 404;
  error: "not_available" | "membership_required";
  upgradeTo: MembershipTier | null;
};

export function wordNotesAvailable(access: WordNoteAccess): boolean {
  return access.policy === "v2";
}

export function canWriteWordNotes(access: WordNoteAccess): boolean {
  return wordNotesAvailable(access) && access.tier !== "free";
}

/** Read and delete: only the feature has to exist. */
export function checkKeepNote(access: WordNoteAccess): WordNoteRefusal | null {
  return wordNotesAvailable(access) ? null : { status: 404, error: "not_available", upgradeTo: null };
}

export function checkWriteNote(access: WordNoteAccess): WordNoteRefusal | null {
  const keep = checkKeepNote(access);
  if (keep) return keep;
  if (access.tier === "free") {
    return { status: 402, error: "membership_required", upgradeTo: upgradeTarget(access.tier, access.policy) };
  }
  return null;
}

/** Trimmed body, or null when empty or over the limit (in characters). */
export function normalizeWordNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  if (body.length === 0 || [...body].length > WORD_NOTE_MAX) return null;
  return body;
}
