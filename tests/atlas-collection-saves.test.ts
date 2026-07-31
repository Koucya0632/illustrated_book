// Pins collection bookmarks as a separate, non-study concept.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const shelfRoute = readFileSync(
  new URL("../app/api/atlas/public/collections/saved/route.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("collection bookmarks have their own unique join table", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS atlas_collection_saves/);
  assert.match(migration, /PRIMARY KEY \(user_id, collection_id\)/);
  assert.match(migration, /collection_id UUID NOT NULL REFERENCES atlas_collections\(id\) ON DELETE CASCADE/);
});

test("saving a collection cannot create cards or consume item-save capacity", () => {
  const save = fnBody(atlasDb, "saveAtlasPublicCollection");
  assert.match(save, /INSERT INTO atlas_collection_saves/);
  assert.doesNotMatch(save, /atlas_saves|atlas_saved_cards|user_atlas_items/);
});

test("collection cards count collection bookmarks, not member item saves", () => {
  const projection = atlasDb.slice(
    atlasDb.indexOf("const collectionCardSelect"),
    atlasDb.indexOf("// MARK: - Collections: author-side CRUD"),
  );
  assert.match(projection, /FROM atlas_collection_saves cs/);
  assert.doesNotMatch(projection, /JOIN atlas_saves/);
});

test("saved shelf is private, language-scoped and newest-save first", () => {
  const list = fnBody(atlasDb, "listSavedAtlasCollections");
  assert.match(list, /saved\.user_id = \$\{userId\}::uuid/);
  assert.match(list, /c\.target_language = \$\{targetLanguage\}/);
  assert.match(list, /c\.review_status = 'approved'/);
  assert.match(list, /ORDER BY saved\.created_at DESC/);
  assert.match(shelfRoute, /private, no-store/);
});

test("author impact includes item saves and collection saves", () => {
  const author = fnBody(atlasDb, "getAtlasAuthor");
  assert.match(author, /FROM atlas_saves item_saves/);
  assert.match(author, /FROM atlas_collection_saves collection_saves/);
});

test("batch learning is one capacity-checked transaction and creates both card types", () => {
  const batch = fnBody(atlasDb, "learnAtlasPublicCollectionItemsAtomically");
  assert.match(batch, /sql\.begin/);
  assert.match(batch, /pg_advisory_xact_lock/);
  assert.match(batch, /WITH eligible AS MATERIALIZED/);
  assert.match(batch, /current_usage/);
  assert.match(batch, /capacity_gate/);
  assert.match(batch, /WHERE gate\.allowed/);
  assert.match(batch, /INSERT INTO atlas_saves/);
  assert.match(batch, /INSERT INTO atlas_saved_cards/);
  assert.match(batch, /'image_recall'/);
  assert.match(batch, /'flashcard'/);
  assert.match(batch, /ON CONFLICT/);
});
