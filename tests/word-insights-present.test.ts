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

// Word detail remains independent of membership. Regional activation bypasses
// both client and edge caches so a withdrawal cannot leave a stale detail.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { NextResponse } from "next/server";
import { publicJson, readLang, readLearningDirection, CATALOGUE_CLIENT_CACHE, CATALOGUE_EDGE_CACHE } from "../lib/cache-headers";
import { legacyRentalWordVisible } from "../lib/australian-categories";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the word detail uses regional cache policy and carries no insights", () => {
  const detail = read("app/api/words/[id]/route.ts");
  assert.ok(detail.includes("publicJson(word, req, true, regionalCatalogueActive)"), "successful detail must use regional cache policy");
  assert.ok(!detail.includes("Insights"), "detail must not read insights");
  const config = read("next.config.js");
  assert.ok(!config.includes('publicEntry("/api/words/:id")'), "static headers must not cache errors");
  assert.ok(config.includes('privateEntry("/api/words/:id/insights")'));
});

test("detail caches normal successes but disables both caches while regional content is active", async () => {
  const src = ts.createSourceFile("route.ts", read("app/api/words/[id]/route.ts"), ts.ScriptTarget.Latest, true);
  const declaration = src.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "GET");
  assert.ok(declaration);
  const js = ts.transpileModule(declaration.getText(src).replace(/^export\s+/, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const handler = (regionalCatalogueActive: boolean, exists = true) => {
    const deps = { NextResponse, regionalCatalogueActive, publicJson, readLang, readLearningDirection,
      legacyRentalWordVisible, dbEnabled: () => true, getLearningWord: async () => exists ? { id: "mug", word: "mug" } : undefined };
    return new Function(...Object.keys(deps), `${js}\nreturn GET;`)(...Object.values(deps)) as
      (req: Request, props: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  const props = { params: Promise.resolve({ id: "mug" }) };
  for (const active of [false, true]) {
    const get = handler(active);
    const first = await get(new Request("https://example.test/api/words/mug?learning=zh-en"), props);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Cache-Control"), active ? "no-store" : CATALOGUE_CLIENT_CACHE);
    assert.equal(first.headers.get("Vercel-CDN-Cache-Control"), active ? "no-store" : CATALOGUE_EDGE_CACHE);
    const etag = first.headers.get("ETag");
    assert.ok(etag);
    const conditional = await get(new Request("https://example.test/api/words/mug?learning=zh-en", { headers: { "If-None-Match": etag } }), props);
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get("Cache-Control"), active ? "no-store" : CATALOGUE_CLIENT_CACHE);
    assert.equal(conditional.headers.get("Vercel-CDN-Cache-Control"), active ? "no-store" : CATALOGUE_EDGE_CACHE);
    const missing = await handler(active, false)(new Request("https://example.test/api/words/mug?learning=zh-en"), props);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("Cache-Control"), "no-store");
    assert.equal(missing.headers.get("Vercel-CDN-Cache-Control"), "no-store");
  }
});

test("the insights route is private and does nothing under v1", () => {
  const src = read("app/api/words/[id]/insights/route.ts");
  assert.ok(src.includes('"private, no-store"'));
  const v1 = src.indexOf('membershipPolicy() !== "v2"');
  assert.ok(v1 > 0 && v1 < src.indexOf("readStoredWordInsights("), "v1 must return before any read");
});
