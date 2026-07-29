// Pins the public bio: its text gate, and — the load-bearing one — that it is
// NOT covered by the rename cooldown.
//
// The cooldown exists because `handle`/`nickname` are joined live into the
// byline of everything the author ever published, so a rename rewrites history
// and "build a reputation, then switch to an ad" becomes a one-step move. A bio
// appears on exactly one page and rewrites no attribution. Folding it into the
// same lock would freeze someone's public identity for 30 days because they
// fixed a typo in their self-introduction — all cost, no protection.

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
  new URL("../app/api/users/public-author/route.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const setIdentity = fnBody(usersDb, "setPublicAuthorIdentity");

// MARK: - The cooldown exemption

test("the rename check compares only the handle and display name", () => {
  const isRename = setIdentity.slice(
    setIdentity.indexOf("const isRename"),
    setIdentity.indexOf("if (isRename)"),
  );
  assert.match(isRename, /current\.username !== handle/);
  assert.match(isRename, /current\.nickname \?\? ""\) !== displayName/);
  // The whole point: a bio edit must not read as a rename.
  assert.doesNotMatch(isRename, /bio/);
});

test("the cooldown stamp is tied to the rename, not to the write", () => {
  assert.match(setIdentity, /const stamp = isRename \? sql`, public_identity_changed_at = now\(\)`/);
});

test("the bio is still written by the same call", () => {
  assert.match(setIdentity, /bio = \$\{fields\.bio\}/);
});

// undefined vs null is the difference between "don't touch it" and "clear it".
// Collapsing them would make deleting a bio impossible.
test("an absent bio leaves the column alone, an explicit null clears it", () => {
  assert.match(setIdentity, /fields\.bio !== undefined \? sql`, bio = /);
  assert.match(route, /nextBio = trimmedBio === "" \? null : trimmedBio/);
});

// MARK: - The text gate

test("a clean bio passes the gate", () => {
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
// PII, both of which a bio must not carry at all, so there is no verdict a
// human reviewer could reach that this check cannot. A queue would also mean
// building a review surface for one line of text.
test("a rejected bio is refused outright, not held for review", () => {
  assert.match(route, /error: "bio_rejected"/);
  assert.match(route, /status: 400/);
  // No pending/review state anywhere in this route.
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
  // Sent down in the identity payload so the client counter cannot promise a
  // length the route then rejects.
  assert.match(route, /bioMax: PUBLIC_BIO_MAX/);
  assert.match(route, /trimmedBio\.length > PUBLIC_BIO_MAX/);
});

test("the bio is returned so the sheet edits the live value, not a blank", () => {
  assert.match(route, /bio: profile\.bio \?\? ""/);
});
