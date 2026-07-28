// Pins 取消公開 — the author taking their own item off the wall.
//
// The distinction these tests defend: 'withdrawn' (the author's choice,
// reversible, no mark on their record) and 'takedown' (moderation's, final)
// are the same visible outcome and opposite meanings. Collapsing them would
// either let removed content back onto the wall or trap authors who changed
// their mind.
//
// Source-reading, like atlas-saved-srs.test.ts: the queries need a database to
// exercise, but the guarantees are properties of the SQL itself.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const withdrawRoute = readFileSync(
  new URL("../app/api/atlas/items/[id]/withdraw/route.ts", import.meta.url),
  "utf8",
);
const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const withdraw = fnBody(atlasDb, "withdrawAtlasPublicItem");
const submit = fnBody(atlasDb, "submitAtlasItemForReview");

test("withdrawal marks both tables withdrawn, never takedown", () => {
  assert.match(withdraw, /user_atlas_items[\s\S]*review_status = 'withdrawn'/);
  assert.match(withdraw, /atlas_public_items[\s\S]*review_status = 'withdrawn'/);
  assert.doesNotMatch(withdraw, /review_status = 'takedown'/);
});

// Every public read filters on 'approved', so flipping the status is what
// removes it from the wall, the word page and the study queue.
test("withdrawal flips status rather than deleting the row", () => {
  assert.doesNotMatch(withdraw, /DELETE FROM atlas_public_items/);
});

// The row carries other people's SRS state via ON DELETE CASCADE. Deleting the
// item — the only pre-existing way to un-publish — wipes their progress.
test("withdrawal never touches savers' cards", () => {
  assert.doesNotMatch(withdraw, /atlas_saved_cards/);
  assert.doesNotMatch(withdraw, /atlas_saves/);
});

// An author who fears a strike for withdrawing publishes less.
test("withdrawal leaves no mark on the author's moderation record", () => {
  assert.doesNotMatch(withdraw, /user_moderation_state/);
  assert.doesNotMatch(withdraw, /recordAtlasModerationEvent/);
});

test("withdrawal is refused for an item under moderation takedown", () => {
  assert.match(withdraw, /review_status <> 'takedown'/);
  assert.match(withdraw, /user_id = \$\{userId\}::uuid/);
});

// SET image_public_path = NULL ... RETURNING would hand back the new value, so
// the object would never be unlinked and the photo would stay fetchable.
test("the public image path is read before it is cleared, then unlinked", () => {
  const select = withdraw.indexOf("SELECT image_public_path");
  const update = withdraw.indexOf("image_public_path = NULL");
  assert.ok(select !== -1 && update !== -1 && select < update);
  assert.match(withdrawRoute, /removeAtlasPublicObjects/);
});

test("a moderation takedown cannot be re-submitted, a withdrawal can", () => {
  assert.match(submit, /review_status <> 'takedown'/);
  assert.doesNotMatch(submit, /review_status <> 'withdrawn'/);
});

test("both review_status constraints accept withdrawn", () => {
  assert.match(
    migrate,
    /atlas_public_items[\s\S]*?CHECK \(review_status IN \('approved','takedown','withdrawn'\)\)/,
  );
  assert.match(migrate, /'approved','rejected','takedown','withdrawn'/);
});

// A name-only guard would skip every database migrated before 'withdrawn'
// existed, leaving the constraint too narrow and every withdrawal failing.
test("the constraint swap is guarded on the definition, not the name", () => {
  assert.match(migrate, /pg_get_constraintdef\(oid\) LIKE '%withdrawn%'/);
});
