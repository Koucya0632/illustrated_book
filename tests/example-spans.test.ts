import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spansCoverSentence, unlinkSelfReference } from "../lib/example-spans";
import { alignAuthoredSpans } from "../lib/example-span-corpus";
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
