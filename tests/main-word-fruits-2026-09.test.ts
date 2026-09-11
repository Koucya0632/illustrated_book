import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { categories } from "../lib/categories";
import {
  loadExampleSpanCorpus,
  partitionExampleSpanCorpus,
  validateAuthoredSentence,
  type AuthoredSpan,
} from "../lib/example-span-corpus";
import imageUrls from "../lib/image-urls.json";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import {
  MAIN_WORD_FRUITS_CORRECTIONS as corrections,
  MAIN_WORD_FRUITS_EXAMPLE_PAIRS as pairs,
  MAIN_WORD_FRUITS_IDS as ids,
  MAIN_WORD_FRUITS_WORDS as additions,
} from "../lib/main-word-fruits-2026-09";
import { words } from "../lib/words";

test("fruits is a complete picture-dictionary category with 34 distinct daily-life words", () => {
  assert.equal(ids.length, 34);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    additions.every(({ category }) => category === "fruits"),
    true,
  );
  assert.equal(categories.filter(({ id }) => id === "fruits").length, 1);
  assert.match(
    categories.find(({ id }) => id === "fruits")?.imageUrl ?? "",
    /^https:\/\/img\.nexflow\.team\/word-images\/category-fruits-fruits-20260911-[0-9a-f]{12}\.webp$/,
  );

  for (const word of additions) {
    assert.equal(words.filter(({ id }) => id === word.id).length, 1, word.id);
    assert.equal(
      words.filter(({ word: term }) => term === word.word).length,
      1,
      word.word,
    );
    assert.ok(word.chineseDefinition.trim(), word.id);
    assert.deepEqual(word.definitions.map(({ language }) => language).sort(), [
      "en",
      "ja",
      "zh",
    ]);
    for (const related of word.relatedWords) {
      assert.ok(
        words.some(({ id }) => id === related),
        `${word.id}: ${related}`,
      );
    }
  }
});

test("fruit readings, examples, and generated assets are wired into every source layer", () => {
  for (const word of additions) {
    const correction = corrections.find(({ id }) => id === word.id)!;
    assert.equal(
      MAIN_WORD_CORRECTIONS.filter(({ id }) => id === word.id).length,
      1,
    );
    const jaDefinition = word.definitions.find(
      ({ language }) => language === "ja",
    )!.definition;
    assert.ok(jaDefinition.startsWith(`「${correction.ja}」`), word.id);
    assert.ok(correction.jaReading?.trim(), word.id);
    if (correction.jaReadingSegments) {
      assert.equal(
        correction.jaReadingSegments.map(({ text }) => text).join(""),
        correction.ja,
      );
      assert.equal(
        correction.jaReadingSegments
          .map(({ text, ruby }) => ruby ?? text)
          .join(""),
        correction.jaReading,
      );
    } else {
      assert.equal(correction.jaReading, correction.ja);
    }

    const pair = pairs.find(({ id }) => id === word.id)!;
    assert.equal(
      MAIN_WORD_EXAMPLE_PAIRS.filter(({ id }) => id === word.id).length,
      1,
    );
    assert.deepEqual(
      pair.examples.map(({ sortOrder, cefrLevel }) => [sortOrder, cefrLevel]),
      [
        [0, "A2"],
        [1, "B1"],
      ],
    );
    for (const example of pair.examples) {
      for (const language of ["en", "ja", "zh"] as const)
        assert.ok(example[language].trim());
    }

    assert.match(
      imageUrls[word.id as keyof typeof imageUrls],
      new RegExp(
        `^https://img\\.nexflow\\.team/word-images/${word.id}-fruits-20260911-[0-9a-f]{12}\\.webp$`,
      ),
    );
  }
});

test("fresh deploys seed fruit category overlays before creating corrected Japanese cards", () => {
  const migration = readFileSync(
    new URL("../scripts/migrate.ts", import.meta.url),
    "utf8",
  );
  const correctionsSource = readFileSync(
    new URL("../lib/main-word-corrections.ts", import.meta.url),
    "utf8",
  );
  const categoriesAt = migration.indexOf("await seedCategoriesIntoDb(sql)");
  const translationsAt = migration.indexOf(
    "await seedCategoryTranslationsIntoDb(sql)",
  );

  assert.notEqual(categoriesAt, -1);
  assert.notEqual(translationsAt, -1);
  assert.ok(
    categoriesAt < translationsAt,
    "category translations must follow category seeds",
  );
  assert.match(
    correctionsSource,
    /back = wt\.term[\s\S]*c\.deck_key = 'image-ja'/,
  );
});

test("all 136 fruit sentence annotations stay in their reviewed overlay", () => {
  const corpus = loadExampleSpanCorpus();
  const { base, overlays } = partitionExampleSpanCorpus(corpus);
  const overlay = overlays.find(({ path }) =>
    path.pathname.endsWith("example-spans-fruits-2026-09.json"),
  );
  assert.ok(overlay);
  assert.equal(Object.keys(overlay.corpus.en).length, 68);
  assert.equal(Object.keys(overlay.corpus.ja).length, 68);
  for (const pair of pairs) {
    for (const example of pair.examples) {
      for (const language of ["en", "ja"] as const) {
        const sentence = example[language];
        assert.equal(
          base[language][sentence],
          undefined,
          `${pair.id}/${language}: base duplicated`,
        );
        const authored: AuthoredSpan[] = overlay.corpus[language][sentence];
        assert.deepEqual(
          validateAuthoredSentence(language, sentence, authored),
          [],
          `${pair.id}/${language}`,
        );
        assert.deepEqual(authored, corpus[language][sentence]);
      }
    }
  }
});

test("fruit examples and clickable glosses keep their reviewed contextual meaning", () => {
  const corpus = loadExampleSpanCorpus();
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  assert.equal(
    pairById.get("orange")?.examples[1].en,
    "Before putting the orange segments in the lunch box, I remove the seeds.",
  );
  assert.deepEqual(pairById.get("blueberry")?.examples[1], {
    en: "Since fresh blueberries were expensive, I bought a bag of frozen blueberries for smoothies.",
    ja: "生のブルーベリーが高かったので、スムージー用に冷凍ブルーベリーを一袋買いました。",
    zh: "因為新鮮藍莓很貴，我買了一袋冷凍藍莓來打果昔。",
    cefrLevel: "B1",
    sortOrder: 1,
  });
  assert.deepEqual(pairById.get("passion-fruit")?.examples[0], {
    en: "I spoon the passion fruit pulp over yogurt.",
    ja: "パッションフルーツの果肉をスプーンですくってヨーグルトにかけます。",
    zh: "我用湯匙把百香果果肉舀到優格上。",
    cefrLevel: "A2",
    sortOrder: 0,
  });
  assert.equal(
    pairById.get("watermelon")?.examples[1].en,
    "Since the watermelon was too large for the refrigerator, I cut it before storing it there.",
  );
  assert.equal(
    pairById.get("avocado")?.examples[1].ja,
    "アボカドがまだ硬ければ、切らずに調理台の上で追熟させます。",
  );

  const bannedChineseGlosses = new Set([
    "果實串",
    "柔軟且軟",
    "準備好吃",
    "收起",
    "哈密瓜",
    "櫃檯",
    "冷凍袋",
  ]);
  const bannedJapaneseGlosses = new Set([
    "片付ける",
    "小さな切れ端",
    "カウンター",
    "新しいライチの果物",
    "あげた",
    "冷凍の袋",
  ]);
  for (const pair of pairs) {
    for (const example of pair.examples) {
      for (const language of ["en", "ja"] as const) {
        for (const span of corpus[language][example[language]]) {
          if (!span.z) continue;
          assert.ok(
            span.j,
            `${pair.id}/${language}/${span.t}: missing Japanese gloss`,
          );
          assert.doesNotMatch(
            span.j,
            /果物の|の果物|の果実/,
            `${pair.id}/${language}/${span.t}`,
          );
          assert.equal(
            bannedChineseGlosses.has(span.z),
            false,
            `${pair.id}/${language}/${span.t}`,
          );
          assert.equal(
            bannedJapaneseGlosses.has(span.j),
            false,
            `${pair.id}/${language}/${span.t}`,
          );
        }
      }
    }
  }

  assert.equal(
    corpus.ja[
      "パイナップルを一口大に切った後、ふた付きの容器に入れて保存します。"
    ].find(({ t }) => t === "一口大")?.r,
    "ひとくちだい",
  );
  assert.deepEqual(
    corpus.en[
      "When cherries are in season, I buy a small pack and eat them the same day."
    ]
      .filter(({ z }) => z)
      .map(({ t }) => t),
    ["cherries", "in season", "buy", "small pack", "eat", "same day"],
  );
});
