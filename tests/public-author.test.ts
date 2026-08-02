// Pins the public author projection (lib/public-author.ts).
//
// ⚠️ Two assertions in the previous version of this file said the OPPOSITE of
// what is pinned below, and they were not wrong then:
//
//   - "an unconfirmed author is anonymous, however complete the profile is"
//   - "a missing display name never falls back to the handle"
//
// Both guarded one hazard: `profiles.username` defaulted to the email local
// part and `profiles.nickname` was silently seeded from the Apple Sign-In full
// name, so naming someone — or falling back to their handle — could publish
// personal data they never offered. The rules were the containment, not the
// cure.
//
// The hazard itself is now removed, in the same change that relaxed these
// rules: the handle is a machine-minted `TJ`+8 UID assigned at signup and never
// derived from user input, and the Apple seeding is deleted with every
// unconsented nickname wiped. A UID discloses nothing, so falling back to it
// discloses nothing. Relaxing these rules WITHOUT that removal would reopen the
// leak exactly — which is why the tests at the bottom pin the UID's shape as
// hard as these once pinned anonymity.

import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_UID_DIGITS,
  isValidPublicUid,
  mintPublicUid,
  projectAuthorIdentity,
  publicAuthor,
} from "../lib/public-author";

const author = {
  author_username: "TJ00000042",
  author_nickname: "Mika",
  author_avatar: "face",
};

// MARK: - Projection

test("an author serializes handle, display name and avatar", () => {
  assert.deepEqual(publicAuthor(author), {
    handle: "TJ00000042",
    displayName: "Mika",
    avatar: "face",
  });
});

// This is the rule that inverted. It is safe now because the handle carries no
// personal information — and only because of that.
test("a missing display name falls back to the UID rather than to anonymity", () => {
  assert.equal(publicAuthor({ ...author, author_nickname: null })?.displayName, "TJ00000042");
  assert.equal(publicAuthor({ ...author, author_nickname: "   " })?.displayName, "TJ00000042");
});

// The only remaining reason there is nobody to name: the account was deleted,
// so the LEFT JOIN produced no profile row. Callers must still render it.
test("a missing handle is the one anonymous case left", () => {
  assert.equal(publicAuthor({ ...author, author_username: null }), null);
  assert.equal(publicAuthor({ ...author, author_username: "  " }), null);
});

test("a blank avatar projects to the one default black cat", () => {
  assert.equal(publicAuthor({ ...author, author_avatar: null })?.avatar, "face");
  assert.equal(publicAuthor({ ...author, author_avatar: "wave" })?.avatar, "face");
});

test("the complete projection trims nickname and never needs an email fallback", () => {
  assert.deepEqual(
    projectAuthorIdentity({
      username: "TJ00000042",
      nickname: "  Mika  ",
      avatar: null,
      bio: "  喜歡拍招牌  ",
    }),
    {
      handle: "TJ00000042",
      displayName: "Mika",
      avatar: "face",
      bio: "喜歡拍招牌",
      joinedAt: null,
      publishedCount: 0,
      saveCount: 0,
    },
  );
});

test("handles are trimmed of surrounding whitespace", () => {
  assert.equal(publicAuthor({ ...author, author_username: " TJ00000042 " })?.handle, "TJ00000042");
});

// MARK: - UID shape
//
// The fallback above is only safe while the handle is machine-minted. These
// tests are what stops it drifting back toward anything user-supplied.

test("a UID is TJ plus exactly 8 digits", () => {
  assert.equal(isValidPublicUid("TJ00000042"), true);
  assert.equal(isValidPublicUid("TJ99999999"), true);
  // Too short / too long — a fixed width is what makes the format checkable.
  assert.equal(isValidPublicUid("TJ0000042"), false);
  assert.equal(isValidPublicUid("TJ000000421"), false);
  // Lowercase prefix, missing prefix, or a suffix appended by a naive
  // collision-resolver — all must fail, or the format promise is empty.
  assert.equal(isValidPublicUid("tj00000042"), false);
  assert.equal(isValidPublicUid("00000042"), false);
  assert.equal(isValidPublicUid("TJ00000042-2"), false);
  // Nothing that would need escaping in a URL path, and nothing resembling the
  // old email-derived handles.
  assert.equal(isValidPublicUid("TJ0000004a"), false);
  assert.equal(isValidPublicUid("rex0632"), false);
  assert.equal(isValidPublicUid("tuji-8f3a2c1d9b4e"), false);
});

test("minted UIDs are always valid, including at the boundaries", () => {
  assert.equal(mintPublicUid(() => 0), `TJ${"0".repeat(PUBLIC_UID_DIGITS)}`);
  // Math.random() is [0,1), so this is the largest value reachable.
  assert.equal(mintPublicUid(() => 0.99999999999), "TJ99999999");
  for (let i = 0; i < 200; i++) {
    assert.equal(isValidPublicUid(mintPublicUid()), true);
  }
});

// Zero-padding is the whole reason the width is fixed; without it a small
// random draw would produce TJ42 and fail every reader's validation.
test("small draws are zero-padded, not truncated", () => {
  assert.equal(mintPublicUid(() => 42 / 10 ** PUBLIC_UID_DIGITS), "TJ00000042");
});
