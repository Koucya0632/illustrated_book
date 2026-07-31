import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const saveRoute = readFileSync(
  new URL("../app/api/atlas/public/[slug]/save/route.ts", import.meta.url),
  "utf8",
);
const detailRoute = readFileSync(
  new URL("../app/api/atlas/public/[slug]/route.ts", import.meta.url),
  "utf8",
);

test("item save route exposes the current user's persisted save state", () => {
  assert.match(saveRoute, /export async function GET/);
  assert.match(saveRoute, /isAtlasPublicItemSaved/);
  assert.match(saveRoute, /countAtlasSaves/);
  assert.match(saveRoute, /private, no-store/);
});

test("public detail reuses stored atlas content and existing dictionary examples", () => {
  assert.match(detailRoute, /getAtlasPublicSourceItem/);
  assert.match(detailRoute, /atlasItemToWord/);
  assert.match(detailRoute, /getLearningWord/);
  assert.match(detailRoute, /learningWord/);
  assert.doesNotMatch(detailRoute, /atlasItemEnrich|openai|generateObject/);
});
