// The gloss a ja reader sees must be a *word*.
//
// The stored ja definition is an explanatory sentence on purpose — lib/translate.ts
// asks the model for one that "must not merely repeat the term" — so reading it as
// the headline printed 「バケツ」は、液体を積み込んだり運ぶために使用される… in the slot
// where a zh reader gets 水桶: on the 圖鑑 row, in the detail card, and on 複習's
// 求救提示. The short headword is `word_terms`, and it belongs on the headline.

import assert from "node:assert/strict";
import test from "node:test";
import { localizeWord } from "../lib/word-localize";
import type { Word } from "../types";

const JA_SENTENCE =
  "「バケツ」は、液体を積み込んだり運ぶために使用される、ハンドルと上向きの開口部を備えた円柱形の容器です。";

const bucket: Word = {
  id: "bucket",
  word: "bucket",
  category: "bathroom",
  partOfSpeech: "noun",
  pronunciation: "/ˈbʌk.ɪt/",
  imageUrl: "https://example.test/bucket.webp",
  status: "published",
  chinese: "水桶",
  chineseDefinition: "附提把、開口朝上的圓柱形容器，用來裝載或搬運液體。",
  englishDefinition: "An open, cylindrical container with a handle, used to carry liquids.",
  definitions: [
    { language: "zh", definition: "水桶", sortOrder: 0 },
    { language: "ja", definition: JA_SENTENCE, sortOrder: 0 },
    {
      language: "en",
      definition: "An open, cylindrical container with a handle, used to carry liquids.",
      sortOrder: 0,
    },
  ],
  examples: [],
  tags: [],
  relations: [],
};

test("a ja reader's headline is the headword, not the definition", () => {
  const w = localizeWord(bucket, "ja", undefined, "バケツ");
  assert.equal(w.chinese, "バケツ");
});

// Same shape as zh-Hant: a term on the headline, the sentence on the line below.
test("the ja definition moves to the explainer line", () => {
  const w = localizeWord(bucket, "ja", undefined, "バケツ");
  assert.equal(w.chineseDefinition, JA_SENTENCE);
});

test("zh-Hant is untouched: zh term over zh 釋義", () => {
  const w = localizeWord(bucket, "zh-Hant");
  assert.equal(w.chinese, "水桶");
  assert.equal(w.chineseDefinition, bucket.chineseDefinition);
});

// Load-bearing: a word the translate pipeline gave a definition but no headword
// still glosses, rather than falling all the way back to Chinese.
test("no ja headword falls back to the ja definition", () => {
  const w = localizeWord(bucket, "ja");
  assert.equal(w.chinese, JA_SENTENCE);
  assert.equal(w.chineseDefinition, undefined);
});

// The pre-word_terms rows stored the headword as the definition too.
test("a headword equal to the definition prints once", () => {
  const legacy: Word = {
    ...bucket,
    definitions: [
      { language: "zh", definition: "水桶", sortOrder: 0 },
      { language: "ja", definition: "バケツ", sortOrder: 0 },
    ],
  };
  const w = localizeWord(legacy, "ja", undefined, "バケツ");
  assert.equal(w.chinese, "バケツ");
  assert.equal(w.chineseDefinition, undefined);
});

// `word_terms(en)` is the English word itself, so an en reader keeps the
// definition — for a monolingual reader that sentence *is* the gloss.
test("en still reads the en definition as its gloss", () => {
  const w = localizeWord(bucket, "en");
  assert.equal(w.chinese, bucket.englishDefinition);
  assert.equal(w.chineseDefinition, undefined);
});

// A Chinese explainer is noise for a reader who chose ja precisely because
// they cannot read Chinese.
test("the zh 釋義 never leaks into a ja payload", () => {
  const w = localizeWord(bucket, "ja", undefined, "バケツ");
  assert.notEqual(w.chineseDefinition, bucket.chineseDefinition);
});
