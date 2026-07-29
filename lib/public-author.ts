// What the community is allowed to know about an author, and what a handle is
// allowed to be. Pure on purpose (no server-only, no DB) so the rules are
// testable and there is exactly one place to read them.
//
// Background: `profiles.username` and `profiles.nickname` were built as private
// fields — a login handle that defaulted to the email local part, and an in-app
// greeting seeded silently from the Apple Sign-In full name. Publishing either
// without asking would put a real name or a piece of an email address on the
// community wall. So identity only leaves the server through `publicAuthor()`,
// and only for a user who confirmed it.

/** Longest handle accepted; the public author route matches this shape too. */
export const PUBLIC_HANDLE_MAX = 40;

/**
 * Longest public bio accepted. Short on purpose: this is a one-line self
 * introduction under a name on a profile card, not a page. It also lives here
 * rather than in the route because a Next.js route module may only export the
 * handler names, and the iOS sheet needs the same number for its counter — the
 * server sends it down in the identity payload.
 */
export const PUBLIC_BIO_MAX = 80;

const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{2,40}$/;

export function isValidPublicHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

/** Columns a query must join from `profiles` to describe an item's author. */
export interface PublicAuthorColumns {
  author_username: string | null;
  author_nickname: string | null;
  author_avatar: string | null;
  author_confirmed_at: string | null;
}

export interface PublicAuthor {
  /** Stable link target: `/api/atlas/public/authors/{handle}`. */
  handle: string;
  /** Human-facing name. Never falls back to the handle. */
  displayName: string;
  avatar: string;
}

/**
 * The author block for a public payload, or `null` when there is no confirmed
 * identity to show. Callers must render the null case as anonymous rather than
 * substituting a private field.
 *
 * The handle/displayName split matters: `attribution_name` used to be one
 * string doing both jobs, so an author link built from a display name 404'd.
 */
export function publicAuthor(row: PublicAuthorColumns): PublicAuthor | null {
  if (!row.author_confirmed_at) return null;
  const handle = row.author_username?.trim();
  const displayName = row.author_nickname?.trim();
  if (!handle || !displayName) return null;
  return { handle, displayName, avatar: row.author_avatar ?? "" };
}
