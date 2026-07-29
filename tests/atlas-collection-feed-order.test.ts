// Pins the browse feed's ordering policy (listPublicAtlasCollections).
//
// The decision behind it: a 合集 of one item is legal to publish — blocking it
// would cost supply from exactly the free-tier authors who have three capture
// slots in total — but it should not fill the first screen. So size affects
// EXPOSURE (ordering) and never PERMISSION (publishing). These tests pin that
// the floor lives in ORDER BY and nowhere else.

// Source-reading rather than importing: lib/atlas-db.ts is `server-only`, which
// throws outside a server component.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
const publishRoute = readFileSync(
  new URL("../app/api/atlas/collections/[id]/publish/route.ts", import.meta.url),
  "utf8",
);

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const feed = fnBody(atlasDb, "listPublicAtlasCollections");

test("larger collections sort first, then newest", () => {
  assert.match(
    feed,
    /ORDER BY \(cards\.item_count >= \$\{ATLAS_COLLECTION_FEATURED_MIN_ITEMS\}\) DESC,\s*\n?\s*cards\.published_at DESC/,
  );
});

// item_count is a computed output column; referencing it inside an ORDER BY
// expression only works from an enclosing SELECT.
test("the feed wraps the card projection so the count is orderable", () => {
  assert.match(feed, /SELECT \* FROM \(/);
  assert.match(feed, /\) cards/);
});

test("the size floor is a threshold, not a filter", () => {
  // Everything the inner SELECT uses to decide membership of the result set.
  const where = feed.slice(feed.indexOf("WHERE"), feed.indexOf(") cards"));
  assert.doesNotMatch(where, /item_count/);
  assert.doesNotMatch(feed, /HAVING/);
});

// Publishing is gated on emptiness only — one item is enough.
test("nothing in the publish path enforces a minimum collection size", () => {
  assert.match(publishRoute, /items\.length === 0/);
  assert.doesNotMatch(publishRoute, /FEATURED_MIN_ITEMS/);

  const declared = atlasDb.match(
    /ATLAS_COLLECTION_FEATURED_MIN_ITEMS = (\d+)/,
  );
  assert.ok(declared, "the threshold should be a named constant");
  // A threshold of 1 would sort everything into one tier and quietly turn the
  // policy off; anything that high is a different decision, not a tweak.
  assert.ok(Number(declared[1]) > 1 && Number(declared[1]) <= 10);
});

// Every collection has zero saves right now, so a popularity term would be
// untunable dead weight. It earns its place when the counts move.
test("ordering carries no popularity term yet", () => {
  const orderBy = feed.slice(feed.indexOf("ORDER BY"));
  assert.doesNotMatch(orderBy, /save_count/);
});
