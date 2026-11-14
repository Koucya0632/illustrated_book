// Pins 「放到景點」 and 「不是在這裡拍的」 (lib/travel/spot-tagging.ts) where the
// guarantees live in SQL and route code.
//
// Source-reading, like atlas-report-takedown.test.ts: lib/atlas-db.ts is
// server-only and its queries need a database to exercise, but these are
// properties of the code itself.
//
// THE RED LINES:
//   - Others see a card at a spot only while its owner shares it there and it
//     is approved on 物見; withdrawing or a takedown ends the sharing.
//   - 「不是在這裡拍的」 never counts toward taking a card off 物見; an admin
//     removes it from the spot, and only from the spot.
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

test("the public row carries the spot only while it is shared and not revoked", () => {
  const shared = fnBody(atlasDb, "sharedSpotOf");
  assert.match(shared, /item\.spot_shared/);
  assert.match(shared, /spot_share_revoked !== spot/);
  const approve = fnBody(atlasDb, "approveAtlasPublicItem");
  assert.match(approve, /\$\{sharedSpotOf\(item\)\}/);
  assert.match(approve, /spot_id = EXCLUDED\.spot_id/);
  const set = fnBody(atlasDb, "setAtlasItemSpot");
  assert.match(set, /sql\.begin/);
  assert.match(set, /updated_at = now\(\)[\s\S]*RETURNING \*/);
  assert.match(set, /SET spot_id = \$\{sharedSpotOf\(item\)\}/);
});

test("withdrawing and a takedown end the sharing", () => {
  for (const name of ["withdrawAtlasPublicItem", "takedownAtlasPublicItem"]) {
    const body = fnBody(atlasDb, name);
    assert.match(body, /spot_shared = false/, name);
    assert.match(body, /spot_id = NULL/, name);
  }
});

test("「大家拍的」 reads only approved cards shared to that spot", () => {
  const list = fnBody(atlasDb, "listAtlasPublicItemsAtSpot");
  assert.match(list, /pi\.spot_id = \$\{spotId\}/);
  assert.match(list, /pi\.review_status = 'approved'/);
  const route = read("app/api/travel/spots/[spot]/photos/route.ts");
  assert.match(route, /findTravelSpot\(spotId\)/);
  assert.match(route, /public, s-maxage=300/);
});

test("「不是在這裡拍的」 never counts toward taking the card off 物見", () => {
  const escalate = fnBody(atlasDb, "maybeEscalateAtlasReport");
  assert.match(escalate, /reason <> 'not_here'/);
  const route = read("app/api/atlas/public/[slug]/report/route.ts");
  assert.match(route, /"not_here"/);
  assert.match(route, /atSpot && !item\.spot_id/);
  assert.match(route, /targetType: atSpot \? "item_spot" : "item"/);
  assert.match(route, /atSpot\s*\? false\s*: await maybeEscalateAtlasReport/);
});

test("an admin removes the card from the spot, and only from the spot", () => {
  const remove = fnBody(atlasDb, "removeAtlasReportFromSpot");
  assert.match(remove, /target_type !== "item_spot"/);
  assert.match(remove, /spot_share_revoked = spot_id/);
  assert.match(remove, /spot_shared = false/);
  assert.doesNotMatch(remove, /review_status = 'takedown'/);
  assert.doesNotMatch(remove, /visibility/);
  const adminRoute = read("app/api/admin/atlas/reports/[id]/route.ts");
  assert.match(adminRoute, /body\.action === "remove_from_spot"[\s\S]*?removeAtlasReportFromSpot\(params\.id\)/);
  // The 下架 action does not reach a spot report.
  assert.match(fnBody(atlasDb, "takedownAtlasReportTarget"), /return "unsupported"/);
});

test("the spot leaves the server only for the owner, or for a card shared there", () => {
  const sync = read("app/api/atlas/sync/route.ts");
  assert.match(sync, /spotId: item\.spot_id \?\? null/);
  assert.match(sync, /spotShareBlocked\(/);
  const serialize = read("lib/atlas/public-serialize.ts");
  assert.match(serialize, /spotId: row\.spot_id \?\? null/);
});

test("the card page's spot route applies the rules before writing", () => {
  const route = read("app/api/atlas/items/[id]/spot/route.ts");
  const put = route.slice(route.indexOf("export async function PUT"), route.indexOf("export async function DELETE"));
  assert.match(put, /spotForCard\(update\.spotId, item\.target_language\)/);
  assert.match(put, /canShareToSpot\(after\)/);
  assert.match(put, /if \(update\.shared\) \{\s*const membershipRefusal = await communityWriteRefusal\(userId\)/);
  assert.match(put, /getOwnedAtlasItemForSpot\(userId, params\.id\)/);
  const del = route.slice(route.indexOf("export async function DELETE"));
  assert.match(del, /spotId: null, shared: false/);
});

test("「大家拍的」 is fetched in the browser, not rendered on the server", () => {
  const section = read("app/travel/[city]/[spot]/PeopleShot.tsx");
  assert.ok(section.startsWith('"use client";'));
  assert.match(section, /useEffect/);
  assert.match(section, /\/api\/travel\/spots\//);
  const page = read("app/travel/[city]/[spot]/page.tsx");
  assert.doesNotMatch(page, /listAtlasPublicItemsAtSpot/);
});
