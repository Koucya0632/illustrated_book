// Pins 「放到景點」 and 「不是在這裡拍的」 (lib/travel/spot-tagging.ts) where the
// guarantees live in SQL and route code.
//
// The sharing rules themselves (who may share, what withdrawing, a takedown
// or 「不是在這裡拍的」 do) run against real PostgreSQL in
// tests/atlas-publication-postgres.test.ts. These pin the read side:
//
//   - 「大家拍的」 reads only approved cards shared to that spot.
//   - The spot leaves the server only for a card its owner chose to share.
//   - 「大家拍的」 is not in the website's server-rendered HTML.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const atlasDb = read("lib/atlas-db.ts");

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("「大家拍的」 reads only approved cards shared to that spot", () => {
  const list = fnBody(atlasDb, "listAtlasPublicItemsAtSpot");
  assert.match(list, /pi\.spot_id = \$\{spotId\}/);
  assert.match(list, /pi\.review_status = 'approved'/);
  const route = read("app/api/travel/spots/[spot]/photos/route.ts");
  assert.match(route, /findTravelSpot\(spotId\)/);
  assert.match(route, /public, s-maxage=300/);
});

test("the spot leaves the server only for the owner, or for a card shared there", () => {
  const sync = read("app/api/atlas/sync/route.ts");
  assert.match(sync, /spotId: item\.spot_id \?\? null/);
  assert.match(sync, /spotShareBlocked\(/);
  const serialize = read("lib/atlas/public-serialize.ts");
  assert.match(serialize, /spotId: row\.spot_id \?\? null/);
});

test("「大家拍的」 is fetched in the browser, not rendered on the server", () => {
  const section = read("app/travel/[city]/[spot]/PeopleShot.tsx");
  assert.ok(section.startsWith('"use client";'));
  assert.match(section, /useEffect/);
  assert.match(section, /\/api\/travel\/spots\//);
  const page = read("app/travel/[city]/[spot]/page.tsx");
  assert.doesNotMatch(page, /listAtlasPublicItemsAtSpot/);
});
