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
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import {
  MAIN_WORD_PROFESSIONS_CORRECTIONS as corrections,
  MAIN_WORD_PROFESSIONS_EXAMPLE_PAIRS as pairs,
  MAIN_WORD_PROFESSIONS_IDS as ids,
  MAIN_WORD_PROFESSIONS_WORDS as additions,
} from "../lib/main-word-professions-2026-09";
import {
  getWord as getPublicFallbackWord,
  getWordsByCategory as getPublicFallbackWordsByCategory,
  publicFallbackWords,
  searchWords as searchPublicFallbackWords,
  words,
} from "../lib/words";

const PROFESSION_SPAN_OVERLAYS = ["a", "b", "c", "d", "e"].map(
  (batch) => `example-spans-professions-2026-09-batch-${batch}.json`,
);

test("professions adds 100 unique picture-dictionary words to the guarded publication source", () => {
  assert.equal(ids.length, 100);
  assert.equal(additions.length, 100);
  assert.equal(corrections.length, 100);
  assert.equal(pairs.length, 100);
  assert.equal(new Set(ids).size, 100, "profession IDs must be unique");
  assert.equal(
    new Set(additions.map(({ word }) => word.trim().toLowerCase())).size,
    100,
    "English headwords must be unique",
  );
  assert.deepEqual(additions.map(({ id }) => id), ids);
  assert.deepEqual(corrections.map(({ id }) => id), ids);
  assert.deepEqual(pairs.map(({ id }) => id), ids);

  for (const addition of additions) {
    assert.equal(addition.category, "professions", addition.id);
    assert.equal(addition.partOfSpeech, "noun", addition.id);
    assert.ok(addition.word.trim(), `${addition.id}: missing English headword`);
    assert.ok(addition.chinese.trim(), `${addition.id}: missing Traditional Chinese headword`);
    assert.ok(addition.pronunciation.trim(), `${addition.id}: missing pronunciation`);
    assert.equal(words.filter(({ id }) => id === addition.id).length, 1, addition.id);
    assert.equal(
      words.filter(({ word }) => word === addition.word).length,
      1,
      addition.word,
    );
  }

  assert.equal(
    publicFallbackWords.some(({ category }) => category === "professions"),
    false,
    "the no-DB/DB-error fallback must not expose an unpublished guarded series",
  );
  assert.equal(getPublicFallbackWord(ids[0]), undefined);
  assert.deepEqual(getPublicFallbackWordsByCategory("professions"), []);
  assert.deepEqual(searchPublicFallbackWords("professions"), []);
});

test("every profession has complete definitions, Japanese readings, A2/B1 examples and a formal image", () => {
  const correctionById = new Map(corrections.map((correction) => [correction.id, correction]));
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const imageUrls = new Set<string>();

  for (const addition of additions) {
    assert.ok(addition.chineseDefinition.trim(), `${addition.id}: missing Chinese explanation`);
    assert.deepEqual(
      addition.definitions.map(({ language }) => language).sort(),
      ["en", "ja", "zh"],
      `${addition.id}: definitions`,
    );
    for (const definition of addition.definitions) {
      assert.ok(definition.definition.trim(), `${addition.id}/${definition.language}: empty definition`);
      assert.equal(definition.sortOrder, 0, `${addition.id}/${definition.language}: definition order`);
    }

    const correction = correctionById.get(addition.id);
    assert.ok(correction, `${addition.id}: missing Japanese correction`);
    assert.equal(MAIN_WORD_CORRECTIONS.filter(({ id }) => id === addition.id).length, 1);
    assert.ok(correction.ja?.trim(), `${addition.id}: missing Japanese headword`);
    assert.ok(correction.jaReading?.trim(), `${addition.id}: missing Japanese reading`);
    const jaDefinition = addition.definitions.find(({ language }) => language === "ja")!.definition;
    assert.ok(jaDefinition.startsWith(`「${correction.ja}」`), `${addition.id}: Japanese definition`);
    assert.equal(correction.oldJa, jaDefinition, `${addition.id}: seed-term guard`);
    assert.deepEqual(
      correction.jaDefinition,
      { old: jaDefinition, value: jaDefinition },
      `${addition.id}: Japanese explanation must survive the term correction`,
    );
    if (correction.jaReadingSegments) {
      assert.ok(correction.jaReadingSegments.length > 0, `${addition.id}: empty reading segments`);
      assert.equal(
        correction.jaReadingSegments.map(({ text }) => text).join(""),
        correction.ja,
        `${addition.id}: reading segments must reconstruct the headword`,
      );
      assert.equal(
        correction.jaReadingSegments.map(({ text, ruby }) => ruby ?? text).join(""),
        correction.jaReading,
        `${addition.id}: reading segments must reconstruct the reading`,
      );
    } else {
      assert.equal(
        correction.jaReading,
        correction.ja,
        `${addition.id}: an unsegmented reading is only valid for an all-kana headword`,
      );
    }

    const pair = pairById.get(addition.id);
    assert.ok(pair, `${addition.id}: missing example pair`);
    assert.equal(MAIN_WORD_EXAMPLE_PAIRS.filter(({ id }) => id === addition.id).length, 1);
    assert.deepEqual(
      pair.examples.map(({ sortOrder, cefrLevel }) => [sortOrder, cefrLevel]),
      [
        [0, "A2"],
        [1, "B1"],
      ],
      `${addition.id}: example levels and slots`,
    );
    for (const example of pair.examples) {
      for (const language of ["en", "ja", "zh"] as const) {
        assert.ok(example[language].trim(), `${addition.id}/${example.sortOrder}/${language}`);
      }
    }

    assert.match(
      addition.imageUrl,
      new RegExp(
        `^https://img\\.nexflow\\.team/word-images/${addition.id}-ai-[0-9a-f]{12}\\.webp$`,
      ),
      `${addition.id}: formal image URL`,
    );
    imageUrls.add(addition.imageUrl);
    assert.equal(
      words.find(({ id }) => id === addition.id)?.imageUrl,
      addition.imageUrl,
      `${addition.id}: catalogue image wiring`,
    );
  }

  assert.equal(imageUrls.size, 100, "every profession must have its own formal image URL");
});

test("all five profession span overlays provide complete reviewed English and Japanese annotations", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  const professionOverlays = overlays.filter(({ path }) =>
    path.pathname.includes("example-spans-professions-2026-09-batch-"),
  );
  assert.deepEqual(
    professionOverlays.map(({ path }) => path.pathname.split("/").at(-1)).sort(),
    PROFESSION_SPAN_OVERLAYS,
  );

  for (const { path, corpus: overlay } of professionOverlays) {
    assert.equal(Object.keys(overlay.en).length, 40, `${path.pathname}: English count`);
    assert.equal(Object.keys(overlay.ja).length, 40, `${path.pathname}: Japanese count`);
    for (const language of ["en", "ja"] as const) {
      for (const [sentence, authored] of Object.entries(overlay[language])) {
        assert.equal(base[language][sentence], undefined, `${sentence}: duplicated in base corpus`);
        assert.deepEqual(
          validateAuthoredSentence(language, sentence, authored as AuthoredSpan[]),
          [],
          `${path.pathname}/${language}/${sentence}`,
        );
        assert.deepEqual(authored, corpus[language][sentence], `${sentence}: overlay merge mismatch`);
      }
    }
  }

  assert.deepEqual(validateMainWordExampleSpanCoverage(pairs, corpus), []);
  for (const pair of pairs) {
    for (const example of pair.examples) {
      for (const language of ["en", "ja"] as const) {
        const sentence = example[language];
        const owners = professionOverlays.filter(
          ({ corpus: overlay }) => overlay[language][sentence] !== undefined,
        );
        assert.equal(
          owners.length,
          1,
          `${pair.id}/${example.sortOrder}/${language}: sentence must belong to exactly one profession overlay`,
        );
      }
    }
  }
});

test("the professions category and deploy migration are wired before catalogue corrections", () => {
  const professionCategories = categories.filter(({ id }) => id === "professions");
  assert.equal(professionCategories.length, 1);
  assert.equal(professionCategories[0].name, "Professions");
  assert.equal(professionCategories[0].nameZh, "職業");
  assert.ok(professionCategories[0].description.trim());
  assert.ok(professionCategories[0].descriptionEn?.trim());
  assert.equal(
    publicFallbackCategories.some(({ id }) => id === "professions"),
    false,
    "the fallback must not expose the guarded category",
  );

  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  const categoriesAt = migration.indexOf("await seedCategoriesIntoDb(sql)");
  const categoryTranslationsAt = migration.indexOf("await seedCategoryTranslationsIntoDb(sql)");
  const wordsAt = migration.indexOf("const missing = seedWords.filter");
  const correctionsAt = migration.indexOf(
    "const correctedWords = await applyMainWordCorrections(sql, publishedWordIds)",
  );
  const examplesAt = migration.indexOf(
    "const pairedExamples = await applyMainWordExamplePairs(",
  );

  for (const [label, offset] of [
    ["category seed", categoriesAt],
    ["category translations", categoryTranslationsAt],
    ["word seed", wordsAt],
    ["main-word corrections", correctionsAt],
    ["main-word examples", examplesAt],
  ] as const) {
    assert.notEqual(offset, -1, `missing ${label} migration step`);
  }
  assert.ok(categoriesAt < categoryTranslationsAt);
  assert.ok(categoryTranslationsAt < wordsAt);
  assert.ok(wordsAt < correctionsAt);
  assert.ok(correctionsAt < examplesAt);
  assert.match(migration, /SELECT 'professions',\s*'ja',\s*'職業'/);
  assert.match(migration, /\('professions',\s*'日常生活を支えるさまざまな仕事'\)/);
});
