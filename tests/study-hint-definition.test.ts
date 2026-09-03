// What 複習's 求救提示 is allowed to print (lib/study-hint.ts).
//
// The hint used to be `word.chinese`. For a zh reader that is the answer
// translated — 水桶 — so the hint and the answer were the same fact in two
// languages. The 釋義 is the better prompt, and it is already in the catalogue;
// these tests pin when it may ride along on the study queue and when it may
// not.
//
// The one that matters is the last group: in monolingual study the gloss
// already *is* the definition, so sending it as a 釋義 would put the language
// being tested onto the hint face. That is the same prohibition that keeps
// `reading` and `pronunciation` off it (docs/adr/0007) — and here it is not a
// separate guard, it falls out of "a 釋義 that repeats the gloss is not a 釋義".

import assert from "node:assert/strict";
import test from "node:test";
import { glossForReader, hintDefinition } from "../lib/study-hint";

const ZH_DEF = "附提把、開口朝上的圓柱形容器，用來裝載或搬運液體。";
const JA_DEF =
  "「バケツ」は、液体を積み込んだり運ぶために使用される、ハンドルと上向きの開口部を備えた円柱形の容器です。";
const EN_DEF = "An open, cylindrical container with a handle, used to carry liquids.";

// MARK: - hintDefinition

test("a 釋義 that says more than the gloss is sent", () => {
  assert.equal(hintDefinition("水桶", ZH_DEF), ZH_DEF);
});

test("no 釋義 in the catalogue sends nothing", () => {
  assert.equal(hintDefinition("水桶", null), undefined);
  assert.equal(hintDefinition("水桶", undefined), undefined);
  assert.equal(hintDefinition("水桶", "   "), undefined);
});

test("a 釋義 that only repeats the gloss is not a 釋義", () => {
  assert.equal(hintDefinition("水桶", "水桶"), undefined);
  assert.equal(hintDefinition("水桶", " 水桶 "), undefined);
});

// MARK: - glossForReader (the ja/en read boundary)

test("a ja reader gets the term on the headline and the sentence as the 釋義", () => {
  const pair = glossForReader({ word: "bucket", chinese: "水桶" }, "バケツ", JA_DEF);
  assert.equal(pair.chinese, "バケツ");
  assert.equal(pair.definition, JA_DEF);
});

test("an en reader has no separate headword, so the definition stays the headline", () => {
  // `word_terms` holds no en term distinct from the word itself; the definition
  // is promoted, and printing it twice would make the hint the headline again.
  const pair = glossForReader({ word: "bucket", chinese: "水桶" }, undefined, EN_DEF);
  assert.equal(pair.chinese, EN_DEF);
  assert.equal(pair.definition, undefined);
});

test("nothing in the reader's language keeps the zh gloss and drops the zh 釋義", () => {
  // The headline is Chinese either way (load-bearing fallback). Handing a
  // Chinese explainer to a ja reader underneath it is the leak word-localize.ts
  // already refuses on the detail page.
  const pair = glossForReader({ word: "bucket", chinese: "水桶" }, undefined, undefined);
  assert.equal(pair.chinese, "水桶");
  assert.equal(pair.definition, undefined);
});

test("a pre-word_terms row whose term is its own definition prints once", () => {
  const pair = glossForReader({ word: "bucket", chinese: "水桶" }, "バケツ", "バケツ");
  assert.equal(pair.chinese, "バケツ");
  assert.equal(pair.definition, undefined);
});

// MARK: - Monolingual study: the language being tested never reaches the hint

test("a 日文 learner's ja deck sends no 釋義, because the answer is written in it", () => {
  // The word IS the ja term, so the term is the answer rather than a gloss and
  // the definition stays on the headline — which is exactly what stops that
  // Japanese sentence from being handed over as a hint to a Japanese question.
  const pair = glossForReader({ word: "バケツ", chinese: "水桶" }, "バケツ", JA_DEF);
  assert.equal(pair.chinese, JA_DEF);
  assert.equal(pair.definition, undefined);
});

test("an en learner reading en gets the same treatment", () => {
  const pair = glossForReader({ word: "bucket", chinese: "水桶" }, undefined, EN_DEF);
  assert.equal(pair.definition, undefined);
});

// 自製圖鑑 rows are glossed upstream by pickAtlasGloss, which returns the
// definition itself in monolingual mode. The route hands both to
// `hintDefinition`, so the same equality does the same job there.
test("an atlas row glossed with its own definition sends no 釋義", () => {
  const monolingualGloss = JA_DEF;
  assert.equal(hintDefinition(monolingualGloss, JA_DEF), undefined);
});
