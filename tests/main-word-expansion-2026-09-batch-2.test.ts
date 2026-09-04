import assert from "node:assert/strict";
import test from "node:test";
import imageUrls from "../lib/image-urls.json";
import {
  loadExampleSpanCorpus,
  partitionExampleSpanCorpus,
  type AuthoredSpan,
  validateAuthoredSentence,
} from "../lib/example-span-corpus";
import {
  MAIN_WORD_EXPANSION_BATCH_2_CORRECTIONS,
  MAIN_WORD_EXPANSION_BATCH_2_EXAMPLE_PAIRS,
  MAIN_WORD_EXPANSION_BATCH_2_IDS,
  MAIN_WORD_EXPANSION_BATCH_2_WORDS,
} from "../lib/main-word-expansion-2026-09-batch-2";

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

test("the second September batch adds three daily-life words to every open series", () => {
  assert.equal(MAIN_WORD_EXPANSION_BATCH_2_IDS.length, 27);
  assert.equal(new Set(MAIN_WORD_EXPANSION_BATCH_2_IDS).size, 27);

  const counts = new Map<string, number>();
  for (const word of MAIN_WORD_EXPANSION_BATCH_2_WORDS) {
    counts.set(word.category, (counts.get(word.category) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), EXPECTED_CATEGORIES);
  assert.deepEqual([...counts.values()], Array(EXPECTED_CATEGORIES.length).fill(3));
  assert.equal(counts.has("zodiac"), false, "the canonical twelve-sign set must stay closed");
});

test("every second-batch word ships complete multilingual learning content", () => {
  const pairs = new Map(MAIN_WORD_EXPANSION_BATCH_2_EXAMPLE_PAIRS.map((pair) => [pair.id, pair]));
  const corrections = new Map(MAIN_WORD_EXPANSION_BATCH_2_CORRECTIONS.map((row) => [row.id, row]));

  for (const word of MAIN_WORD_EXPANSION_BATCH_2_WORDS) {
    assert.ok(word.chineseDefinition.trim(), `${word.id}: missing Chinese explanation`);
    assert.deepEqual(word.definitions.map(({ language }) => language).sort(), ["en", "ja", "zh"]);
    const jaDefinition = word.definitions.find(({ language }) => language === "ja")!.definition;
    const correction = corrections.get(word.id);
    assert.ok(jaDefinition.startsWith(`「${correction?.ja}」`), `${word.id}: Japanese definition`);

    const pair = pairs.get(word.id);
    assert.ok(pair, `${word.id}: missing target example pair`);
    assert.deepEqual(pair.examples.map(({ cefrLevel }) => cefrLevel), ["A2", "B1"]);
    assert.deepEqual(pair.examples.map(({ sortOrder }) => sortOrder), [0, 1]);

    const imageUrl = imageUrls[word.id as keyof typeof imageUrls];
    assert.match(imageUrl, new RegExp(`/word-images/${word.id}\\.webp$`), `${word.id}: image URL`);
    assert.ok(correction?.ja?.trim(), `${word.id}: missing Japanese headword`);
    assert.ok(correction?.jaReading?.trim(), `${word.id}: missing Japanese reading`);
    assert.deepEqual(correction?.jaDefinition, { old: jaDefinition, value: jaDefinition });
  }
});

test("every second-batch example has valid English and Japanese tappable spans", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  const overlay = overlays.find(({ path }) => path.pathname.endsWith("example-spans-expansion-2026-09-batch-2.json"));
  assert.ok(overlay, "missing second September expansion overlay");

  for (const pair of MAIN_WORD_EXPANSION_BATCH_2_EXAMPLE_PAIRS) {
    for (const example of pair.examples) {
      for (const [language, sentence] of [["en", example.en], ["ja", example.ja]] as const) {
        assert.equal(base[language][sentence], undefined, `${pair.id}/${language}: duplicated in base`);
        const authoredSpans: AuthoredSpan[] = overlay.corpus[language][sentence];
        assert.deepEqual(validateAuthoredSentence(language, sentence, authoredSpans), [], `${pair.id}/${language}`);
        assert.deepEqual(authoredSpans, corpus[language][sentence], `${pair.id}/${language}: overlay merge mismatch`);
      }
    }
  }
});
