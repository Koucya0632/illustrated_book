// Pins 跟著 Moira 去旅遊 (lib/travel/destinations.ts) and the 景點 study gate
// (lib/study-membership.ts).
//
// THE RED LINES:
//   - A spot opens only when every one of its words is served. Half a spot
//     must never show: content publishes on its own schedule and this rule is
//     the only thing coordinating the two.
//   - A destination with nothing open is not listed, so "the list is empty"
//     is the one signal a client needs to hide the entry.
//   - A free spot frees its own words and nothing else. Its words live in paid
//     themes; a non-member must not get the rest of those themes with them.
//   - What a non-member learned at a free spot is reviewed in the everyday
//     review, but is never taught as new from there.
//   - Spot ids are unique across every destination: `?spot=` names one.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  FREE_STUDY_CATEGORIES,
  FREE_STUDY_SPOTS,
  applyMembershipStudyScope,
  canStudyCard,
  checkStudySpot,
  freeSpotWordIds,
  studySpotWordIds,
} from "../lib/study-membership";
import { resolveQueueThemeScope } from "../lib/study-sources";
import {
  TRAVEL_DESTINATIONS,
  allTravelSpots,
  localizeTravelDestinations,
} from "../lib/travel/destinations";

const free2 = { tier: "free" as const, policy: "v2" as const };
const life2 = { tier: "lifetime" as const, policy: "v2" as const };
const free1 = { tier: "free" as const, policy: "v1" as const };

const everyWord = new Set(allTravelSpots().flatMap((s) => [...s.wordIds]));
const spotsOf = (out: ReturnType<typeof localizeTravelDestinations>) =>
  out.flatMap((d) => d.cities.flatMap((c) => c.spots));

test("spot ids are unique, and every spot has eight distinct words", () => {
  const ids = allTravelSpots().map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of allTravelSpots()) {
    assert.equal(s.wordIds.length, 8, s.id);
    assert.equal(new Set(s.wordIds).size, 8, `${s.id} repeats a word`);
  }
});

test("every spot and shape sits inside its map, and every tile inside its grid", () => {
  const inside = ([x, y]: readonly [number, number]) => x >= 0 && x <= 1 && y >= 0 && y <= 1;
  for (const d of TRAVEL_DESTINATIONS) {
    for (const r of d.regions) {
      for (const [col, row] of r.tiles) {
        assert.ok(Number.isInteger(col) && col >= 0 && col < d.grid.columns, `${r.id} column ${col}`);
        assert.ok(Number.isInteger(row) && row >= 0 && row < d.grid.rows, `${r.id} row ${row}`);
      }
    }
    const tiles = d.regions.flatMap((r) => r.tiles.map(([c, r2]) => `${c},${r2}`));
    assert.equal(new Set(tiles).size, tiles.length, `${d.id} has a tile in two regions`);
    for (const c of d.cities) {
      assert.ok(d.regions.some((r) => r.id === c.regionId), `${c.id} names unknown region`);
      for (const s of c.spots) assert.ok(inside(s.at), `${s.id} is off the map`);
      for (const shape of c.shapes) {
        assert.ok(inside(shape.nameAt), `${c.id} ${shape.kind} label is off the map`);
        if (shape.kind !== "ring") for (const p of shape.points) assert.ok(inside(p));
      }
    }
  }
});

test("a spot is open only when all of its words are served", () => {
  const all = spotsOf(localizeTravelDestinations("zh-Hant", everyWord, []));
  assert.ok(all.length > 0 && all.every((s) => s.open));

  const withoutOne = new Set(everyWord);
  withoutOne.delete("torii-gate");
  const partial = spotsOf(localizeTravelDestinations("zh-Hant", withoutOne, []));
  assert.deepEqual(
    partial.filter((s) => !s.open).map((s) => s.id),
    ["meiji-jingu"],
  );
});

test("a closed spot stays listed, but a destination with nothing open is dropped", () => {
  const akihabara = new Set(studySpotWordIds("akihabara"));
  const out = localizeTravelDestinations("zh-Hant", akihabara, []);
  assert.equal(out.length, 1);
  // 秋葉原 and 澀谷 share one word, which must not open 澀谷.
  assert.deepEqual(
    spotsOf(out).map((s) => [s.id, s.open]),
    allTravelSpots().map((s) => [s.id, s.id === "akihabara"]),
  );
  assert.deepEqual(localizeTravelDestinations("zh-Hant", new Set(), []), []);
});

test("regions name the cities inside them, and the rest are empty", () => {
  const [japan] = localizeTravelDestinations("zh-Hant", everyWord, []);
  assert.deepEqual(
    japan.regions.filter((r) => r.cityIds.length > 0).map((r) => [r.id, r.cityIds]),
    [["kanto", ["tokyo"]]],
  );
});

test("names follow the request language, and the Japanese name of a place never changes", () => {
  const name = (lang: Parameters<typeof localizeTravelDestinations>[0]) => {
    const asakusa = spotsOf(localizeTravelDestinations(lang, everyWord, [])).find((s) => s.id === "asakusa");
    assert.ok(asakusa);
    return [asakusa.name, asakusa.native, asakusa.reading];
  };
  assert.deepEqual(name("zh-Hant"), ["淺草", "浅草", "あさくさ"]);
  assert.deepEqual(name("zh-Hans"), ["浅草", "浅草", "あさくさ"]);
  assert.deepEqual(name("ja"), ["浅草", "浅草", "あさくさ"]);
  assert.deepEqual(name("en"), ["Asakusa", "浅草", "あさくさ"]);
});

test("the free spot is 秋葉原, and it is flagged free in the response", () => {
  assert.deepEqual([...FREE_STUDY_SPOTS], ["akihabara"]);
  const free = spotsOf(localizeTravelDestinations("zh-Hant", everyWord, FREE_STUDY_SPOTS));
  assert.deepEqual(
    free.filter((s) => s.free).map((s) => s.id),
    ["akihabara"],
  );
  assert.deepEqual(freeSpotWordIds().sort(), [...(studySpotWordIds("akihabara") ?? [])].sort());
});

test("every free spot exists", () => {
  for (const id of FREE_STUDY_SPOTS) assert.ok(studySpotWordIds(id), id);
  assert.equal(studySpotWordIds("atlantis"), null);
});

test("a non-member may study the free spot and no other; members and v1 any", () => {
  assert.equal(checkStudySpot(free2, "akihabara"), null);
  assert.deepEqual(checkStudySpot(free2, "asakusa"), {
    status: 402,
    error: "membership_required",
    upgradeTo: "lifetime",
  });
  assert.equal(checkStudySpot(life2, "asakusa"), null);
  assert.equal(checkStudySpot(free1, "asakusa"), null);
});

test("a free spot frees its own words, not the themes they belong to", () => {
  // 扭蛋機 is in 收藏 (paid). At the free spot it may be answered…
  assert.equal(
    canStudyCard(free2, { source: "public", category: "collecting-hobbies", wordId: "capsule-toy-machine" }),
    true,
  );
  // …but another word of the same theme may not,
  assert.equal(
    canStudyCard(free2, { source: "public", category: "collecting-hobbies", wordId: "dollhouse" }),
    false,
  );
  // nor may a word of a paid spot.
  assert.equal(
    canStudyCard(free2, { source: "public", category: "festivals", wordId: "paper-lantern" }),
    false,
  );
  // A caller that sends no word id is judged by category alone, as before.
  assert.equal(canStudyCard(free2, { source: "public", category: "collecting-hobbies" }), false);
  assert.equal(canStudyCard(free2, { source: "public", category: "fruits" }), true);
});

test("no free spot word is in a free theme already — the exception is doing real work", () => {
  // Not a rule, a tripwire: if this goes red the spot is free twice over and
  // the comment on FREE_STUDY_SPOTS no longer describes it.
  assert.ok(!FREE_STUDY_CATEGORIES.includes("collecting-hobbies"));
});

test("a non-member's everyday review includes free spot words; new cards do not", () => {
  const review = applyMembershipStudyScope(resolveQueueThemeScope([], true), free2);
  assert.deepEqual([...(review.reviewWordIds ?? [])].sort(), freeSpotWordIds().sort());
  // The category whitelist is untouched: the words ride beside it.
  assert.deepEqual([...review.publicCategories].sort(), [...FREE_STUDY_CATEGORIES].sort());

  // Members and v1 are not filtered by category, so there is nothing to widen.
  assert.equal(applyMembershipStudyScope(resolveQueueThemeScope([], true), life2).reviewWordIds, undefined);
  assert.equal(applyMembershipStudyScope(resolveQueueThemeScope([], true), free1).reviewWordIds, undefined);
});

test("fetchDue widens only the review half, and only beside a category filter", () => {
  const src = readFileSync(new URL("../lib/cards-db.ts", import.meta.url), "utf8");
  // Review: category OR word.
  assert.match(src, /w\.category = ANY\(\$\{cats\}\) OR c\.word_id = ANY\(\$\{reviewWordIds\}\)/);
  // The new-cards query keeps the plain category filter.
  const newQuery = src.slice(src.indexOf("FROM cards c\n    JOIN words w ON w.id = c.word_id\n    LEFT JOIN word_terms"));
  assert.ok(newQuery.includes("${cats.length ? sql`AND w.category = ANY(${cats})` : sql``}"));
  assert.ok(!newQuery.slice(0, newQuery.indexOf("ORDER BY c.id ASC")).includes("reviewCatFilter"));
});

test("the queue route resolves ?spot= through the gate before any query", () => {
  const src = readFileSync(new URL("../app/api/study/queue/route.ts", import.meta.url), "utf8");
  assert.match(src, /studySpotWordIds\(spotParam\)/);
  assert.match(src, /checkStudySpot\(access, spotParam\)/);
  assert.ok(src.indexOf("checkStudySpot(access, spotParam)") < src.indexOf("fetchDue("));
  assert.match(src, /wordIds: spotWordIds/);
});

test("the answer route judges a public card by its word as well as its category", () => {
  const src = readFileSync(new URL("../app/api/study/answer/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("wordId: card.word.id"));
});

test("/api/travel is 日文 only, served from the dictionary, and cached as public", () => {
  const route = readFileSync(new URL("../app/api/travel/route.ts", import.meta.url), "utf8");
  assert.match(route, /learning !== "zh-ja"/);
  assert.match(route, /localizeTravelDestinations\(/);
  const config = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
  assert.ok(config.includes('publicEntry("/api/travel")'));
});
