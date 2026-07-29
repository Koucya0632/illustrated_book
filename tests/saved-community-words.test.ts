// Pins the 社群圖鑑 theme's data path into the 圖鑑 page.
//
// The design: saved community items are returned SHAPED AS WORDS under
// `category: "community"`, so the atlas page's existing theme chip, list,
// mastery badges and search all work with no second list implementation. The
// `saved:` id prefix is what routes a tap to AtlasPublicDetailView instead of
// the owner-scoped atlas detail — these items belong to someone else.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { categories } from "../lib/categories";

const savedWordsRoute = readFileSync(
  new URL("../app/api/users/saved-words/route.ts", import.meta.url),
  "utf8",
);
const customWordsRoute = readFileSync(
  new URL("../app/api/users/custom-words/route.ts", import.meta.url),
  "utf8",
);
const masteryRoute = readFileSync(
  new URL("../app/api/users/mastery/route.ts", import.meta.url),
  "utf8",
);
const progressRoute = readFileSync(
  new URL("../app/api/users/progress/route.ts", import.meta.url),
  "utf8",
);
const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("community is a pickable theme with the expected id", () => {
  const community = categories.find((c) => c.id === "community");
  assert.ok(community, "community must be a pickable theme");
  assert.equal(community.nameZh, "社群圖鑑");
});

test("saved items are returned as words under the community theme", () => {
  assert.match(savedWordsRoute, /category: "community"/);
  assert.match(savedWordsRoute, /id: `saved:\$\{row\.public_slug\}`/);
});

// The two halves of the atlas have separate quotas by design: saving other
// people's photos must never eat your own capture slots. Keeping the endpoints
// apart keeps that split visible.
test("saved words are a sibling endpoint, not folded into custom-words", () => {
  assert.doesNotMatch(customWordsRoute, /community/);
  assert.doesNotMatch(savedWordsRoute, /listAtlasCustomWords/);
});

// Community images live in the PUBLIC bucket; signing them would be pointless
// work and would expire.
test("saved words use public image URLs, not signed ones", () => {
  assert.match(savedWordsRoute, /atlasPublicImageUrl/);
  assert.doesNotMatch(savedWordsRoute, /createAtlasImageSignedUrls/);
});

test("the saved list is language-scoped and approved-only", () => {
  const body = fnBody(atlasDb, "listAtlasSavedItems");
  assert.match(body, /target_language = \$\{targetLanguage\}/);
  assert.match(body, /review_status = 'approved'/);
});

// Three mastery namespaces now: user_words, user_atlas_item_mastery (custom),
// and atlas_saved_cards (community). Missing the third renders a grid of 0%
// over words the user has been reviewing.
test("saved mastery is merged under the same id the client looks up", () => {
  assert.match(masteryRoute, /getSavedCommunityMastery/);
  assert.match(masteryRoute, /wordId: `saved:\$\{r\.slug\}`/);
});

// atlas_saved_cards holds one row per CARD (image_recall + flashcard); the grid
// shows one badge per ITEM. Averaged, not maxed — practising one card type
// isn't mastering the word.
test("per-card mastery is averaged into a per-item number", () => {
  const body = fnBody(atlasDb, "getSavedCommunityMastery");
  assert.match(body, /avg\(sc\.mastery\)/);
  assert.doesNotMatch(body, /max\(sc\.mastery\)/);
  assert.match(body, /GROUP BY p\.public_slug/);
});

test("community contributes its own progress row, like custom", () => {
  assert.match(progressRoute, /savedCommunityCategoryProgress/);
  assert.match(progressRoute, /category: "community"/);
});

// An empty theme is exactly what the opt-in rule exists to avoid.
test("a user with nothing saved gets no community progress row", () => {
  assert.match(progressRoute, /savedCommunity\.total > 0/);
});
