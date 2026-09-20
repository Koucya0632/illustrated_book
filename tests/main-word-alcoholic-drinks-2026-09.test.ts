import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { categories, publicFallbackCategories } from "../lib/categories";
import {
  loadExampleSpanCorpus,
  partitionExampleSpanCorpus,
  validateAuthoredSentence,
  validateMainWordExampleSpanCoverage,
  type AuthoredSpan,
} from "../lib/example-span-corpus";
import {
  MAIN_WORD_ALCOHOLIC_DRINKS_CORRECTIONS,
  MAIN_WORD_ALCOHOLIC_DRINKS_EXAMPLE_PAIRS,
  MAIN_WORD_ALCOHOLIC_DRINKS_IDS,
  MAIN_WORD_ALCOHOLIC_DRINKS_NEW_IDS,
  MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES,
  MAIN_WORD_ALCOHOLIC_DRINKS_WORDS,
} from "../lib/main-word-alcoholic-drinks-2026-09";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import {
  MAIN_WORD_EXAMPLE_PAIRS,
  type MainWordExamplePair,
} from "../lib/main-word-example-pairs";
import {
  getWord as getPublicFallbackWord,
  getWordsByCategory as getPublicFallbackWordsByCategory,
  publicFallbackWords,
  words,
} from "../lib/words";

test("alcoholic drinks defines 34 guarded concepts with 33 new catalogue rows", () => {
  assert.equal(MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES.length, 34);
  assert.equal(MAIN_WORD_ALCOHOLIC_DRINKS_IDS.length, 34);
  assert.equal(new Set(MAIN_WORD_ALCOHOLIC_DRINKS_IDS).size, 34);
  assert.equal(MAIN_WORD_ALCOHOLIC_DRINKS_NEW_IDS.length, 33);
  assert.equal(MAIN_WORD_ALCOHOLIC_DRINKS_WORDS.length, 33);
  assert.equal(MAIN_WORD_ALCOHOLIC_DRINKS_CORRECTIONS.length, 33);
  assert.equal(MAIN_WORD_ALCOHOLIC_DRINKS_EXAMPLE_PAIRS.length, 33);
  assert.ok(MAIN_WORD_ALCOHOLIC_DRINKS_IDS.includes("sake"));
  assert.ok(!MAIN_WORD_ALCOHOLIC_DRINKS_NEW_IDS.includes("sake"));

  for (const entry of MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES) {
    assert.equal(entry.category, "alcoholic-drinks", entry.id);
    assert.equal(entry.examples.length, 2, entry.id);
    assert.deepEqual(entry.examples.map(({ cefrLevel }) => cefrLevel), ["A2", "B1"]);
    assert.deepEqual(
      entry.definitions.map(({ language }) => language).sort(),
      ["en", "ja", "zh"],
      entry.id,
    );
    assert.equal(entry.relatedWords.length, 3, entry.id);
    for (const relatedId of entry.relatedWords) {
      assert.ok(MAIN_WORD_ALCOHOLIC_DRINKS_IDS.includes(relatedId), `${entry.id} -> ${relatedId}`);
    }
    assert.match(
      entry.imageUrl,
      entry.id === "sake"
        ? /^https:\/\/img\.nexflow\.team\/word-images\/sake\.webp$/
        : new RegExp(`^https://img\\.nexflow\\.team/word-images/${entry.id}-ai-[0-9a-f]{12}\\.webp$`),
      entry.id,
    );
  }

  for (const id of MAIN_WORD_ALCOHOLIC_DRINKS_IDS) {
    assert.equal(words.filter((word) => word.id === id).length, 1, id);
    assert.equal(MAIN_WORD_CORRECTIONS.filter((item) => item.id === id).length, 1, id);
    assert.equal(MAIN_WORD_EXAMPLE_PAIRS.filter((item) => item.id === id).length, 1, id);
  }
  assert.equal(publicFallbackWords.some(({ category }) => category === "alcoholic-drinks"), false);
  assert.equal(getPublicFallbackWord("beer"), undefined);
  assert.deepEqual(getPublicFallbackWordsByCategory("alcoholic-drinks"), []);
});

test("the alcoholic drinks span overlay contains exactly the 136 reviewed sentences", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  const matching = overlays.filter(({ path }) =>
    path.pathname.endsWith("example-spans-alcoholic-drinks-2026-09.json"),
  );
  assert.equal(matching.length, 1);
  const overlay = matching[0].corpus;
  assert.equal(Object.keys(overlay.en).length, 68);
  assert.equal(Object.keys(overlay.ja).length, 68);
  for (const language of ["en", "ja"] as const) {
    for (const [sentence, authored] of Object.entries(overlay[language])) {
      assert.equal(base[language][sentence], undefined, sentence);
      assert.deepEqual(
        validateAuthoredSentence(language, sentence, authored as AuthoredSpan[]),
        [],
        `${language}/${sentence}`,
      );
      assert.deepEqual(authored, corpus[language][sentence], sentence);
    }
  }
  const allPairs: MainWordExamplePair[] = MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));
  assert.deepEqual(validateMainWordExampleSpanCoverage(allPairs, corpus), []);
});

test("the category and routine migration preserve the guarded publication boundary", () => {
  const matches = categories.filter(({ id }) => id === "alcoholic-drinks");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "Alcoholic Drinks");
  assert.equal(matches[0].nameZh, "酒類");
  assert.match(matches[0].imageUrl, /category-alcoholic-drinks-ai-[0-9a-f]{12}\.webp$/);
  assert.equal(publicFallbackCategories.some(({ id }) => id === "alcoholic-drinks"), false);

  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  assert.match(migration, /MAIN_WORD_ALCOHOLIC_DRINKS_IDS/);
  assert.match(migration, /category: "alcoholic-drinks"/);
  assert.match(migration, /readGuardedSeriesPublicationState/);
  assert.match(migration, /guardedPublicationState\.get\(c\.id\) === false/);
  assert.match(migration, /publishedWordIds\.delete\(id\)/);
  assert.match(migration, /\('alcoholic-drinks', '酒類'\)/);
  assert.match(migration, /\('alcoholic-drinks', '日本酒から世界各地の身近なお酒まで'\)/);
});

test("review evidence covers every word, example, and selected image", () => {
  const semantic = JSON.parse(
    readFileSync(
      new URL("../output/alcoholic-drinks-publish-prep/semantic-review.json", import.meta.url),
      "utf8",
    ),
  );
  const visual = JSON.parse(
    readFileSync(
      new URL("../output/alcoholic-drinks-publish-prep/visual-review.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(semantic.summary, { words: 34, examples: 68, passed: 102, failed: 0 });
  assert.equal(semantic.items.length, 102);
  assert.equal(visual.items.length, 34);
  assert.equal(visual.summary.unreviewed, 0);
  assert.equal(new Set(visual.items.map(({ id }: { id: string }) => id)).size, 34);
});
