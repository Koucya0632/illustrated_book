// Pins the public author projection (lib/public-author.ts).
//
// These rules exist because `username` and `nickname` were private fields —
// a handle that defaulted to the email local part, and an in-app greeting
// seeded silently from the Apple Sign-In full name. Every assertion below is a
// leak that shipped code used to allow.

import assert from "node:assert/strict";
import test from "node:test";
import { isValidPublicHandle, publicAuthor } from "../lib/public-author";

const confirmed = {
  author_username: "mika_k",
  author_nickname: "Mika",
  author_avatar: "face",
  author_confirmed_at: "2026-07-29T00:00:00.000Z",
};

test("a confirmed author serializes handle, display name and avatar", () => {
  assert.deepEqual(publicAuthor(confirmed), {
    handle: "mika_k",
    displayName: "Mika",
    avatar: "face",
  });
});

// The consent gate. Without it, every account that ever signed in with Apple
// would publish under its real name.
test("an unconfirmed author is anonymous, however complete the profile is", () => {
  assert.equal(publicAuthor({ ...confirmed, author_confirmed_at: null }), null);
});

// The old `displayName: nickname ?? username` fallback is what put the email
// local part on screen as a name.
test("a missing display name never falls back to the handle", () => {
  assert.equal(publicAuthor({ ...confirmed, author_nickname: null }), null);
  assert.equal(publicAuthor({ ...confirmed, author_nickname: "   " }), null);
});

test("a missing handle is anonymous rather than an unlinkable name", () => {
  assert.equal(publicAuthor({ ...confirmed, author_username: null }), null);
});

test("a blank avatar is allowed and serializes as empty", () => {
  assert.equal(publicAuthor({ ...confirmed, author_avatar: null })?.avatar, "");
});

test("handles are trimmed of surrounding whitespace", () => {
  assert.equal(publicAuthor({ ...confirmed, author_username: " mika_k " })?.handle, "mika_k");
});

test("handle shape matches what the author route can look up", () => {
  assert.equal(isValidPublicHandle("mika_k"), true);
  assert.equal(isValidPublicHandle("tuji-8f3a2c1d9b4e"), true);
  assert.equal(isValidPublicHandle("a.b-c_d"), true);
  // Too short to be a real handle, and single characters collide constantly.
  assert.equal(isValidPublicHandle("a"), false);
  assert.equal(isValidPublicHandle(""), false);
  assert.equal(isValidPublicHandle("a".repeat(41)), false);
  // Anything that would need escaping in the URL path.
  assert.equal(isValidPublicHandle("mika k"), false);
  assert.equal(isValidPublicHandle("mika/k"), false);
  assert.equal(isValidPublicHandle("miká"), false);
});
