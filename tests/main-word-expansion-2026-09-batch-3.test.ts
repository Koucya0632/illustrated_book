import assert from "node:assert/strict";
import test from "node:test";
import imageUrls from "../lib/image-urls.json";
import { words } from "../lib/words";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import {
  loadExampleSpanCorpus,
  partitionExampleSpanCorpus,
  validateAuthoredSentence,
  type AuthoredSpan,
} from "../lib/example-span-corpus";
import {
  MAIN_WORD_EXPANSION_BATCH_3_CORRECTIONS as corrections,
  MAIN_WORD_EXPANSION_BATCH_3_EXAMPLE_PAIRS as pairs,
  MAIN_WORD_EXPANSION_BATCH_3_IDS as ids,
  MAIN_WORD_EXPANSION_BATCH_3_WORDS as additions,
} from "../lib/main-word-expansion-2026-09-batch-3";

test("third batch adds three distinct daily-life words per open series", () => {
  assert.equal(ids.length, 27);
  assert.equal(new Set(ids).size, ids.length);
  const counts = new Map<string, number>();
  for (const word of additions) counts.set(word.category, (counts.get(word.category) ?? 0) + 1);
  assert.deepEqual([...counts.keys()].sort(), ["bathroom", "bedroom", "kitchen", "living-room", "office", "seasonings", "street", "supermarket", "transportation"]);
  assert.deepEqual([...counts.values()], Array(9).fill(3));
  for (const word of additions) {
    assert.equal(words.filter(({ id }) => id === word.id).length, 1, word.id);
    assert.equal(words.filter(({ word: term }) => term === word.word).length, 1, word.word);
    for (const related of word.relatedWords) assert.ok(words.some(({ id }) => id === related), `${word.id}: ${related}`);
  }
});

test("third-batch multilingual content, readings and future asset URLs are integrated", () => {
  for (const word of additions) {
    assert.ok(word.chineseDefinition.trim(), word.id);
    assert.deepEqual(word.definitions.map(({ language }) => language).sort(), ["en", "ja", "zh"]);
    const correction = corrections.find(({ id }) => id === word.id)!;
    assert.equal(MAIN_WORD_CORRECTIONS.filter(({ id }) => id === word.id).length, 1);
    const jaDefinition = word.definitions.find(({ language }) => language === "ja")!.definition;
    assert.ok(jaDefinition.startsWith(`「${correction.ja}」`), word.id);
    assert.ok(correction.jaReading?.trim(), word.id);
    if (correction.jaReadingSegments) {
      assert.equal(correction.jaReadingSegments.map(s => s.text).join(""), correction.ja);
      assert.equal(correction.jaReadingSegments.map(s => s.ruby ?? s.text).join(""), correction.jaReading);
    } else {
      assert.equal(correction.jaReading, correction.ja);
    }
    const pair = pairs.find(({ id }) => id === word.id)!;
    assert.equal(MAIN_WORD_EXAMPLE_PAIRS.filter(({ id }) => id === word.id).length, 1);
    assert.deepEqual(pair.examples.map(e => [e.sortOrder, e.cefrLevel]), [[0, "A2"], [1, "B1"]]);
    for (const e of pair.examples) for (const lang of ["en", "ja", "zh"] as const) assert.ok(e[lang].trim());
    assert.equal(imageUrls[word.id as keyof typeof imageUrls], `https://img.nexflow.team/word-images/${word.id}.webp`);
  }
});

test("all 108 third-batch sentence annotations remain in their own reviewed overlay", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  const overlay = overlays.find(({ path }) => path.pathname.endsWith("example-spans-expansion-2026-09-batch-3.json"));
  assert.ok(overlay);
  assert.equal(Object.keys(overlay.corpus.en).length, 54);
  assert.equal(Object.keys(overlay.corpus.ja).length, 54);
  for (const pair of pairs) for (const example of pair.examples) for (const lang of ["en", "ja"] as const) {
    const sentence = example[lang];
    assert.equal(base[lang][sentence], undefined, `${pair.id}/${lang}: base duplicated`);
    const authored: AuthoredSpan[] = overlay.corpus[lang][sentence];
    assert.deepEqual(validateAuthoredSentence(lang, sentence, authored), [], `${pair.id}/${lang}`);
    assert.deepEqual(authored, corpus[lang][sentence]);
  }
});
