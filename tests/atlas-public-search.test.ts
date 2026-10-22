// Pins the /api/atlas/public/search query contract (物見 search). The endpoint
// is public and CDN-cached, so bad input must be rejected before it can poison
// a cache entry, and user wildcards must stay literal.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ATLAS_SEARCH_QUERY_MAX,
  atlasContainsPattern,
  parseAtlasSearchQuery,
} from "../lib/atlas/public-query";

function parse(qs: string) {
  return parseAtlasSearchQuery(new URL(`https://example.test/x?${qs}`).searchParams);
}

test("accepts a trimmed query with an explicit target language", () => {
  const result = parse("q=%20%E7%8C%AB%20&lang=ja");
  assert.deepEqual(result.ok && result.query, { q: "猫", lang: "ja" });
});

test("rejects an empty or whitespace query", () => {
  assert.deepEqual(parse("q=&lang=ja"), { ok: false, error: "invalid q" });
  assert.deepEqual(parse("q=%20%20&lang=ja"), { ok: false, error: "invalid q" });
  assert.deepEqual(parse("lang=ja"), { ok: false, error: "invalid q" });
});

test("rejects an over-long query", () => {
  const long = "a".repeat(ATLAS_SEARCH_QUERY_MAX + 1);
  assert.deepEqual(parse(`q=${long}&lang=en`), { ok: false, error: "invalid q" });
  assert.equal(parse(`q=${"a".repeat(ATLAS_SEARCH_QUERY_MAX)}&lang=en`).ok, true);
});

test("requires lang rather than defaulting it", () => {
  assert.deepEqual(parse("q=cat"), { ok: false, error: "invalid lang" });
  assert.deepEqual(parse("q=cat&lang=fr"), { ok: false, error: "invalid lang" });
});

test("escapes ILIKE wildcards so they match literally", () => {
  assert.equal(atlasContainsPattern("cat"), "%cat%");
  assert.equal(atlasContainsPattern("100%"), "%100\\%%");
  assert.equal(atlasContainsPattern("a_b"), "%a\\_b%");
  assert.equal(atlasContainsPattern("c:\\x"), "%c:\\\\x%");
});

// Source-reading: lib/atlas-db.ts is `server-only`, which throws outside a
// server component.
const atlasDb = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");

function fnBody(name: string): string {
  const start = atlasDb.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = atlasDb.indexOf("\nexport ", start + 1);
  return atlasDb.slice(start, next === -1 ? undefined : next);
}

test("both searches only return approved rows in the requested language", () => {
  for (const name of ["searchPublicAtlasCollections", "searchAtlasPublicItems"]) {
    const body = fnBody(name);
    assert.match(body, /review_status = 'approved'/, name);
    assert.match(body, /target_language = \$\{targetLanguage\}/, name);
  }
});

test("collection search matches an author name only when the identity is confirmed", () => {
  assert.match(
    fnBody("searchPublicAtlasCollections"),
    /pr\.username IS NOT NULL AND \(\s*pr\.username ILIKE \$\{pattern\} OR pr\.nickname ILIKE \$\{pattern\}/,
  );
});
