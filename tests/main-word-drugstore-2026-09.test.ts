import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import imageUrls from "../lib/image-urls.json";
import { categories, getCategory, publicFallbackCategories } from "../lib/categories";
import {
  loadExampleSpanCorpus,
  partitionExampleSpanCorpus,
  validateAuthoredSentence,
  validateMainWordExampleSpanCoverage,
  type AuthoredSpan,
} from "../lib/example-span-corpus";
import {
  MAIN_WORD_DRUGSTORE_CORRECTIONS,
  MAIN_WORD_DRUGSTORE_EXAMPLE_PAIRS,
  MAIN_WORD_DRUGSTORE_IDS,
  MAIN_WORD_DRUGSTORE_RELEASE_ENTRIES,
  MAIN_WORD_DRUGSTORE_WORDS,
} from "../lib/main-word-drugstore-2026-09";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { getWord, getWordsByCategory, publicFallbackWords, words } from "../lib/words";

test("drugstore contains 50 distinct reviewed concepts and hides the unreleased series", () => {
  assert.equal(MAIN_WORD_DRUGSTORE_RELEASE_ENTRIES.length, 50);
  assert.equal(new Set(MAIN_WORD_DRUGSTORE_IDS).size, 50);
  assert.equal(MAIN_WORD_DRUGSTORE_WORDS.length, 50);
  assert.equal(MAIN_WORD_DRUGSTORE_CORRECTIONS.length, 50);
  assert.equal(MAIN_WORD_DRUGSTORE_EXAMPLE_PAIRS.length, 50);
  assert.ok(MAIN_WORD_DRUGSTORE_IDS.includes("foundation-makeup"));
  assert.ok(MAIN_WORD_DRUGSTORE_IDS.includes("concealer"));
  assert.ok(MAIN_WORD_DRUGSTORE_IDS.includes("sheet-mask"));
  for (const entry of MAIN_WORD_DRUGSTORE_RELEASE_ENTRIES) {
    assert.equal(entry.category, "drugstore", entry.id);
    assert.equal(entry.examples.length, 2, entry.id);
    assert.deepEqual(entry.examples.map(({ cefrLevel }) => cefrLevel), ["A2", "B1"], entry.id);
    assert.deepEqual(entry.definitions.map(({ language }) => language).sort(), ["en", "ja", "zh"], entry.id);
    assert.equal(entry.relatedWords.length, 3, entry.id);
    assert.equal(new Set(entry.relatedWords).size, 3, entry.id);
    for (const relatedId of entry.relatedWords) {
      assert.ok(MAIN_WORD_DRUGSTORE_IDS.includes(relatedId), `${entry.id} -> ${relatedId}`);
    }
    assert.match(entry.imageUrl!, new RegExp(`^https://img\\.nexflow\\.team/word-images/${entry.id}-ai-[0-9a-f]{12}\\.webp$`), entry.id);
    assert.equal((imageUrls as Record<string, string>)[entry.id], entry.imageUrl, entry.id);
    if (entry.jaReadingSegments) {
      assert.equal(entry.jaReadingSegments.map(({ text }) => text).join(""), entry.ja, entry.id);
      assert.equal(entry.jaReadingSegments.map(({ text, ruby }) => ruby ?? text).join(""), entry.jaReading, entry.id);
    }
    assert.equal(words.filter(({ id }) => id === entry.id).length, 1, entry.id);
    assert.equal(MAIN_WORD_CORRECTIONS.filter(({ id }) => id === entry.id).length, 1, entry.id);
    assert.equal(MAIN_WORD_EXAMPLE_PAIRS.filter(({ id }) => id === entry.id).length, 1, entry.id);
  }
  assert.equal(publicFallbackWords.some(({ category }) => category === "drugstore"), false);
  assert.equal(getWord("drugstore"), undefined);
  assert.deepEqual(getWordsByCategory("drugstore"), []);
  assert.equal(publicFallbackCategories.some(({ id }) => id === "drugstore"), false);
  assert.equal(getCategory("drugstore"), undefined);
  assert.equal(categories.filter(({ id }) => id === "drugstore").length, 1);
});

test("all drugstore example spans reconstruct the reviewed English and Japanese text", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  const overlay = overlays.find(({ path }) => path.pathname.endsWith("example-spans-drugstore-2026-09.json"))?.corpus;
  assert.ok(overlay);
  assert.equal(Object.keys(overlay.en).length, 100);
  assert.equal(Object.keys(overlay.ja).length, 100);
  for (const language of ["en", "ja"] as const) {
    for (const [sentence, authored] of Object.entries(overlay[language])) {
      assert.equal(base[language][sentence], undefined, sentence);
      assert.deepEqual(validateAuthoredSentence(language, sentence, authored as AuthoredSpan[]), [], sentence);
      assert.deepEqual(corpus[language][sentence], authored, sentence);
    }
  }
  assert.deepEqual(validateMainWordExampleSpanCoverage(MAIN_WORD_DRUGSTORE_EXAMPLE_PAIRS, corpus), []);
});

test("ordinary migration defers drugstore IDs, category, and image synchronization", () => {
  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  assert.match(migration, /MAIN_WORD_DRUGSTORE_IDS/);
  assert.match(migration, /category: "drugstore"/);
  assert.match(migration, /guardedMissing = seedWords\.filter/);
  assert.match(migration, /!isGuardedPublishWord\(w\)/);
  assert.match(migration, /syncSeedWordImages\(sql\)/);
  assert.match(migration, /publicationState\.get\(w\.category\) === true/);
  assert.match(migration, /guardedPublicationState\.get\(c\.id\) === false/);
  assert.match(migration, /publishedWordIds\.delete\(id\)/);
});
