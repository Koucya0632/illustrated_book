// The four per-user routes whose answer depends on the learning direction, and
// where that direction comes from.
//
// They read it from the caller's *stored* settings, and nothing else. That is a
// race the client loses every time: switching 學習語言 arms a 400ms debounced
// settings POST and re-fetches these four immediately, so all four answered from
// the deck the user had just left. The client then caches the wrong numbers for
// 30s (`loadIfStale(ttl: 30)`), which is why 圖鑑 mastery badges, 完成度 and 連勝
// stayed on the old language long after the words themselves had switched —
// /api/words carries `?learning=` in its URL and was always right.
//
// Same fix /api/search got (#53), and the same one `?lang=` already had on
// /api/study/queue: the request may state its own scope, and it wins.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readLearningDirection } from "../lib/cache-headers";

const ROUTES = [
  "app/api/users/mastery/route.ts",
  "app/api/users/progress/route.ts",
  "app/api/study/stats/route.ts",
  "app/api/study/queue/route.ts",
] as const;

/**
 * Route source with its prose stripped. These assertions are about what each
 * handler *does*; the files explain at length what they used to do, and matching
 * raw source made the explanation fail the test that describes it.
 */
function routeCode(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const req = (query: string) =>
  new Request(`https://example.test/api/users/mastery${query}`);

// MARK: - Which direction a request gets

test("a request that names its direction is taken at its word", () => {
  assert.equal(readLearningDirection(req("?learning=zh-ja"), "zh-en"), "zh-ja");
  assert.equal(readLearningDirection(req("?learning=zh-en"), "zh-ja"), "zh-en");
});

test("a silent request falls back to the caller's stored setting", () => {
  // Shipped iOS builds (<= 1.0.4) send none of these params, so this path stays
  // live for every install that has not updated.
  assert.equal(readLearningDirection(req(""), "zh-ja"), "zh-ja");
});

test("a nonsense direction falls back rather than picking one", () => {
  // Unlike /api/search, these four are per-user and uncached, so there is no
  // cache key to keep consistent — the caller's own setting is the better
  // answer for a malformed request than defaulting a ja learner to English.
  assert.equal(readLearningDirection(req("?learning=tlh"), "zh-ja"), "zh-ja");
  assert.equal(readLearningDirection(req("?learning="), "zh-ja"), "zh-ja");
});

// MARK: - That every one of the four actually asks

test("each route resolves the direction through the helper", () => {
  for (const path of ROUTES) {
    assert.match(
      routeCode(path),
      /readLearningDirection\(req, settings\.learningDirection\)/,
      `${path} must let the request state its direction`,
    );
  }
});

test("no route derives a deck or target language from the stored setting", () => {
  // The actual defect, stated directly: `targetLanguageFor(settings.learningDirection)`
  // is the line that ignored the caller. One of these per route was the bug.
  for (const path of ROUTES) {
    assert.doesNotMatch(
      routeCode(path),
      /(targetLanguageFor|studyDeckFor)\(settings\.learningDirection\)/,
      `${path} still resolves its scope behind the request's back`,
    );
  }
});

test("each handler accepts the request it needs to read", () => {
  // Two of these took no argument at all. A handler that cannot see the URL
  // cannot honour anything in it, so this is the shape the fix depends on.
  for (const path of ROUTES) {
    assert.match(
      routeCode(path),
      /export async function GET\(req: Request\)/,
      `${path} must receive the Request`,
    );
  }
});
