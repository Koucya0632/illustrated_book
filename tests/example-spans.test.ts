import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spansCoverSentence, unlinkSelfReference } from "../lib/example-spans";
import {
  alignAuthoredSpans,
  containsGeneratedMetaGloss,
  validateAuthoredSentence,
  validateLearningSpanQuality,
} from "../lib/example-span-corpus";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { localizeSpans } from "../lib/word-localize";
import type { GlossSpanRow } from "../types";

// 詞塊 — the tappable split of an example sentence.
//
// Two things are worth pinning here and nothing else is. The coverage rule is
// the only part of the model's answer that can be checked, and it is checked in
// three places (script, server read, iOS render) — so it has to mean the same
// thing in all three. And the gloss-language fallback is load-bearing in a way
// that is easy to "simplify" away: losing a gloss loses the *tap*, so a missing
// translation must never quietly make a word untappable.

const span = (text: string, glosses: Record<string, string> = {}): GlossSpanRow => ({
  text,
  glosses,
});

test("spans that re-spell the sentence are accepted", () => {
  const spans = [span("I "), span("read", { "zh-Hant": "讀" }), span(" it.")];
  assert.ok(spansCoverSentence(spans, "I read it."));
});

test("a dropped character is rejected", () => {
  const spans = [span("I "), span("read", { "zh-Hant": "讀" }), span(" it")];
  assert.ok(!spansCoverSentence(spans, "I read it."));
});

// The likeliest way for a model to break coverage: it treats whitespace as a
// separator between chunks rather than as part of one.
test("normalised whitespace is rejected", () => {
  const spans = [span("I"), span("read", { "zh-Hant": "讀" }), span("it.")];
  assert.ok(!spansCoverSentence(spans, "I read it."));
});

test("extra material is rejected", () => {
  assert.ok(!spansCoverSentence([span("Hi"), span("."), span(" ")], "Hi."));
});

test("an empty split is rejected", () => {
  // Joins to "" and would otherwise pass for an empty sentence, while meaning
  // "the run failed" — which is exactly when it must be retried, not stored.
  assert.ok(!spansCoverSentence([], ""));
});

test("Japanese sentences carry no spaces to lean on", () => {
  const spans = [
    span("猫", { "zh-Hant": "貓" }),
    span("が"),
    span("窓", { "zh-Hant": "窗戶" }),
    span("を"),
    span("見ている", { "zh-Hant": "正在看" }),
    span("。"),
  ];
  assert.ok(spansCoverSentence(spans, "猫が窓を見ている。"));
});

test("model chunks are aligned back onto the exact sentence", () => {
  const sentence = "I replace my toothbrush when it wears out.";
  const aligned = alignAuthoredSpans("en", sentence, [
    { t: "I", r: "should be removed" },
    { t: "replace", z: "更換", j: "交換する", e: "replace", p: "verb" },
    { t: "my" },
    { t: "toothbrush", z: "牙刷", j: "歯ブラシ", e: "toothbrush", p: "noun" },
    { t: "when" },
    { t: "it" },
    { t: "wears", z: "磨損", j: "すり減る", e: "wears out", b: "wear out", p: "phrasal verb" },
    { t: "out" },
  ]);
  assert.equal(aligned.map(({ t }) => t).join(""), sentence);
  assert.ok(aligned.every((span) => !span.r));
});

test("alignment restores punctuation and function-word gaps as untappable spans", () => {
  const aligned = alignAuthoredSpans("en", "Before work, I charge my laptop.", [
    { t: "Before work", z: "上班前", j: "仕事の前に", e: "before work" },
    { t: "I charge my laptop", z: "我替筆電充電", j: "ノートパソコンを充電する", e: "I charge my laptop" },
  ]);
  assert.deepEqual(aligned.map(({ t }) => t), ["Before work", ", ", "I charge my laptop", "."]);
  assert.deepEqual(aligned.filter(({ z }) => z).map(({ t }) => t), ["Before work", "I charge my laptop"]);
});

test("too many tappable English units are rejected, while grammar gaps stay untappable", () => {
  const issues = validateLearningSpanQuality("en", [
    { t: "Since", z: "因為" },
    { t: " the" },
    { t: " hook", z: "掛鉤" },
    { t: " is" },
    { t: " loose", z: "鬆動" },
    { t: ", do not" },
    { t: " hang", z: "懸掛" },
    { t: " a" },
    { t: " heavy", z: "重的" },
    { t: " bag", z: "袋子" },
    { t: " near", z: "靠近" },
    { t: " this", z: "這個" },
    { t: " door", z: "門" },
    { t: "." },
  ]);
  assert.ok(issues.some((issue) => issue.includes("tappable spans; maximum is 8")));
  assert.ok(issues.some((issue) => issue.includes("grammar fragment is tappable")));
});

test("a whole sentence is not left as one oversized tap", () => {
  assert.ok(
    validateLearningSpanQuality("en", [{ t: "I use the microwave." }])
      .some((issue) => issue.includes("minimum is 2")),
  );
});

test("a short lead-in cannot disguise a near-sentence Japanese tap", () => {
  const issues = validateLearningSpanQuality("ja", [
    { t: "私は", z: "我" },
    { t: "毎朝シャワーを浴びます。", z: "每天早上洗澡。" },
  ]);
  assert.ok(
    issues.some((issue) => issue.includes("near-sentence span")),
    "the time expression and shower action must remain separately tappable",
  );
});

test("Japanese particles are untappable while verb inflection remains intact", () => {
  const poor = validateLearningSpanQuality("ja", [
    { t: "冬", z: "冬天" },
    { t: "は", z: "主題" },
    { t: "洗面所", z: "洗手間" },
    { t: "の" },
    { t: "床", z: "地板" },
    { t: "が" },
    { t: "冷たい", z: "冰冷" },
    { t: "ので、" },
    { t: "スリッパ", z: "拖鞋" },
    { t: "を" },
    { t: "置い", z: "放" },
    { t: "て" },
    { t: "います。" },
  ]);
  assert.ok(poor.some((issue) => issue.includes("grammar fragment is tappable")));

  assert.deepEqual(
    validateLearningSpanQuality("ja", [
      { t: "冬", z: "冬天" },
      { t: "は" },
      { t: "洗面所", z: "洗手間" },
      { t: "の" },
      { t: "床", z: "地板" },
      { t: "が" },
      { t: "冷たい", z: "冰冷" },
      { t: "ので、" },
      { t: "スリッパ", z: "拖鞋" },
      { t: "を" },
      { t: "置いています", z: "放著" },
      { t: "。" },
    ]),
    [],
  );
});

test("a Japanese reading covers the entire phrase, not only its last verb", () => {
  const sentence = "歯ブラシに歯磨き粉をつけてください。";
  const poor = validateAuthoredSentence("ja", sentence, [
    {
      t: sentence,
      z: "請把牙膏擠在牙刷上。",
      j: sentence,
      e: "Please put toothpaste on the toothbrush.",
      r: "つけてください",
    },
  ]);
  assert.ok(poor.some((issue) => issue.includes("reading omits kana")));
  assert.ok(poor.some((issue) => issue.includes("reading is too short")));

  assert.deepEqual(
    validateAuthoredSentence("ja", sentence, [
      {
        t: "歯ブラシ",
        z: "牙刷",
        j: "歯を磨くブラシ",
        e: "toothbrush",
        r: "はぶらし",
      },
      { t: "に" },
      {
        t: "歯磨き粉",
        z: "牙膏",
        j: "歯を磨くためのペースト",
        e: "toothpaste",
        r: "はみがきこ",
      },
      { t: "を" },
      {
        t: "つけてください",
        z: "請擠上",
        j: "付けてください",
        e: "please put on",
        r: "つけてください",
      },
      { t: "。" },
    ]),
    [],
  );
});

test("a Japanese reading spells kanji and Latin letters in kana", () => {
  const sentence = "入館カードを忘れました。";
  const glosses = {
    z: "我忘了門禁卡。",
    j: sentence,
    e: "I forgot my access card.",
  };
  assert.ok(
    validateAuthoredSentence("ja", sentence, [
      { t: sentence, r: "入館カードを忘れました", ...glosses },
    ]).some((issue) => issue.includes("without kanji or Latin letters")),
  );
  assert.deepEqual(
    validateAuthoredSentence("ja", sentence, [
      {
        t: "入館カード",
        r: "にゅうかんカード",
        z: "門禁卡",
        j: "建物に入るためのカード",
        e: "access card",
      },
      { t: "を" },
      {
        t: "忘れました",
        r: "わすれました",
        z: "忘記了",
        j: "持ってくるのを忘れました",
        e: "forgot",
      },
      { t: "。" },
    ]),
    [],
  );
});

test("contextual glosses reject parenthetical grammar notes", () => {
  const sentence = "牛乳を冷蔵庫に入れてください。";
  const issues = validateAuthoredSentence("ja", sentence, [
    {
      t: "牛乳を",
      z: "牛奶（加格助詞）",
      j: "牛乳を",
      e: "milk (object marker)",
      r: "ぎゅうにゅうを",
    },
    {
      t: "冷蔵庫に入れてください。",
      z: "請放進冰箱。",
      j: "冷蔵庫に入れてください。",
      e: "Please put it in the fridge.",
      r: "れいぞうこにいれてください",
    },
  ]);
  assert.ok(issues.some((issue) => issue.includes("grammar note")));
});

test("Japanese contextual glosses reject conjugation and usage explanations", () => {
  const sentence = "牛乳を開けたら冷蔵庫へ戻してください。";
  const issues = validateAuthoredSentence("ja", sentence, [
    {
      t: "牛乳",
      z: "牛奶",
      j: "牛乳",
      e: "milk",
      r: "ぎゅうにゅう",
    },
    { t: "を" },
    {
      t: "開けたら",
      z: "打開後",
      j: "開ける条件表現",
      e: "after opening",
      r: "あけたら",
    },
    {
      t: "冷蔵庫",
      z: "冰箱",
      j: "冷蔵庫",
      e: "fridge",
      r: "れいぞうこ",
    },
    { t: "へ" },
    {
      t: "戻してください",
      z: "請放回去",
      j: "戻す動作の依頼形",
      e: "put back",
      r: "もどしてください",
    },
    { t: "。" },
  ]);
  assert.equal(issues.filter((issue) => issue.includes("grammar note")).length, 0);
  assert.equal(
    containsGeneratedMetaGloss([
      { t: "開けたら", j: "開ける条件表現" },
      { t: "戻してください", j: "戻す動作の依頼形" },
    ]),
    true,
  );
});

// ---- gloss language ------------------------------------------------------

const rows: GlossSpanRow[] = [
  span("run", { "zh-Hant": "經營", ja: "経営する", en: "to manage" }),
  // Overlay missing for both ja and en — the common state until a backfill
  // catches up.
  span("shop", { "zh-Hant": "店鋪" }),
  span(" the "),
];

test("each UI language gets its own gloss", () => {
  assert.equal(localizeSpans(rows, "zh-Hant")[0].gloss, "經營");
  assert.equal(localizeSpans(rows, "ja")[0].gloss, "経営する");
  assert.equal(localizeSpans(rows, "en")[0].gloss, "to manage");
});

test("zh-Hans is converted from the zh-Hant base, never stored", () => {
  assert.equal(localizeSpans(rows, "zh-Hans")[0].gloss, "经营");
});

// The rule the whole feature leans on: whether a word can be tapped must not
// depend on the interface language. A ja reader losing every span the backfill
// has not translated would see the same sentence go half-dead and read it as a
// bug, not as a missing translation.
test("a missing translation falls back rather than losing the tap", () => {
  for (const lang of ["ja", "en", "zh-Hans"] as const) {
    const shop = localizeSpans(rows, lang)[1];
    assert.ok(shop.gloss, `${lang} lost the gloss on an untranslated span`);
  }
});

test("a span with no gloss in any language stays untappable", () => {
  for (const lang of ["zh-Hant", "zh-Hans", "ja", "en"] as const) {
    assert.equal(localizeSpans(rows, lang)[2].gloss, undefined);
  }
});

test("localizeSpans never leaks the stored gloss map to the wire", () => {
  for (const s of localizeSpans(rows, "en")) {
    assert.ok(!("glosses" in s), "every stored language would ship to every client");
  }
});

// The same class of bug tests/saved-community-words.test.ts was written for:
// SQL read as text still matches a regex when the table name is wrong, so the
// only real check is against the DDL. Nothing here reaches a database.
//
// Two filters this needs and that version did not. Comments are stripped
// first, because these files are mostly prose and a sentence ending "…the v2
// JOIN query" reads as a table named `query`. And a name followed by `(` is a
// set-returning function (`FROM unnest(...)`), not a relation. Without both,
// the check fails on correct code — and a check that cries wolf gets deleted.
function relationsQueriedBy(path: string): string[] {
  const src = readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
  return [
    ...src.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)\s*(\()?/g),
  ]
    .filter((m) => !m[2])
    .map((m) => m[1]);
}

function tablesInMigration(): Set<string> {
  const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  return new Set(
    [...migrate.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/g)].map((m) => m[1]),
  );
}

for (const path of ["../lib/data.ts", "../scripts/load-example-spans.ts"]) {
  test(`every table ${path} queries is one the migration creates`, () => {
    const created = tablesInMigration();
    const unknown = [...new Set(relationsQueriedBy(path))].filter((t) => !created.has(t));
    assert.deepEqual(unknown, [], `${path} queries relations nothing creates: ${unknown}`);
  });
}

// A guard on the guard: the filters above are broad enough to hide a real
// miss, so prove the check still sees the tables this feature added.
test("the spans tables are actually reached by the check", () => {
  const queried = new Set([
    ...relationsQueriedBy("../lib/data.ts"),
    ...relationsQueriedBy("../scripts/load-example-spans.ts"),
  ]);
  assert.ok(queried.has("sentence_spans"));
  assert.ok(queried.has("sentence_span_glosses"));
});

// This check exists because a literal NUL byte reached lib/data.ts, inside a
// template literal being used as a Map key. Nothing complained: tsc passed,
// the build passed, the deploy passed — and every span lookup missed, because
// the key was written with a NUL and read with a space. On screen that is
// indistinguishable from "not annotated yet". It also quietly turned the file
// binary, so `grep` stopped matching it while `awk` still did.
test("no source file contains stray control characters", () => {
  const files = [
    "../lib/data.ts",
    "../lib/example-spans.ts",
    "../lib/word-localize.ts",
    "../types/index.ts",
    "../scripts/load-example-spans.ts",
  ];
  const dirty: string[] = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // Everything below 0x20 except tab, newline and carriage return.
    // Written as escapes on purpose — a literal control character here
    // would be the very bug this test is looking for.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(src)) dirty.push(f);
  }
  assert.deepEqual(dirty, []);
});

// ---- the authored corpus ------------------------------------------------

// data/example-spans.json is product content, not a fixture: it is what every
// reader actually sees. The coverage rule is checked at load and again on the
// client, but both of those run somewhere nobody watches — a broken sentence
// just silently renders plain. This is the only place a bad edit fails loudly.
type AuthoredSpan = { t: string; z?: string; j?: string; e?: string; b?: string; p?: string; r?: string };
const authored = JSON.parse(
  readFileSync(new URL("../data/example-spans.json", import.meta.url), "utf8"),
) as Record<"en" | "ja", Record<string, AuthoredSpan[]>>;

const POS = new Set([
  "noun", "verb", "phrasal verb", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "interjection", "determiner", "numeral", "phrase", "expression",
]);

test("every authored sentence is re-spelled by its spans", () => {
  const broken: string[] = [];
  for (const lang of ["en", "ja"] as const) {
    for (const [sentence, spans] of Object.entries(authored[lang])) {
      if (!spansCoverSentence(spans.map((s) => ({ text: s.t })), sentence)) broken.push(sentence);
    }
  }
  assert.deepEqual(broken, []);
});

test("every current main-word example uses natural learning phrases", () => {
  const poor: string[] = [];
  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    for (const example of pair.examples) {
      for (const language of ["en", "ja"] as const) {
        const sentence = example[language];
        for (const issue of validateAuthoredSentence(language, sentence, authored[language][sentence])) {
          poor.push(`${pair.id}/${example.sortOrder}/${language}: ${issue}`);
        }
      }
    }
  }
  assert.deepEqual(poor, []);
});

test("the shower example keeps frequency separate from the shower action", () => {
  assert.deepEqual(
    authored.ja["私は毎朝シャワーを浴びます。"].map(({ t, z, j, e }) => ({ t, z, j, e })),
    [
      { t: "私", z: "我", j: "話し手自身", e: "I" },
      { t: "は", z: undefined, j: undefined, e: undefined },
      { t: "毎朝", z: "每天早上", j: "毎日の朝", e: "every morning" },
      { t: "シャワー", z: "淋浴", j: "シャワー", e: "shower" },
      { t: "を", z: undefined, j: undefined, e: undefined },
      { t: "浴びます", z: "洗澡", j: "体に水をかけます", e: "take a shower" },
      { t: "。", z: undefined, j: undefined, e: undefined },
    ],
  );
});

test("desk's katakana reading is the ordinary デスク, not a generated misspelling", () => {
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find(({ id }) => id === "desk");
  assert.ok(pair);
  const readings = pair.examples.flatMap((example) =>
    authored.ja[example.ja].map(({ r }) => r ?? ""),
  );
  const hiraganaReadings = readings.map((reading) =>
    [...reading].map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
    }).join(""),
  );
  assert.ok(hiraganaReadings.some((reading) => reading.includes("ですく")));
  assert.ok(hiraganaReadings.every((reading) => !reading.includes("でぇすく") && !reading.includes("でぃすく")));
});

// All three or none. A span glossed in one language only goes dark for every
// other reader, and whether a word is tappable must not vary by interface
// language — the rule `localizeSpans` exists to protect.
test("every gloss is authored in all three languages", () => {
  const partial: string[] = [];
  for (const lang of ["en", "ja"] as const) {
    for (const [sentence, spans] of Object.entries(authored[lang])) {
      for (const s of spans) {
        const n = [s.z, s.j, s.e].filter(Boolean).length;
        if (n !== 0 && n !== 3) partial.push(`${sentence} :: ${s.t}`);
      }
    }
  }
  assert.deepEqual(partial, []);
});

// `localizedPartOfSpeech` passes unknown labels through verbatim, so a typo
// here reaches the card as raw English instead of failing anywhere.
test("every part of speech is one iOS can localize", () => {
  const unknown = new Set<string>();
  for (const lang of ["en", "ja"] as const) {
    for (const spans of Object.values(authored[lang])) {
      for (const s of spans) if (s.p && !POS.has(s.p)) unknown.add(s.p);
    }
  }
  assert.deepEqual([...unknown], []);
});

// A Japanese card prints the reading under the headword; a glossed span with
// none leaves the line blank. English spans must carry none at all — the field
// is the JA-only half of the payload.
test("readings are on every glossed Japanese span and no English one", () => {
  const missing: string[] = [];
  const stray: string[] = [];
  for (const [sentence, spans] of Object.entries(authored.ja)) {
    for (const s of spans) if (s.z && !s.r) missing.push(`${sentence} :: ${s.t}`);
  }
  for (const [sentence, spans] of Object.entries(authored.en)) {
    for (const s of spans) if (s.r) stray.push(`${sentence} :: ${s.t}`);
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(stray, []);
});

// Both sentences name their own headword, and by design — an example exists to
// demonstrate the word, a definition opens by naming it. That makes the most
// obvious thing to tap the one span whose "看完整詳情" button would push the page
// the reader is already on. 1,303 example spans and 493 definition spans do it.
test("a span does not link to the word whose page it is shown on", () => {
  const spans = [
    { text: "「", wordId: undefined },
    { text: "デスク", wordId: "desk" },
    { text: "」は、", wordId: undefined },
    { text: "仕事", wordId: "work" },
    { text: "机です。", wordId: undefined },
  ];
  const out = unlinkSelfReference(spans, "desk")!;
  assert.equal(out[1].wordId, undefined, "the headword span keeps no link to itself");
  assert.equal(out[3].wordId, "work", "every other link survives");
  assert.deepEqual(
    out.map((s) => s.text),
    spans.map((s) => s.text),
    "coverage is untouched — only the link is dropped",
  );
});

// Tappability is derived from the gloss, never from the link, so removing the
// link must not quietly make the headword untappable.
test("unlinking leaves the span tappable", () => {
  const [span] = unlinkSelfReference([{ text: "デスク", gloss: "書桌", wordId: "desk" }], "desk")!;
  assert.equal(span.gloss, "書桌");
  assert.equal(span.wordId, undefined);
});

test("unlinking a sentence with no annotation stays undefined", () => {
  assert.equal(unlinkSelfReference(undefined, "desk"), undefined);
});

// The rule has to reach examples, not just 譯義 — examples are where it happens
// most, because an example sentence exists to show the word in use.
test("an example span does not link back to the word it demonstrates", () => {
  const spans = [
    { text: "I put a ", wordId: undefined },
    { text: "bath mat", gloss: "浴室地墊", wordId: "bath-mat" },
    { text: " beside the ", wordId: undefined },
    { text: "tub", gloss: "浴缸", wordId: "bathtub" },
    { text: ".", wordId: undefined },
  ];
  const out = unlinkSelfReference(spans, "bath-mat")!;
  assert.equal(out[1].wordId, undefined, "the demonstrated word links nowhere new");
  assert.equal(out[1].gloss, "浴室地墊", "and is still tappable");
  assert.equal(out[3].wordId, "bathtub", "a different word still links");
});

function exampleFor(wordId: string, sortOrder: 0 | 1) {
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find(({ id }) => id === wordId);
  assert.ok(pair, `missing pair for ${wordId}`);
  return pair.examples[sortOrder];
}

function tappable(language: "en" | "ja", sentence: string, text: string) {
  const span = authored[language][sentence]?.find((candidate) => candidate.t === text);
  assert.ok(span?.z && span.j && span.e, `${language}: ${JSON.stringify(text)} must be tappable in ${sentence}`);
  return span;
}

test("the audited bathroom translations stay aligned and natural", () => {
  assert.deepEqual(exampleFor("bucket", 1), {
    en: "Since the water was dirty, I changed the water in the bucket before rinsing the floor again.",
    ja: "水が汚れていたので、床をもう一度流す前にバケツの水を替えました。",
    zh: "水已經髒了，所以我再次沖地板前先換掉水桶裡的水。",
    cefrLevel: "B1",
    sortOrder: 1,
  });
  assert.equal(
    exampleFor("cleansing-oil", 1).ja,
    "メイクを落とすときは、乾いた肌にクレンジングオイルをなじませてから、水を加えて洗い流します。",
  );
  assert.equal(
    exampleFor("conditioner", 1).ja,
    "シャンプーを流したあと、コンディショナーを毛先中心になじませます。",
  );
  assert.equal(
    exampleFor("scale", 1).en,
    "To compare my weight accurately, I use the scale at the same time each morning.",
  );
  assert.equal(exampleFor("scale", 1).zh, "為了準確比較體重，我每天早上固定時間量體重。");
  assert.equal(
    exampleFor("wash-basin", 1).en,
    "I filled the wash basin with warm water so I could hand-wash the stained shirt.",
  );
  assert.equal(
    exampleFor("wash-basin", 1).zh,
    "為了手洗有污漬的襯衫，我在臉盆裡裝了溫水。",
  );
});

test("the audited bathroom click translations preserve contextual meaning and boundaries", () => {
  const bathSalts = exampleFor("bath-salts", 1);
  assert.equal(tappable("en", bathSalts.en, "bathtub").j, "バスタブ");
  assert.equal(tappable("ja", bathSalts.ja, "ためてから").z, "放滿後");

  const cleaner = exampleFor("cleaner", 0);
  assert.equal(tappable("en", cleaner.en, "cleaner").z, "清潔劑");

  const cottonBallSimple = exampleFor("cotton-ball", 0);
  assert.deepEqual(
    authored.ja[cottonBallSimple.ja].filter(({ z }) => z).map(({ t }) => t),
    ["コットンボール", "傷口", "消毒液", "つけました"],
  );
  const cottonBallComplex = exampleFor("cotton-ball", 1);
  assert.deepEqual(
    authored.ja[cottonBallComplex.ja].filter(({ z }) => z).map(({ t }) => t),
    ["袋", "開けたあと", "コットンボール", "ぬれないように", "清潔な", "容器", "入れます"],
  );

  for (const sortOrder of [0, 1] as const) {
    const cottonPad = exampleFor("cotton-pad", sortOrder);
    const tapped = authored.ja[cottonPad.ja].filter(({ z }) => z).map(({ t }) => t);
    assert.ok(tapped.includes("化粧用コットン"));
    assert.ok(tapped.includes("リムーバー"));
    assert.ok(tapped.every((text) => !/[をにへで]$/.test(text)), `${cottonPad.ja}: particle inside tap`);
  }

  const cottonSwab = exampleFor("cotton-swab", 1);
  assert.ok(!authored.en[cottonSwab.en].some(({ t }) => t.endsWith(", be")));
  assert.equal(tappable("en", cottonSwab.en, "cause").j, "引き起こす");

  const disinfectant = exampleFor("disinfectant", 1);
  assert.equal(tappable("ja", disinfectant.ja, "消毒液").z, "消毒液");
  const mirror = exampleFor("mirror", 0);
  assert.equal(tappable("ja", mirror.ja, "自分").e, "herself");
  const perfume = exampleFor("perfume", 1);
  assert.equal(tappable("ja", perfume.ja, "出勤前").e, "before going to the office");
  const sanitaryPad = exampleFor("sanitary-pad", 1);
  assert.equal(tappable("en", sanitaryPad.en, "my period").z, "月經");
  assert.equal(tappable("en", sanitaryPad.en, "starts").j, "始まる");
  assert.equal(tappable("en", sanitaryPad.en, "while I am out").z, "外出時");

  const shavingCream = exampleFor("shaving-cream", 1);
  assert.equal(tappable("en", shavingCream.en, "hair softens").z, "毛髮變軟");
  const shower = exampleFor("shower", 1);
  assert.equal(tappable("en", shower.en, "running late").z, "快遲到了");
  assert.equal(tappable("en", shower.en, "quick shower").j, "短いシャワー");
  assert.equal(tappable("ja", shower.ja, "済ませました").e, "finished with");

  const showerCurtain = exampleFor("shower-curtain", 0);
  assert.equal(tappable("ja", showerCurtain.ja, "お湯").e, "hot water");
  assert.equal(tappable("ja", showerCurtain.ja, "出す").e, "turn on");
  const squeegee = exampleFor("squeegee", 1);
  assert.equal(tappable("en", squeegee.en, "form mold").j, "カビが生える");
  const tampon = exampleFor("tampon", 0);
  assert.equal(tappable("ja", tampon.ja, "出る前").r, "でるまえ");

  for (const sortOrder of [0, 1] as const) {
    const toilet = exampleFor("toilet", sortOrder);
    assert.equal(tappable("en", toilet.en, "toilet").z, "馬桶");
    assert.equal(tappable("ja", toilet.ja, "トイレ").j, "便器");
  }
  const toiletSeat = exampleFor("toilet-seat", 1);
  assert.equal(tappable("en", toiletSeat.en, "toilet seat").z, "馬桶座圈");
  assert.equal(tappable("en", toiletSeat.en, "toilet seat").j, "便座");
  const toiletTank = exampleFor("toilet-tank", 0);
  assert.equal(tappable("en", toiletTank.en, "toilet tank").z, "馬桶水箱");

  const washBasin = exampleFor("wash-basin", 1);
  assert.equal(tappable("en", washBasin.en, "hand-wash").j, "手洗いする");
  assert.equal(tappable("ja", washBasin.ja, "手洗いする").e, "hand-wash");
});

test("the audited bedroom click translations preserve words, context, and inflection", () => {
  const bed = exampleFor("bed", 1);
  assert.equal(tappable("en", bed.en, "going to bed").z, "上床睡覺");
  assert.ok(!authored.en[bed.en].some(({ t, z }) => t === "go" && z));

  const bedSheet = exampleFor("bed-sheet", 1);
  assert.equal(tappable("en", bedSheet.en, "fewer wrinkles").z, "較少皺褶");
  const bedsideLamp = exampleFor("bedside-lamp", 1);
  assert.equal(tappable("ja", bedsideLamp.ja, "使います").z, "使用");
  const bedspread = exampleFor("bedspread", 1);
  assert.ok(!authored.en[bedspread.en].some(({ t, z }) => t === "does not end up on the floor" && z));
  const blanket = exampleFor("blanket", 1);
  assert.equal(tappable("en", blanket.en, "extra blanket").z, "備用毯子");

  const blinds = exampleFor("blinds", 1);
  assert.equal(tappable("en", blinds.en, "enters").e, "enters");
  assert.equal(tappable("ja", blinds.ja, "ブラインド").z, "百葉窗");
  assert.equal(tappable("ja", blinds.ja, "調整します").e, "adjust");
  assert.ok(!authored.ja[blinds.ja].some(({ t, z }) => t === "だけ" && z));

  const curtainSimple = exampleFor("curtain", 0);
  assert.ok(!authored.en[curtainSimple.en].some(({ t, z }) => t === "Please" && z));
  const curtainComplex = exampleFor("curtain", 1);
  assert.ok(!authored.en[curtainComplex.en].some(({ t, z }) => t === "before" && z));

  const door = exampleFor("door", 1);
  assert.equal(tappable("ja", door.ja, "直す").z, "修好");
  assert.equal(tappable("ja", door.ja, "閉めてください").e, "please close");
  const drawer = exampleFor("drawer", 1);
  assert.equal(tappable("ja", drawer.ja, "付けました").z, "貼上了");
  const hanger = exampleFor("hanger", 1);
  assert.equal(tappable("ja", hanger.ja, "崩れにくくなります").e, "keeps its shape");
  const humidifier = exampleFor("humidifier", 1);
  assert.equal(tappable("ja", humidifier.ja, "毎朝").z, "每天早上");
  const mattress = exampleFor("mattress", 1);
  assert.equal(tappable("ja", mattress.ja, "買い替える").z, "換買新的");
  const nightstand = exampleFor("nightstand", 1);
  assert.equal(tappable("ja", nightstand.ja, "喉が渇いた").z, "口渴");
  const photoFrame = exampleFor("photo-frame", 1);
  assert.equal(tappable("ja", photoFrame.ja, "落ちるおそれ").z, "掉落的風險");
  const vanity = exampleFor("vanity-table", 1);
  assert.equal(tappable("ja", vanity.ja, "選びました").j, "選んだ");

  for (const id of [
    "bed", "bed-sheet", "bedside-lamp", "bedspread", "blanket", "blinds",
    "curtain", "door", "drawer", "hanger", "humidifier", "mattress",
    "nightstand", "photo-frame", "quilt", "robe", "vanity-table", "window",
  ]) {
    const pair = MAIN_WORD_EXAMPLE_PAIRS.find((entry) => entry.id === id);
    assert.ok(pair, id);
    for (const example of pair.examples) {
      assert.equal(containsGeneratedMetaGloss(authored.en[example.en]), false, `${id}/en`);
      assert.equal(containsGeneratedMetaGloss(authored.ja[example.ja]), false, `${id}/ja`);
    }
  }
});

test("the audited living-room click translations expose content words with contextual glosses", () => {
  const armchair = exampleFor("armchair", 1);
  assert.equal(tappable("en", armchair.en, "gives").z, "提供");
  assert.equal(tappable("ja", armchair.ja, "支えてくれる").e, "supports me");

  const cabinet = exampleFor("cabinet", 1);
  assert.equal(tappable("en", cabinet.en, "cabinet").z, "櫃子");
  assert.equal(tappable("ja", cabinet.ja, "一番上の棚").e, "top shelf");

  const ceiling = exampleFor("ceiling-light", 0);
  assert.ok(!authored.en[ceiling.en].some(({ t, z }) => t === "Please" && z));

  const chargerSimple = exampleFor("charger", 0);
  assert.equal(tappable("en", chargerSimple.en, "phone charger").j, "スマートフォン用充電器");
  const chargerComplex = exampleFor("charger", 1);
  assert.equal(tappable("en", chargerComplex.en, "tonight").z, "今晚");
  assert.equal(tappable("ja", chargerComplex.ja, "コンセント").e, "power outlet");

  const coffeeTable = exampleFor("coffee-table", 1);
  assert.ok(!authored.en[coffeeTable.en].some(({ t, z }) => t === "Before" && z));

  const doorbell = exampleFor("doorbell", 1);
  assert.equal(tappable("en", doorbell.en, "monitor").z, "螢幕");
  assert.equal(tappable("ja", doorbell.ja, "ドア").e, "door");
  assert.equal(tappable("ja", doorbell.ja, "開けずに").e, "without opening");
  assert.ok(!authored.ja[doorbell.ja].some(({ t, z }) => t === "ドアを開けずに" && z));

  const doormat = exampleFor("doormat", 0);
  assert.equal(tappable("en", doormat.en, "coming in").z, "進門");
  assert.equal(tappable("ja", doormat.ja, "入る").z, "進門");

  const floorLamp = exampleFor("floor-lamp", 1);
  assert.equal(tappable("en", floorLamp.en, "chair").z, "椅子");
  assert.ok(!authored.en[floorLamp.en].some(({ t, z }) => t === "behind the chair" && z));

  const footstool = exampleFor("footstool", 1);
  assert.equal(tappable("en", footstool.en, "includes").z, "包含");
  assert.equal(tappable("en", footstool.en, "keep").z, "存放");
  assert.equal(tappable("en", footstool.en, "extra blankets").j, "予備の毛布");

  const gameConsole = exampleFor("game-console", 1);
  assert.equal(tappable("en", gameConsole.en, "leaving").z, "讓它維持");
  assert.equal(tappable("ja", gameConsole.ja, "切ってください").e, "please turn off");

  const pictureFrame = exampleFor("picture-frame", 0);
  assert.equal(tappable("en", pictureFrame.en, "put").z, "放入");

  const pottedPlantSimple = exampleFor("potted-plant", 0);
  assert.equal(tappable("ja", pottedPlantSimple.ja, "水").e, "water");
  assert.equal(tappable("ja", pottedPlantSimple.ja, "やってください").e, "please give");
  const pottedPlantComplex = exampleFor("potted-plant", 1);
  assert.equal(tappable("ja", pottedPlantComplex.ja, "明るい日陰").e, "bright indirect light");

  const outlet = exampleFor("power-outlet", 1);
  assert.equal(tappable("ja", outlet.ja, "つながないでください").j, "接続しないでください");

  const projector = exampleFor("projector", 0);
  assert.equal(tappable("en", projector.en, "projector").z, "投影機");
  const projectorScreen = exampleFor("projector-screen", 0);
  assert.equal(tappable("ja", projectorScreen.ja, "見る").z, "看");

  const recliner = exampleFor("recliner", 1);
  assert.equal(tappable("en", recliner.en, "reclining").z, "把椅背往後放");
  assert.equal(tappable("ja", recliner.ja, "足置き").e, "footrest");

  const remote = exampleFor("remote", 1);
  assert.equal(tappable("en", remote.en, "remote").z, "遙控器");
  const robotVacuum = exampleFor("robot-vacuum", 1);
  assert.equal(tappable("ja", robotVacuum.ja, "引っかからない").e, "does not get stuck");

  const sideTable = exampleFor("side-table", 1);
  assert.equal(tappable("en", sideTable.en, "use").z, "使用");
  assert.equal(tappable("en", sideTable.en, "non-slip coaster").z, "防滑杯墊");
  assert.equal(tappable("ja", sideTable.ja, "滑り止め付きのコースター").e, "non-slip coaster");

  const smokeDetector = exampleFor("smoke-detector", 0);
  assert.equal(tappable("ja", smokeDetector.ja, "煙式火災警報器").r, "けむりしきかさいけいほうき");

  const sofa = exampleFor("sofa", 1);
  assert.ok(!authored.en[sofa.en].some(({ t, z }) => t === "around" && z));
  assert.equal(tappable("en", sofa.en, "make").z, "騰出");

  const telephone = exampleFor("telephone", 1);
  assert.equal(tappable("ja", telephone.ja, "出て").z, "接聽");
  assert.equal(tappable("ja", telephone.ja, "伝言を預かっておいてください").e, "please take a message");

  const tvStand = exampleFor("tv-stand", 1);
  assert.ok(!authored.en[tvStand.en].some(({ t, z }) => t === "behind" && z));
  const vase = exampleFor("vase", 1);
  assert.equal(tappable("en", vase.en, "longer").z, "更久");
  const wallArt = exampleFor("wall-art", 1);
  assert.ok(!authored.en[wallArt.en].some(({ t, z }) => t === "Before hanging" && z));
  assert.equal(tappable("en", wallArt.en, "hanging").z, "懸掛");
});
