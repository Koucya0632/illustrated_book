// Pins the public 簽名: its text gate, and where it is edited.
//
// The previous version of this file spent most of its assertions proving the
// 簽名 was exempt from the 30-day rename cooldown. That cooldown no longer
// exists — an immutable UID anchors every author page, so changing a display
// name cannot launder an identity and there is nothing left to throttle. What
// survives is the gate, which is about content rather than identity.

// Source-reading for the DB layer: lib/users-db.ts is `server-only`, which
// throws outside a server component. The moderation helper is pure, so it is
// imported and actually run.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runAtlasTextModeration } from "../lib/atlas/moderation";
import { PUBLIC_BIO_MAX } from "../lib/public-author";

const usersDb = readFileSync(new URL("../lib/users-db.ts", import.meta.url), "utf8");
const route = readFileSync(
  new URL("../app/api/users/profile/route.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const updateProfile = fnBody(usersDb, "updateProfile");

// MARK: - The write path

// undefined vs null is the difference between "don't touch it" and "clear it".
// Collapsing them would make deleting a 簽名 impossible.
test("an absent bio leaves the column alone, an explicit null clears it", () => {
  assert.match(updateProfile, /fields\.bio !== undefined \? sql`, bio = /);
  assert.match(route, /nextBio = trimmedBio === "" \? null : trimmedBio/);
});

test("the same call writes nickname, avatar and bio", () => {
  assert.match(route, /updateProfile\(userId, \{ nickname: nick, avatar: pose, bio: nextBio \}\)/);
});

// The cooldown and the consent flag are gone; nothing may quietly reintroduce
// a throttle on an ordinary profile edit.
test("editing a profile is no longer rate-limited or gated", () => {
  assert.doesNotMatch(updateProfile, /cooldown|public_identity_changed_at|confirmed/i);
  assert.doesNotMatch(route, /cooldown|429|author_identity_required/i);
});

// MARK: - The text gate

test("a clean 簽名 passes the gate", () => {
  assert.equal(runAtlasTextModeration(["喜歡拍街上的招牌，慢慢學日文"]).length, 0);
});

test("links are caught — this is the anti-spam reason the gate exists", () => {
  assert.ok(runAtlasTextModeration(["follow me at https://example.com"]).length > 0);
  assert.ok(runAtlasTextModeration(["www.example.com"]).length > 0);
});

test("personal information is caught", () => {
  const hits = runAtlasTextModeration(["reach me at mika@example.com"]);
  assert.ok(hits.some((h) => h.category === "pii"));
});

// Rejected synchronously rather than queued: the gate only catches links and
// PII, both of which a 簽名 must not carry at all, so there is no verdict a
// human reviewer could reach that this check cannot.
test("a rejected 簽名 is refused outright, not held for review", () => {
  assert.match(route, /error: "bio_rejected"/);
  assert.match(route, /status: 400/);
  assert.doesNotMatch(route, /pending_review/);
});

test("the refusal says which rule was broken", () => {
  assert.match(route, /h\.category === "pii"/);
  assert.match(route, /個人資訊/);
  assert.match(route, /網址/);
});

// MARK: - Length

test("the length limit is shared with the client rather than duplicated", () => {
  assert.equal(PUBLIC_BIO_MAX, 80);
  assert.match(route, /trimmedBio\.length > PUBLIC_BIO_MAX/);
});
