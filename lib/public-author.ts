// What the community knows about an author. Pure on purpose (no server-only,
// no DB) so the rules are testable and there is exactly one place to read them.
//
// The identity model changed shape: `profiles.username` used to be a
// user-chosen handle that defaulted to the email local part, and `nickname` was
// silently seeded from the Apple Sign-In full name. Both were private fields
// that the community layer then wanted to publish, which is why there used to
// be a consent gate standing in front of every publish.
//
// Now the handle is a machine-minted UID — `TJ` + 8 digits, assigned at signup,
// never editable, carrying no personal information whatsoever. That single
// change is what retires the gate: there is nothing left to leak by naming
// someone, because the only name that can reach the wall is one they typed
// themselves into a field labelled 暱稱.
//
// It also makes the old "never fall back to the handle" rule obsolete. Falling
// back was forbidden because the handle used to be half of an email address;
// falling back to TJ00000042 discloses nothing.

import { publicAvatar } from "@/lib/avatars";

/**
 * Longest public 簽名 accepted. Short on purpose: this is a one-line self
 * introduction under a name on a profile card, not a page. It lives here rather
 * than in the route because a Next.js route module may only export the handler
 * names, and the iOS field needs the same number for its counter — the server
 * sends it down with the profile.
 */
export const PUBLIC_BIO_MAX = 80;

/** Public UID shape: `TJ` followed by exactly 8 digits, zero-padded. */
export const PUBLIC_UID_PATTERN = /^TJ\d{8}$/;

/** How many digits follow the `TJ` prefix. 10^8 ≈ 100M addresses. */
export const PUBLIC_UID_DIGITS = 8;

export function isValidPublicUid(uid: string): boolean {
  return PUBLIC_UID_PATTERN.test(uid);
}

/**
 * Mint a UID. Random rather than sequential so the total user count and signup
 * order are not printed on everyone's profile, and so author pages cannot be
 * enumerated. Collisions are resolved by the caller re-rolling — never by
 * appending a suffix, which would produce a UID that fails the pattern above.
 */
export function mintPublicUid(random: () => number = Math.random): string {
  const max = 10 ** PUBLIC_UID_DIGITS;
  const n = Math.floor(random() * max);
  return `TJ${String(n).padStart(PUBLIC_UID_DIGITS, "0")}`;
}

/** Columns a query must join from `profiles` to describe an item's author. */
export interface PublicAuthorColumns {
  author_username: string | null;
  author_nickname: string | null;
  author_avatar: string | null;
}

export interface PublicAuthor {
  /** Stable link target: `/api/atlas/public/authors/{handle}`. The UID. */
  handle: string;
  /** Human-facing name. Falls back to the UID when the user never set one. */
  displayName: string;
  avatar: string;
}

/** The complete public identity returned by author-profile reads and edits. */
export interface AuthorIdentity extends PublicAuthor {
  bio: string;
  joinedAt: string | null;
  publishedCount: number;
  saveCount: number;
}

/** Authoritative profile columns before they cross the public interface. */
export interface AuthorIdentitySource {
  username: string;
  nickname: string | null;
  avatar: string | null;
  bio?: string | null;
  joinedAt?: string | null;
  publishedCount?: number;
  saveCount?: number;
}

/**
 * The one public identity projection. Routes and clients receive this result;
 * they never derive a display name, expose an email fallback, or choose an
 * avatar default independently.
 */
export function projectAuthorIdentity(source: AuthorIdentitySource): AuthorIdentity {
  const handle = source.username.trim();
  const nickname = source.nickname?.trim();
  return {
    handle,
    displayName: nickname ? nickname : handle,
    avatar: publicAvatar(source.avatar?.trim()),
    bio: source.bio?.trim() ?? "",
    joinedAt: source.joinedAt ?? null,
    publishedCount: source.publishedCount ?? 0,
    saveCount: source.saveCount ?? 0,
  };
}

/**
 * The author block for a public payload, or `null` when there is nobody to
 * name — which now means only one thing: the account was deleted, so the
 * LEFT JOIN produced no profile row. Callers must still render that case.
 *
 * The handle/displayName split matters: `attribution_name` used to be one
 * string doing both jobs, so an author link built from a display name 404'd.
 */
export function publicAuthor(row: PublicAuthorColumns): PublicAuthor | null {
  const handle = row.author_username?.trim();
  if (!handle) return null;
  const identity = projectAuthorIdentity({
    username: handle,
    nickname: row.author_nickname,
    avatar: row.author_avatar,
  });
  return { handle: identity.handle, displayName: identity.displayName, avatar: identity.avatar };
}
