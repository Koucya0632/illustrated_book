import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import imageUrls from "../lib/image-urls.json";
import {
  loadExampleSpanCorpus,
  partitionExampleSpanCorpus,
} from "../lib/example-span-corpus";
import {
  MAIN_WORD_EXPANSION_CORRECTIONS,
  MAIN_WORD_EXPANSION_EXAMPLE_PAIRS,
  MAIN_WORD_EXPANSION_IDS,
  MAIN_WORD_EXPANSION_WORDS,
} from "../lib/main-word-expansion-2026-09";

const EXPECTED_CATEGORIES = [
  "bathroom",
  "bedroom",
  "kitchen",
  "living-room",
  "office",
  "seasonings",
  "street",
  "supermarket",
  "transportation",
];

test("the September expansion adds three daily-life words to every open series", () => {
  assert.equal(MAIN_WORD_EXPANSION_IDS.length, 27);
  assert.equal(new Set(MAIN_WORD_EXPANSION_IDS).size, 27);

  const counts = new Map<string, number>();
  for (const word of MAIN_WORD_EXPANSION_WORDS) {
    counts.set(word.category, (counts.get(word.category) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), EXPECTED_CATEGORIES);
  assert.deepEqual([...counts.values()], Array(EXPECTED_CATEGORIES.length).fill(3));
  assert.equal(counts.has("zodiac"), false, "the canonical twelve-sign set must stay closed");
});

test("every expansion word ships complete multilingual learning content", () => {
  const pairs = new Map(MAIN_WORD_EXPANSION_EXAMPLE_PAIRS.map((pair) => [pair.id, pair]));
  const corrections = new Map(MAIN_WORD_EXPANSION_CORRECTIONS.map((row) => [row.id, row]));

  for (const word of MAIN_WORD_EXPANSION_WORDS) {
    assert.ok(word.chineseDefinition.trim(), `${word.id}: missing Chinese explanation`);
    assert.deepEqual(
      word.definitions.map(({ language }) => language).sort(),
      ["en", "ja", "zh"],
      `${word.id}: definitions`,
    );
    assert.match(
      word.definitions.find(({ language }) => language === "en")!.definition,
      /\.$/,
      `${word.id}: English definition must be a sentence`,
    );
    const jaDefinition = word.definitions.find(({ language }) => language === "ja")!.definition;
    assert.ok(jaDefinition.startsWith(`「${corrections.get(word.id)?.ja}」`), `${word.id}: Japanese definition`);

    const pair = pairs.get(word.id);
    assert.ok(pair, `${word.id}: missing target example pair`);
    assert.deepEqual(pair.examples.map(({ cefrLevel }) => cefrLevel), ["A2", "B1"]);
    assert.deepEqual(pair.examples.map(({ sortOrder }) => sortOrder), [0, 1]);

    const imageUrl = imageUrls[word.id as keyof typeof imageUrls];
    assert.match(imageUrl, new RegExp(`/word-images/${word.id}\\.webp$`), `${word.id}: image URL`);

    const correction = corrections.get(word.id);
    assert.ok(correction?.ja?.trim(), `${word.id}: missing Japanese headword`);
    assert.ok(correction?.jaReading?.trim(), `${word.id}: missing Japanese reading`);
    assert.equal(correction?.oldJa, jaDefinition, `${word.id}: seed-term guard`);
    assert.deepEqual(
      correction?.jaDefinition,
      { old: jaDefinition, value: jaDefinition },
      `${word.id}: explanatory definition must survive the concise term correction`,
    );
  }
});

test("new-word migration persists explanations and CEFR levels", () => {
  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  assert.match(migration, /note, chinese_definition/);
  assert.match(migration, /INSERT INTO word_examples \(word_id, sentence, cefr_level, sort_order\)/);
  assert.match(migration, /ex\.cefrLevel \?\? null/);
});

test("expansion spans stay in their reviewable overlay without losing generator updates", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  assert.equal(overlays.length, 1);

  for (const pair of MAIN_WORD_EXPANSION_EXAMPLE_PAIRS) {
    for (const example of pair.examples) {
      for (const [language, sentence] of [["en", example.en], ["ja", example.ja]] as const) {
        assert.equal(base[language][sentence], undefined, `${pair.id}/${language}: duplicated in base`);
        assert.deepEqual(
          overlays[0].corpus[language][sentence],
          corpus[language][sentence],
          `${pair.id}/${language}: overlay lost the merged value`,
        );
      }
    }
  }
});
