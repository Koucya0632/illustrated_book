import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("collection membership is keyed by the confirmed source item", () => {
  const migration = read("scripts/migrate.ts");
  const db = read("lib/atlas-db.ts");
  assert.match(migration, /source_item_id UUID REFERENCES user_atlas_items/);
  assert.match(migration, /PRIMARY KEY \(collection_id, source_item_id\)/);
  assert.match(db, /img\.status IN \('confirmed', 'cards_ready'\)/);
  assert.match(db, /i\.review_status NOT IN \('rejected', 'takedown'\)/);
});

test("collection publication has one all-member transaction gate", () => {
  const db = read("lib/atlas-db.ts");
  const route = read("app/api/atlas/collections/[id]/publish/route.ts");
  assert.match(db, /publishAtlasCollectionAtomically/);
  assert.match(db, /blocked_count > 0/);
  assert.match(db, /content_review_approved_at IS NOT NULL/);
  assert.ok(
    db.indexOf("if (!collectionGate?.content_ready) return null") <
      db.indexOf("INSERT INTO atlas_public_items", db.indexOf("publishAtlasCollectionAtomically")),
    "collection content must be approved before any public rows are written",
  );
  assert.match(db, /WHERE ci\.source_item_id = pi\.source_item_id\s+AND pi\.review_status = 'approved'/);
  assert.match(route, /deferPublication: true/);
  assert.match(route, /problemItemIds/);
});

test("owner APIs expose status and signed preview, never a private path", () => {
  const candidates = read("app/api/atlas/collections/candidates/route.ts");
  const edit = read("app/api/atlas/collections/[id]/route.ts");
  assert.match(candidates, /publicationState/);
  assert.match(edit, /publicationState/);
  assert.doesNotMatch(candidates, /thumb_path:/);
  assert.doesNotMatch(edit, /thumb_path:/);
});
