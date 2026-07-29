// Pins the rename cooldown on the public identity.
//
// Author identity is joined live, so a rename rewrites the byline on
// everything the author ever published — which makes "accumulate saves under a
// clean name, then switch to an ad" a single edit. The cooldown is what makes
// that slow instead of instant.
//
// Two properties matter more than the number of days:
//   1. BOTH write paths enforce it. `nickname` is the public display name once
//      confirmed, and it is editable from 編輯個人資料 as well as from the
//      公開作者身分 sheet — throttling one door only moves the abuse to the other.
//   2. It applies only to authors with approved public content. Someone with
//      nothing published has no reputation to launder and every reason to fix
//      a typo they just made.
//
// Source-reading, like atlas-withdraw.test.ts: the queries need a database.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const usersDb = readFileSync(new URL("../lib/users-db.ts", import.meta.url), "utf8");
const authorRoute = readFileSync(
  new URL("../app/api/users/public-author/route.ts", import.meta.url),
  "utf8",
);
const profileRoute = readFileSync(
  new URL("../app/api/users/profile/route.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const state = fnBody(usersDb, "publicIdentityRenameState");
const setIdentity = fnBody(usersDb, "setPublicAuthorIdentity");
const updateProfile = fnBody(usersDb, "updateProfile");

test("the cooldown only applies to authors with approved public content", () => {
  assert.match(state, /EXISTS \(/);
  assert.match(state, /atlas_public_items/);
  assert.match(state, /review_status = 'approved'/);
});

test("both write paths consult the cooldown", () => {
  assert.match(setIdentity, /publicIdentityRenameState/);
  assert.match(updateProfile, /publicIdentityRenameState/);
});

// The abuse is laundering a reputation, and the reputation is attached to the
// name people read — not to the handle in the URL.
test("the display name is throttled, not just the handle", () => {
  assert.match(setIdentity, /current\.nickname/);
  assert.match(updateProfile, /current\?\.nickname/);
});

// A user who re-saves the same values, or only swaps their mascot, has not
// renamed anything.
test("only an actual change starts a cooldown", () => {
  assert.match(setIdentity, /isRename/);
  assert.match(updateProfile, /isPublicRename/);
  assert.match(setIdentity, /const stamp = isRename \?/);
  assert.match(updateProfile, /const stamp = isPublicRename \?/);
});

// There was no public identity before the first confirmation, so accepting one
// is not a rename — otherwise every new author starts life in a cooldown.
test("the first confirmation is not a rename", () => {
  assert.match(setIdentity, /current\.confirmed &&/);
  assert.match(updateProfile, /Boolean\(current\?\.confirmed\) &&/);
});

// Avatar is one of six mascot poses; nothing to launder. It must not take part
// in deciding whether something was renamed.
test("the avatar is not throttled", () => {
  const decision = updateProfile
    .split("\n")
    .find((l) => l.includes("const isPublicRename"));
  assert.ok(decision, "isPublicRename should be computed on one line");
  assert.doesNotMatch(decision, /avatar/);
});

test("a refused rename is a 429 that says when it unlocks", () => {
  for (const route of [authorRoute, profileRoute]) {
    assert.match(route, /rename_cooldown/);
    assert.match(route, /status: 429/);
    assert.match(route, /nextChangeAt/);
  }
});

// The sheet should be able to explain the lock up front rather than letting
// someone retype their name and only then be refused.
test("the identity GET reports the lock state", () => {
  assert.match(authorRoute, /canChange: rename\.allowed/);
  assert.match(authorRoute, /nextChangeAt: rename\.nextChangeAt/);
});
