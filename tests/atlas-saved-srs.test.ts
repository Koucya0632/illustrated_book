// Pins the saved-community SRS integration (docs/COMMUNITY_ATLAS_PLAN.md).
//
// The structural guarantee: a saved community item studies through
// atlas_saved_cards, never through user_atlas_items / user_atlas_cards. That is
// what keeps studying other people's content off the creation quota — it is a
// property of *where the rows live*, not of a filter someone must remember.
//
// These tests read the source to assert those structural facts, because the
// queries themselves need a database to exercise.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { categories } from "../lib/categories";

const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const queueRoute = readFileSync(
  new URL("../app/api/study/queue/route.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("saving materialises the item's SRS rows so it enters the queue", () => {
  const body = fnBody(atlasDb, "saveAtlasPublicItem");
  assert.match(body, /INSERT INTO atlas_saves/);
  assert.match(body, /INSERT INTO atlas_saved_cards/);
});

test("unsaving removes the review progress with the save", () => {
  const body = fnBody(atlasDb, "unsaveAtlasPublicItem");
  assert.match(body, /DELETE FROM atlas_saved_cards/);
  assert.match(body, /DELETE FROM atlas_saves/);
});

// THE RED LINE, structurally: the save/study path must not write to the tables
// that back the creation quota.
test("the saved-item study path never touches the user's own item tables", () => {
  for (const name of [
    "saveAtlasPublicItem",
    "unsaveAtlasPublicItem",
    "fetchSavedCommunityDue",
    "recordSavedCommunityReview",
    "savedCommunityStats",
  ]) {
    const body = fnBody(atlasDb, name);
    assert.doesNotMatch(
      body,
      /user_atlas_items|user_atlas_cards|user_atlas_card_state/,
      `${name} must not read or write the user's own 圖鑑 tables`,
    );
  }
});

test("taken-down items stop appearing in study immediately", () => {
  for (const name of ["fetchSavedCommunityDue", "savedCommunityStats"]) {
    assert.match(
      fnBody(atlasDb, name),
      /review_status = 'approved'/,
      `${name} must only serve approved public items`,
    );
  }
});

test("the community theme is opt-in, unlike custom", () => {
  // custom joins the queue when no public theme is selected; community must
  // require an explicit selection so an empty theme never appears.
  assert.match(
    queueRoute,
    /const wantsCustom = categories\.includes\("custom"\) \|\| publicCategories\.length === 0;/,
  );
  assert.match(
    queueRoute,
    /const wantsCommunity = categories\.includes\("community"\);/,
  );
});

test("community is a selectable theme and excluded from public category filters", () => {
  const ids = categories.map((c) => c.id);
  assert.ok(ids.includes("community"), "community must be a pickable theme");
  assert.match(
    queueRoute,
    /category !== "custom" && category !== "community"/,
    "synthetic themes must not be passed to the words.category filter",
  );
});
