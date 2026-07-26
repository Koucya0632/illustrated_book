// Pins the /api/atlas/public/by-lemma query contract. The endpoint is public and
// CDN-cached, so bad input must be rejected before it can poison a cache entry.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ATLAS_BY_LEMMA_DEFAULT_LIMIT,
  ATLAS_BY_LEMMA_MAX_LIMIT,
  ATLAS_LEMMA_MAX,
  clampByLemmaLimit,
  parseAtlasByLemmaQuery,
} from "../lib/atlas/public-query";

function parse(qs: string) {
  return parseAtlasByLemmaQuery(new URL(`https://example.test/x?${qs}`).searchParams);
}

test("accepts a lemma with an explicit target language", () => {
  const result = parse("lemma=kettle&lang=en");
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.query, {
    lemma: "kettle",
    lang: "en",
    limit: ATLAS_BY_LEMMA_DEFAULT_LIMIT,
  });
});

test("trims the lemma", () => {
  const result = parse("lemma=%20%20kettle%20%20&lang=en");
  assert.equal(result.ok && result.query.lemma, "kettle");
});

test("rejects a missing or blank lemma", () => {
  assert.deepEqual(parse("lang=en"), { ok: false, error: "invalid lemma" });
  assert.deepEqual(parse("lemma=%20%20&lang=en"), { ok: false, error: "invalid lemma" });
});

test("rejects an over-long lemma", () => {
  const long = "a".repeat(ATLAS_LEMMA_MAX + 1);
  assert.deepEqual(parse(`lemma=${long}&lang=en`), { ok: false, error: "invalid lemma" });
});

// lang is required on purpose: the same spelling exists in both decks, so a
// silent default would mix English and Japanese items into one list.
test("requires an explicit valid target language", () => {
  assert.deepEqual(parse("lemma=kettle"), { ok: false, error: "invalid lang" });
  assert.deepEqual(parse("lemma=kettle&lang=zh"), { ok: false, error: "invalid lang" });
  assert.equal(parse("lemma=傘&lang=ja").ok, true);
});

test("clamps the limit into range and survives junk", () => {
  assert.equal(clampByLemmaLimit(null), ATLAS_BY_LEMMA_DEFAULT_LIMIT);
  assert.equal(clampByLemmaLimit("abc"), ATLAS_BY_LEMMA_DEFAULT_LIMIT);
  assert.equal(clampByLemmaLimit("0"), 1);
  assert.equal(clampByLemmaLimit("-5"), 1);
  assert.equal(clampByLemmaLimit("999"), ATLAS_BY_LEMMA_MAX_LIMIT);
  assert.equal(clampByLemmaLimit("10"), 10);
  assert.equal(clampByLemmaLimit("10.7"), 10);
});
