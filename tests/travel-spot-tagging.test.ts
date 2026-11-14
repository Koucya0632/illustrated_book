// Pins 自製圖鑑掛景點 (lib/travel/spot-tagging.ts; parent repo CONTEXT.md「景點」,
// docs/adr/0002).
//
// THE RED LINES:
//   - A card sits only at a spot in its own language: Japan's spots take
//     Japanese cards.
//   - Sharing a card to a spot needs it public on 物見, and a spot an admin
//     took it off stays closed to it.
//   - A point matches at most one spot: neighbouring circles never overlap,
//     and the iOS app runs the same rule on the device.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { TRAVEL_DESTINATIONS, allTravelSpots } from "../lib/travel/destinations";
import {
  canShareToSpot,
  distanceMeters,
  parseSpotUpdate,
  spotAt,
  spotForCard,
  spotShareBlocked,
} from "../lib/travel/spot-tagging";

test("a card is tagged only to a spot in its own language", () => {
  assert.equal(spotForCard("asakusa", "ja")?.id, "asakusa");
  assert.equal(spotForCard("asakusa", "en"), null);
  assert.equal(spotForCard("dotonbori", "ja"), null);
  for (const d of TRAVEL_DESTINATIONS) assert.ok(["ja", "en"].includes(d.language), d.id);
});

const shared = { visibility: "public", review_status: "approved", spot_id: "asakusa", spot_share_revoked: null };

test("sharing needs the card public on 物見 and not taken off that spot", () => {
  assert.ok(canShareToSpot(shared));
  for (const review_status of ["pending", "pending_auto", "pending_review"]) {
    assert.ok(canShareToSpot({ ...shared, review_status }), review_status);
  }
  for (const review_status of ["draft", "rejected", "takedown", "withdrawn"]) {
    assert.ok(!canShareToSpot({ ...shared, review_status }), review_status);
  }
  assert.ok(!canShareToSpot({ ...shared, visibility: "private" }));
  assert.ok(!canShareToSpot({ ...shared, spot_id: null }));
  assert.ok(!canShareToSpot({ ...shared, spot_share_revoked: "asakusa" }));
  // Taken off 淺草 does not close 上野.
  assert.ok(canShareToSpot({ ...shared, spot_id: "ueno", spot_share_revoked: "asakusa" }));
  assert.ok(spotShareBlocked({ spot_id: "asakusa", spot_share_revoked: "asakusa" }));
  assert.ok(!spotShareBlocked({ spot_id: null, spot_share_revoked: "asakusa" }));
});

test("the card page's body is a spot id and an optional boolean", () => {
  assert.deepEqual(parseSpotUpdate({ spotId: " asakusa ", shared: true }), { spotId: "asakusa", shared: true });
  assert.deepEqual(parseSpotUpdate({ spotId: "asakusa" }), { spotId: "asakusa", shared: false });
  for (const bad of [null, [], "asakusa", {}, { spotId: "" }, { spotId: 3 }, { spotId: "asakusa", shared: "yes" },
    { spotId: "x".repeat(65) }]) {
    assert.equal(parseSpotUpdate(bad), null, JSON.stringify(bad));
  }
});

test("every spot has a place on the ground, and no two circles overlap", () => {
  const spots = allTravelSpots();
  for (const s of spots) {
    assert.ok(s.geo.lat > 20 && s.geo.lat < 46 && s.geo.lng > 122 && s.geo.lng < 154, `${s.id} is not in Japan`);
    assert.ok(s.geo.radiusM >= 200 && s.geo.radiusM <= 1500, `${s.id} radius ${s.geo.radiusM}`);
  }
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j];
      assert.ok(distanceMeters(a.geo, b.geo) > a.geo.radiusM + b.geo.radiusM, `${a.id} overlaps ${b.id}`);
    }
  }
});

test("a point matches the spot whose circle holds it, in the card's language only", () => {
  // 淺草寺 本堂 and the 雷門.
  assert.equal(spotAt({ lat: 35.7148, lng: 139.7967 }, "ja")?.id, "asakusa");
  assert.equal(spotAt({ lat: 35.7111, lng: 139.7963 }, "ja")?.id, "asakusa");
  // 澀谷 scramble.
  assert.equal(spotAt({ lat: 35.6595, lng: 139.7005 }, "ja")?.id, "shibuya");
  // 御徒町, between 上野 and 秋葉原, is neither.
  assert.equal(spotAt({ lat: 35.7075, lng: 139.7745 }, "ja"), null);
  // 大阪 and an English card are nowhere.
  assert.equal(spotAt({ lat: 34.6687, lng: 135.5013 }, "ja"), null);
  assert.equal(spotAt({ lat: 35.7148, lng: 139.7967 }, "en"), null);
  // One kilometre is about one kilometre.
  const d = distanceMeters({ lat: 35.0, lng: 139.0 }, { lat: 35.009, lng: 139.0 });
  assert.ok(d > 990 && d < 1010, String(d));
});

test("/api/travel serves each spot's place and each destination's language", () => {
  const src = readFileSync(new URL("../lib/travel/destinations.ts", import.meta.url), "utf8");
  assert.ok(src.includes("geo: { ...s.geo }"));
  assert.ok(src.includes("language: d.language"));
});
