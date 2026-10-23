// Pins the 主題組合 (lib/topic-presets.ts, tuji-ios ADR-0020).
//
// THE RED LINES:
//   - Every theme in 留學生 is free. The two lists are written separately on
//     purpose (curation vs pricing); this test is what keeps them agreeing, so
//     adding a paid theme to 留學生 goes red instead of quietly locking the one
//     preset a non-member can use.
//   - Exactly one preset is the new-account default — clients read the flag,
//     never the order, so reordering the chips can't change every new user's
//     themes.
//   - A preset only names themes the response actually serves.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { categories } from "../lib/categories";
import { FREE_STUDY_CATEGORIES } from "../lib/study-membership";
import { TOPIC_PRESETS, localizeTopicPresets } from "../lib/topic-presets";

test("every 留學生 theme is free", () => {
  const student = TOPIC_PRESETS.find((p) => p.id === "student");
  assert.ok(student);
  const locked = student.categoryIds.filter((id) => !FREE_STUDY_CATEGORIES.includes(id));
  assert.deepEqual(locked, []);
});

test("exactly one preset is the default, and it is 留學生", () => {
  const defaults = TOPIC_PRESETS.filter((p) => p.isDefault);
  assert.deepEqual(
    defaults.map((p) => p.id),
    ["student"],
  );
});

test("presets name only public themes that exist — never a source", () => {
  const known = new Set(categories.map((c) => c.id));
  for (const p of TOPIC_PRESETS) {
    for (const id of p.categoryIds) {
      assert.ok(known.has(id), `${p.id} names unknown theme ${id}`);
      assert.ok(id !== "custom" && id !== "community", `${p.id} names a source`);
    }
    assert.equal(new Set(p.categoryIds).size, p.categoryIds.length, `${p.id} repeats a theme`);
  }
});

test("presets are trimmed to the served themes, and an emptied one is dropped", () => {
  const out = localizeTopicPresets("zh-Hant", new Set(["campus", "bank", "restaurant"]));
  assert.deepEqual(
    out.map((p) => [p.id, p.categoryIds]),
    [
      ["student", ["campus", "bank"]],
      ["working-holiday", ["bank", "restaurant"]],
      ["travel", ["restaurant"]],
    ],
  );
  assert.deepEqual(localizeTopicPresets("zh-Hant", new Set(["kitchen"])), []);
});

test("names follow the request language", () => {
  const all = new Set(categories.map((c) => c.id));
  const name = (lang: "zh-Hant" | "zh-Hans" | "ja" | "en") =>
    localizeTopicPresets(lang, all).find((p) => p.id === "travel")?.name;
  assert.equal(name("zh-Hant"), "旅遊");
  assert.equal(name("zh-Hans"), "旅游");
  assert.equal(name("ja"), "旅行");
  assert.equal(name("en"), "Travel");
});

test("/api/categories serves the presets trimmed to its own categories", () => {
  const src = readFileSync(new URL("../app/api/categories/route.ts", import.meta.url), "utf8");
  assert.match(src, /localizeTopicPresets\(lang, new Set\(categories\.map/);
  assert.match(src, /publicJson\(\{ categories, presets \}/);
});
