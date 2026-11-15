import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import collectingHobbies from "../data/collecting-hobbies-series-2026-10.json";
import readingCorrection from "../data/collecting-hobbies-reading-correction-2026-10.json";
import {
  CATALOGUE_RELEASES,
  GUARDED_CATEGORY_IDS,
  GUARDED_SERIES,
  GUARDED_WORD_IDS,
  guardedPublicationState,
  isGuardedWord,
  RELEASE_CORRECTIONS,
  RELEASE_EXAMPLE_PAIRS,
  RELEASE_SPAN_OVERLAYS,
  releaseWordIds,
  TOPIC_GATE_PLAN,
  unpublishedGuardedWordIds,
} from "../lib/catalogue/releases";
import { candidateEntries, seriesFromCandidate } from "../lib/catalogue/series";
import { createCatalogueSync } from "../lib/catalogue/sync";
import { categories, getCategory, publicFallbackCategories } from "../lib/categories";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { getWord, getWordsByCategory, publicFallbackWords, searchWords, words } from "../lib/words";

const guardedTopics = [...GUARDED_CATEGORY_IDS];
const silent = { info: () => {}, warn: () => {} };

test("every release has a unique id and its span overlays exist once each", () => {
  const ids = CATALOGUE_RELEASES.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(RELEASE_SPAN_OVERLAYS).size, RELEASE_SPAN_OVERLAYS.length);
  for (const file of RELEASE_SPAN_OVERLAYS) {
    assert.ok(existsSync(new URL(`../data/${file}`, import.meta.url)), file);
  }
  const pairIds = MAIN_WORD_EXAMPLE_PAIRS.map(({ id }) => id);
  assert.equal(new Set(pairIds).size, pairIds.length, "one example pair per word");
});

test("a guarded release plans words the seed knows; a post-publication release seeds none", () => {
  const seeded = new Set(words.map(({ id }) => id));
  for (const release of CATALOGUE_RELEASES) {
    const ids = releaseWordIds(release.id);
    assert.ok(ids.length > 0, release.id);
    if (release.kind === "post-publication") {
      assert.equal(ids.some((id) => seeded.has(id)), false, release.id);
    } else {
      assert.equal(ids.filter((id) => !seeded.has(id)).length, 0, release.id);
    }
  }
});

test("the no-database fallback hides every guarded topic and every planned word", () => {
  assert.ok(guardedTopics.length >= 22);
  for (const topic of guardedTopics) {
    assert.equal(categories.filter(({ id }) => id === topic).length, 1, topic);
    assert.equal(publicFallbackCategories.some(({ id }) => id === topic), false, topic);
    assert.equal(getCategory(topic), undefined, topic);
    assert.deepEqual(getWordsByCategory(topic), [], topic);
  }
  for (const id of GUARDED_WORD_IDS) {
    assert.equal(getWord(id), undefined, id);
    assert.equal(searchWords(id).some((word) => word.id === id), false, id);
  }
});

test("there is one guard list: both fallbacks are exactly the registry's rule", () => {
  assert.deepEqual(
    publicFallbackWords.map(({ id }) => id),
    words.filter((word) => !isGuardedWord(word)).map(({ id }) => id),
  );
  assert.deepEqual(
    publicFallbackCategories.map(({ id }) => id),
    categories.filter(({ id }) => !GUARDED_CATEGORY_IDS.has(id)).map(({ id }) => id),
  );
  // A planned word moved in from another topic is guarded by its id alone.
  assert.equal(isGuardedWord({ id: "convenience-store", category: "street" }), true);
  assert.equal(isGuardedWord({ id: "not-planned", category: "bank" }), true);
  assert.equal(isGuardedWord({ id: "not-planned", category: "kitchen" }), false);
});

test("the live topic gate waits for releases that open a topic, not for expansions of a live one", () => {
  const opening = GUARDED_SERIES.filter(({ expandsLiveTopic }) => !expandsLiveTopic);
  assert.deepEqual(
    TOPIC_GATE_PLAN.ids,
    opening.flatMap(({ ids }) => ids),
  );
  assert.deepEqual(
    TOPIC_GATE_PLAN.categories,
    opening.flatMap(({ category, ids }) => ids.map(() => category)),
  );
  const expansions = GUARDED_SERIES.filter(({ expandsLiveTopic }) => expandsLiveTopic);
  assert.deepEqual(expansions.map(({ release }) => release), ["anime-fan-merch-expansion-2026-10"]);
});

test("a guarded topic opens only when every release plans published in it", () => {
  for (const topic of guardedTopics) {
    const plans = GUARDED_SERIES.filter(({ category }) => category === topic);
    const all = plans.flatMap(({ ids }) => ids.map((id) => ({ id, category: topic })));
    const variants: Array<[string, { id: string; category: string }[], boolean]> = [
      ["absent", [], false],
      ["one missing", all.slice(1), false],
      ["one in another topic", all.map((row, i) => (i ? row : { ...row, category: "office" })), false],
      ["complete", all, true],
    ];
    if (plans.length > 1) {
      variants.push(["only the first release", plans[0].ids.map((id) => ({ id, category: topic })), false]);
    }
    for (const [label, published, open] of variants) {
      const state = guardedPublicationState(published);
      assert.equal(state.get(topic), open, `${topic}: ${label}`);
      const held = unpublishedGuardedWordIds(state);
      assert.equal(all.every(({ id }) => held.has(id)), !open, `${topic}: ${label}`);
    }
  }
});

test("a candidate file becomes seed words, identity Japanese corrections and two-example pairs", () => {
  const entries = candidateEntries(collectingHobbies);
  const series = seriesFromCandidate(entries, {
    previousJaReading: (id) =>
      readingCorrection.entries.find((entry) => entry.wordId === id)?.before.reading,
  });
  assert.deepEqual(series.ids, entries.map(({ id }) => id));
  for (const word of series.words) {
    assert.equal("ja" in word || "jaReading" in word || "jaReadingSegments" in word, false);
  }
  for (const [i, correction] of series.corrections.entries()) {
    const entry = entries[i];
    assert.equal(correction.ja, entry.ja);
    assert.equal(correction.jaDefinition?.old, correction.jaDefinition?.value);
    const before = readingCorrection.entries.find(({ wordId }) => wordId === entry.id);
    assert.equal(correction.oldJaReading, before?.before.reading ?? entry.jaReading);
  }
  assert.ok(readingCorrection.entries.length > 0);
  for (const pair of series.examplePairs) {
    assert.deepEqual(pair.examples.map(({ sortOrder }) => sortOrder), [0, 1]);
  }
  const registered = RELEASE_CORRECTIONS.filter(({ id }) => series.ids.includes(id));
  assert.deepEqual(registered, series.corrections);
  assert.deepEqual(
    RELEASE_EXAMPLE_PAIRS.filter(({ id }) => series.ids.includes(id)),
    series.examplePairs,
  );
});

type Call = { query: string; values: unknown[] };

/** Records every statement; answers the few reads seeding makes. */
function fakeSql(published: { id: string; category: string }[]) {
  const calls: Call[] = [];
  const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?").replace(/\s+/g, " ").trim();
    calls.push({ query, values });
    if (query.startsWith("SELECT id, category FROM words")) {
      const ids = values[0] as string[];
      return published.filter(({ id }) => ids.includes(id));
    }
    if (query.startsWith("SELECT id FROM words")) return [];
    if (query.includes("RETURNING id")) return [{ id: calls.length }];
    if (query.includes("count(*)::int AS c")) return [{ c: 0 }];
    return [];
  };
  return { sql, calls };
}

test("routine seeding never writes a guarded word, topic or image before publication", async () => {
  const bank = GUARDED_SERIES.find(({ category }) => category === "bank")!;
  for (const published of [false, true]) {
    const { sql, calls } = fakeSql(
      published ? bank.ids.map((id) => ({ id, category: "bank" })) : [],
    );
    const sync = createCatalogueSync(sql, { categories, words }, silent);
    await sync.seedCategories();
    const { seeded, deferred } = await sync.seedMissingWords();
    await sync.syncWordImages();

    const topicWrites = calls
      .filter(({ query }) => query.startsWith("INSERT INTO categories"))
      .map(({ values }) => values[0]);
    assert.equal(topicWrites.includes("bank"), published);
    assert.equal(topicWrites.includes("kitchen"), true);
    assert.equal(topicWrites.includes("professions"), false, "other guarded topics stay unwritten");

    const wordWrites = calls
      .filter(({ query }) => query.startsWith("INSERT INTO words"))
      .map(({ values }) => values[0] as string);
    assert.equal(wordWrites.some((id) => GUARDED_WORD_IDS.has(id)), false);
    assert.deepEqual(new Set(wordWrites), new Set(seeded));
    assert.ok(deferred.length > 0 && deferred.every((id) => isGuardedWord(words.find((w) => w.id === id)!)));

    const imageSync = calls.find(({ query }) => query.startsWith("UPDATE words w SET image_url"))!;
    const imageIds = imageSync.values[0] as string[];
    assert.equal(bank.ids.some((id) => imageIds.includes(id)), published);
    assert.equal(
      GUARDED_SERIES.filter(({ category }) => category !== "bank")
        .some(({ ids }) => ids.some((id) => imageIds.includes(id))),
      false,
    );

    const guardReads = calls.filter(({ query }) => query.startsWith("SELECT id, category FROM words"));
    assert.equal(guardReads.length, 1, "the guard state is read once per sync");
  }
});
