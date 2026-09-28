import assert from "node:assert/strict";
import { test } from "node:test";
import { presentWordInsights, type StoredInsights } from "../lib/word-insights-present";

const stored: StoredInsights = {
  confusables: [{
    term: "lager",
    catalogId: "lager",
    distinction: { zhHant: "愛爾啤酒", en: "Different fermentation", ja: "発酵が違います" },
  }],
  mistakes: [{
    wrong: "I drank a beers.",
    right: "I drank a beer.",
    why: { zhHant: "一杯啤酒", en: "Use singular beer", ja: "単数形を使います" },
  }],
  usage: { zhHant: "啤酒用法", en: "Beer usage", ja: "ビールの使い方" },
};

test("free word detail exposes counts and confusables without member text", () => {
  const shown = presentWordInsights(stored, "en", false);
  assert.deepEqual(shown.confusables, [{
    term: "lager", catalogId: "lager", distinction: "Different fermentation",
  }]);
  assert.deepEqual(shown.mistakes, []);
  assert.equal(shown.usage, null);
  assert.equal(shown.lockedMistakesCount, 1);
  assert.equal(shown.usageLocked, true);
  const wire = JSON.stringify(shown);
  assert.ok(!wire.includes("I drank a beers"));
  assert.ok(!wire.includes("Beer usage"));
  assert.ok(!wire.includes("Use singular beer"));
});

test("members receive their selected UI language, including OpenCC simplified Chinese", () => {
  const ja = presentWordInsights(stored, "ja", true);
  assert.equal(ja.confusables[0].distinction, "発酵が違います");
  assert.equal(ja.mistakes[0].why, "単数形を使います");
  assert.equal(ja.usage, "ビールの使い方");
  assert.equal(ja.lockedMistakesCount, 0);
  assert.equal(ja.usageLocked, false);
  const zhHans = presentWordInsights(stored, "zh-Hans", true);
  assert.equal(zhHans.confusables[0].distinction, "爱尔啤酒");
});

// The word detail is edge-cached for everyone; only the insights route may
// depend on who is asking. Putting membership-aware content back into the
// detail would make every word open an uncached function call.
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the word detail stays public and carries no insights", () => {
  const detail = read("app/api/words/[id]/route.ts");
  assert.ok(detail.includes("publicJson("), "detail must stay publicJson");
  assert.ok(!detail.includes("Insights"), "detail must not read insights");
  const config = read("next.config.js");
  assert.ok(config.includes('publicEntry("/api/words/:id")'));
  assert.ok(config.includes('privateEntry("/api/words/:id/insights")'));
});

test("the insights route is private and does nothing under v1", () => {
  const src = read("app/api/words/[id]/insights/route.ts");
  assert.ok(src.includes('"private, no-store"'));
  const v1 = src.indexOf('membershipPolicy() !== "v2"');
  assert.ok(v1 > 0 && v1 < src.indexOf("readStoredWordInsights("), "v1 must return before any read");
});
