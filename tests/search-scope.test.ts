// /api/search is scoped to a learning direction, and that scope has to reach
// both the query and the cache key.
//
// It reached neither. The route read the caller's stored settings and ignored
// `?lang=` / `?learning=` entirely, so a client that had just switched 學習語言
// kept getting the old direction's rows until its debounced settings POST
// landed. Meanwhile the handler asked for `Cache-Control: public, s-maxage=60,
// stale-while-revalidate=300` on that per-user response; Next strips directives
// off a searchParam-reading handler but kept the bare `public`, and production
// was serving exactly that — an unbounded shared-cache grant on a body that
// differs per user.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  hasExplicitLanguageScope,
  readLang,
  readLearningDirection,
} from "../lib/cache-headers";
import { DEFAULT_SETTINGS } from "../lib/settings";

const routeSource = readFileSync(
  new URL("../app/api/search/route.ts", import.meta.url),
  "utf8",
);

/**
 * The route's code with its prose removed. These assertions are about what the
 * handler *does*; the file explains at length what it used to do, and matching
 * raw source made the explanation fail the test that describes it.
 */
const routeCode = routeSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const req = (query: string) => new Request(`https://example.test/api/search${query}`);

// MARK: - Which scope a request gets

test("a request that names its scope is taken at its word", () => {
  const r = req("?q=cup&lang=ja&learning=zh-ja");

  assert.equal(hasExplicitLanguageScope(r), true);
  assert.equal(readLang(r, "zh-Hant"), "ja");
  assert.equal(readLearningDirection(r, "zh-en"), "zh-ja");
});

test("a request that names neither falls back to the caller's settings", () => {
  // Shipped iOS builds (<= 1.0.4) send only `q`, so this path stays live.
  const r = req("?q=cup");

  assert.equal(hasExplicitLanguageScope(r), false);
  assert.equal(readLang(r, "ja"), "ja");
  assert.equal(readLearningDirection(r, "zh-ja"), "zh-ja");
});

test("half a scope is not a scope", () => {
  // One param alone would leave the other to the stored settings, which is the
  // mismatch this endpoint is being fixed for — treat it as unstated.
  assert.equal(hasExplicitLanguageScope(req("?q=cup&learning=zh-ja")), false);
  assert.equal(hasExplicitLanguageScope(req("?q=cup&lang=ja")), false);
});

test("a nonsense scope still answers from the URL, never from the caller", () => {
  const r = req("?q=cup&lang=klingon&learning=tlh");

  // Both params are present, so the route takes the DEFAULT_SETTINGS branch and
  // never looks the user up. That matters beyond tidiness: next.config.js grants
  // a shared cache on the *presence* of `learning`, so a request that carries a
  // junk value is still cacheable — and must therefore resolve to the same rows
  // for everyone rather than quietly falling back to one user's stored setting.
  assert.equal(hasExplicitLanguageScope(r), true);
  assert.equal(readLang(r, DEFAULT_SETTINGS.uiLang), "zh-Hant");
  assert.equal(
    readLearningDirection(r, DEFAULT_SETTINGS.learningDirection),
    "zh-en",
  );
});

test("the route resolves its scope through those helpers", () => {
  assert.match(routeCode, /readLang\(req, settings\.uiLang\)/);
  assert.match(routeCode, /readLearningDirection\(req, settings\.learningDirection\)/);
});

test("the route pays for a user lookup only when the request was silent", () => {
  assert.match(
    routeCode,
    /hasExplicitLanguageScope\(req\)\s*\?\s*DEFAULT_SETTINGS/,
  );
});

// MARK: - Who may cache the answer

test("the handler no longer sets its own Cache-Control", () => {
  // Next mangles handler-set cache headers on a dynamic route — that is how an
  // `s-maxage=60` turned into an unbounded `public`. next.config.js owns this.
  // Quoted form only: the header name appears in this file's own prose.
  assert.doesNotMatch(routeCode, /"Cache-Control"/);
  assert.doesNotMatch(routeCode, /s-maxage/);
});

async function searchHeaderEntries() {
  const mod = await import("../next.config.js");
  const config = (mod.default ?? mod) as {
    headers: () => Promise<
      {
        source: string;
        has?: { type: string; key: string }[];
        missing?: { type: string; key: string }[];
        headers: { key: string; value: string }[];
      }[]
    >;
  };
  const all = await config.headers();
  return all.filter((e) => e.source === "/api/search");
}

function cacheControl(entry: { headers: { key: string; value: string }[] }) {
  return entry.headers.find((h) => h.key === "Cache-Control")?.value ?? "";
}

test("the edge may cache a search only when the URL carries the direction", async () => {
  const entries = await searchHeaderEntries();
  const shared = entries.filter((e) => cacheControl(e).includes("public"));

  assert.equal(shared.length, 1, "exactly one entry may grant a shared cache");
  assert.deepEqual(shared[0].has, [{ type: "query", key: "learning" }]);
});

test("without the direction the answer is private to the device that asked", async () => {
  const entries = await searchHeaderEntries();
  const unscoped = entries.find((e) => e.missing?.some((m) => m.key === "learning"));

  assert.ok(unscoped, "the no-direction case must be covered");
  const value = cacheControl(unscoped);
  assert.match(value, /private/);
  assert.doesNotMatch(value, /public/);
});

test("no entry hands /api/search to a shared cache unconditionally", async () => {
  // The regression that shipped: /api/search was in neither header list, so
  // nothing here contradicted the handler's `public`.
  const entries = await searchHeaderEntries();
  assert.ok(entries.length > 0, "/api/search must be covered by a header rule");

  for (const entry of entries) {
    if (!cacheControl(entry).includes("public")) continue;
    assert.ok(
      entry.has?.some((h) => h.type === "query" && h.key === "learning"),
      "a public grant must be gated on the direction being in the URL",
    );
  }
});
