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
import { resolveQueueThemeScope } from "../lib/study-sources";

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

// These four used to be asserted by matching the route's source text against a
// regex. That can only ever report that nobody edited the line — never that the
// line is right — and it duly held a bug in place: `wantsCustom` tested
// `publicCategories.length === 0`, which is true whenever the only ticked themes
// are synthetic, so picking 物見 alone served the learner their own 自製圖鑑
// cards. The regex passed the whole time, because the characters had not moved.
test("custom joins only when ticked or when nothing is ticked", () => {
  const wantsCustom = (categories: string[]) =>
    resolveQueueThemeScope(categories, false).wantsCustom;

  assert.equal(wantsCustom([]), true, "no filter means all your studied words");
  assert.equal(wantsCustom(["custom"]), true, "explicitly ticked");
  assert.equal(wantsCustom(["kitchen", "custom"]), true, "ticked alongside a theme");
  assert.equal(wantsCustom(["kitchen"]), false, "a public theme excludes them");
  assert.equal(
    wantsCustom(["community"]),
    false,
    "物見 alone is a filter, not the absence of one — your own captures are not in it",
  );
});

test("the community theme is opt-in for NEW cards, unlike custom", () => {
  const wantsCommunity = (categories: string[]) =>
    resolveQueueThemeScope(categories, false).wantsCommunity;

  assert.equal(wantsCommunity([]), false, "never joins by default");
  assert.equal(wantsCommunity(["kitchen"]), false);
  assert.equal(wantsCommunity(["custom"]), false, "the other synthetic theme does not imply it");
  assert.equal(wantsCommunity(["community"]), true);
});

// Themes scope learning, not review — the promise the theme picker makes in so
// many words. Before this, iOS sent no categories for review and `wantsCommunity`
// required an explicit mention, so a saved community card could be learned once
// and was then never scheduled again: the SRS loop silently dropped it.
test("review ignores the theme filter for every source", () => {
  for (const categories of [[], ["kitchen"], ["custom"], ["community"]]) {
    const scope = resolveQueueThemeScope(categories, true);
    assert.deepEqual(scope.publicCategories, [], "review never filters by theme");
    assert.equal(scope.wantsCustom, true);
    assert.equal(scope.wantsCommunity, true);
    assert.equal(scope.shouldFetchPublic, true);
  }
});

// Reviewing with only 物見 ticked must not lose every official word learned.
test("the public dictionary is skipped only when the selection excludes it", () => {
  const shouldFetchPublic = (categories: string[]) =>
    resolveQueueThemeScope(categories, false).shouldFetchPublic;

  assert.equal(shouldFetchPublic([]), true);
  assert.equal(shouldFetchPublic(["kitchen"]), true);
  assert.equal(shouldFetchPublic(["custom"]), false);
  assert.equal(shouldFetchPublic(["community"]), false);
  assert.equal(shouldFetchPublic(["kitchen", "community"]), true);
});

test("synthetic themes never reach the words.category filter", () => {
  assert.deepEqual(
    resolveQueueThemeScope(["kitchen", "custom", "community"], false).publicCategories,
    ["kitchen"],
  );
});

// mode is parsed before the filters are derived; deriving them first would read
// `reviewOnly` from the temporal dead zone. Still a source assertion, because
// what it pins is an ordering inside the route rather than a rule the module
// can be asked about.
test("mode is resolved before the theme filters depend on it", () => {
  assert.ok(
    queueRoute.indexOf("const mode: QueueMode") < queueRoute.indexOf("const reviewOnly"),
  );
});

test("community is a selectable theme", () => {
  const ids = categories.map((c) => c.id);
  assert.ok(ids.includes("community"), "community must be a pickable theme");
});
