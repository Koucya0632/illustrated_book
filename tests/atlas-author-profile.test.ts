// Pins the public author profile payload (listAtlasAuthorItems,
// listAtlasAuthorCollections, and the route that joins them).
//
// Two decisions live here, and both are the kind that regress silently because
// nothing throws when they do:
//
//  1. The item cap must stay UNREACHABLE. `getAtlasAuthor` reports
//     `published_count` as an unbounded count(*), so any truncation in the item
//     query puts "公開 200" above a grid of 60. The client also groups items by
//     language, so a truncated list silently loses whichever language the author
//     published in earlier — the profile would just look like they never wrote
//     any Japanese.
//
//  2. Collections must stay CAPPED. Items are bounded by the 自製圖鑑 capacity,
//     but nothing limits how many collections one author can create, so this
//     array is the only unbounded thing in a CDN-cached public payload.

// Source-reading rather than importing: lib/atlas-db.ts is `server-only`, which
// throws outside a server component.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const authorRoute = readFileSync(
  new URL("../app/api/atlas/public/authors/[username]/route.ts", import.meta.url),
  "utf8",
);
const authorModule = readFileSync(
  new URL("../lib/profile/author-profile.ts", import.meta.url),
  "utf8",
);
const liveAuthorModule = readFileSync(
  new URL("../lib/profile/live-author-profile.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const items = fnBody(atlasDb, "listAtlasAuthorItems");
const collections = fnBody(atlasDb, "listAtlasAuthorCollections");

// MARK: - Items: the cap must be unreachable

test("the item cap matches the Pro capacity, so truncation cannot happen", () => {
  // Pro 自製圖鑑 capacity is 300 and a published item cannot outlive its custom
  // one, so published <= 300. Both the default and the clamp have to agree —
  // a clamp lower than the default silently truncates every caller.
  assert.match(items, /limit = 300/);
  assert.match(items, /LIMIT \$\{Math\.min\(300,/);
});

test("the header count and the item list cannot disagree", () => {
  const cap = items.match(/Math\.min\((\d+),/);
  assert.ok(cap, "the item query should clamp its limit");
  const authorRow = fnBody(atlasDb, "getAtlasAuthor");
  // published_count is an unbounded aggregate; the only thing keeping it
  // consistent with the returned rows is that the cap is out of reach.
  assert.match(authorRow, /count\(DISTINCT p\.id\)::int\s+AS published_count/);
  assert.ok(Number(cap[1]) >= 300);
});

test("an account with zero approved items still resolves", () => {
  const authorRow = fnBody(atlasDb, "getAtlasAuthor");
  assert.match(authorRow, /LEFT JOIN atlas_public_items p/);
});

// MARK: - Collections: capped, unscoped, approved-only

test("an author's collections are capped, because nothing else caps them", () => {
  assert.match(collections, /LIMIT \$\{Math\.min\(50,/);
  // If a quota ever lands on creation, this test is the place that says why
  // the cap was needed in the first place.
  const create = fnBody(atlasDb, "createAtlasCollection");
  assert.doesNotMatch(create, /limit|quota|count\(/i);
});

// The browse feed is study material and follows the viewer's learning
// direction. A profile is a body of work — cropping it to what the visitor
// happens to be studying would answer the wrong question.
test("the profile's collections are NOT language-scoped, unlike the browse feed", () => {
  assert.doesNotMatch(collections, /target_language/);
  const feed = fnBody(atlasDb, "listPublicAtlasCollections");
  assert.match(feed, /c\.target_language = \$\{targetLanguage\}/);
});

test("only approved collections reach the public profile", () => {
  assert.match(collections, /c\.review_status = 'approved'/);
});

test("collections are scoped to the one author", () => {
  assert.match(collections, /c\.owner_user_id = \$\{ownerUserId\}::uuid/);
});

// NULLS LAST: an approved row can carry a null published_at, and in Postgres
// DESC puts NULLs first — which would pin the least-informative rows to the top.
test("collections order newest first without floating nulls to the top", () => {
  assert.match(collections, /ORDER BY c\.published_at DESC NULLS LAST/);
});

// MARK: - The route

test("the route returns collections alongside items", () => {
  assert.match(authorRoute, /authorProfile\.load/);
  assert.match(liveAuthorModule, /listAtlasAuthorCollections/);
  assert.match(liveAuthorModule, /serializeAtlasPublicCollectionCard/);
});

// The two reads are independent; awaiting them in series would add a round trip
// to a route that is already the slowest public read.
test("items and collections are fetched concurrently", () => {
  assert.match(authorModule, /Promise\.all\(\[/);
});

// The whole point of reusing the browse-feed serializer: the client already
// decodes that shape, so the collection cards need no new model.
test("collections reuse the browse-feed card shape", () => {
  assert.match(liveAuthorModule, /serializeAtlasPublicCollectionCard/);
});
