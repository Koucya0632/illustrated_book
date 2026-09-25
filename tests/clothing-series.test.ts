import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import candidates from "../data/clothing-series-2026-09.json";
import { categories, publicFallbackCategories } from "../lib/categories";
import { words, publicFallbackWords, getWord, getWordsByCategory, searchWords } from "../lib/words";
import { MAIN_WORD_CLOTHING_IDS } from "../lib/main-word-clothing-2026-09";
import { validateAuthoredSentence, type ExampleSpanCorpus } from "../lib/example-span-corpus";

test("clothing series stays out of public static fallbacks until publication", () => {
  const ids = new Set(MAIN_WORD_CLOTHING_IDS);
  assert.equal(ids.size, 50);
  assert.equal(candidates.entries.length, 50);
  assert.equal(words.filter((word) => ids.has(word.id)).length, 50);
  assert.equal(categories.filter((category) => category.id === "clothing").length, 1);
  assert.equal(publicFallbackCategories.some((category) => category.id === "clothing"), false);
  assert.equal(publicFallbackWords.some((word) => ids.has(word.id) || word.category === "clothing"), false);
  assert.equal(getWordsByCategory("clothing").length, 0);
  for (const id of ids) {
    assert.equal(getWord(id), undefined);
    assert.equal(searchWords(id).some((word) => word.id === id), false);
  }
});

test("candidate examples and spans stay aligned", () => {
  const corpus = JSON.parse(
    readFileSync("data/example-spans-clothing-2026-09.json", "utf8"),
  ) as ExampleSpanCorpus;
  assert.equal(Object.keys(corpus.en).length, 100);
  assert.equal(Object.keys(corpus.ja).length, 100);
  for (const entry of candidates.entries) {
    assert.equal(entry.examples.length, 2, entry.id);
    assert.equal(entry.examples[0].cefrLevel, "A2", entry.id);
    assert.equal(entry.examples[1].cefrLevel, "B1", entry.id);
    for (const example of entry.examples) {
      for (const language of ["en", "ja"] as const) {
        const spans = corpus[language][example[language]];
        assert.ok(spans, `${entry.id} ${language}`);
        assert.deepEqual(validateAuthoredSentence(language, example[language], spans), [], `${entry.id} ${language}`);
      }
    }
  }
});
