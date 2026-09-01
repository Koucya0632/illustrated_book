import { readFileSync } from "node:fs";
import { spansCoverSentence } from "./example-spans";
import type { MainWordExamplePair } from "./main-word-example-pairs";

export type SentenceLanguage = "en" | "ja";

export interface AuthoredSpan {
  t: string;
  z?: string;
  j?: string;
  e?: string;
  b?: string;
  p?: string;
  r?: string;
}

export type ExampleSpanCorpus = Record<SentenceLanguage, Record<string, AuthoredSpan[]>>;

export const EXAMPLE_SPAN_PARTS_OF_SPEECH = new Set([
  "noun",
  "verb",
  "phrasal verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "determiner",
  "numeral",
  "phrase",
  "expression",
]);

export const MIN_LEARNING_SPANS = 2;
export const MAX_LEARNING_SPANS = 8;
export const MAX_LEARNING_SPAN_FRACTION = 0.83;

const ENGLISH_DETACHED_GRAMMAR = new Set([
  "a",
  "an",
  "the",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "with",
  "and",
  "or",
  "but",
  "because",
  "since",
  "although",
  "though",
  "if",
  "unless",
  "when",
  "while",
  "until",
  "than",
]);

const JAPANESE_DETACHED_GRAMMAR = new Set([
  "は",
  "が",
  "を",
  "に",
  "へ",
  "で",
  "と",
  "の",
  "も",
  "や",
  "か",
  "ね",
  "よ",
  "て",
  "います",
  "いました",
  "ください",
  "ます",
  "ました",
  "ません",
  "です",
]);

const META_GLOSS_PATTERN = /[（）()]|(?:助詞|主語標示|做主語|做受詞|作為受詞|賓語|主格|賓格|目的格|敬語|代名詞|持續狀態|持続状態|主題標示|賦予目的)/u;
const GENERATED_META_GLOSS_PATTERN = /(?:動作|表現|文法|活用|意味|テ形|て形|タ形|た形|依頼形|丁寧な依頼|動作の依頼|ように頼む|ようお願い|ことを頼む|頼み$|語りかけ|行為|条件表現|条件を示す|否定形|過去形|現在形|未来形|連用形|辞書形|基本形|命令形|受身形|受け身形|可能形|意向形|助動詞)/u;

/** Every gloss that reads as generator narration, with enough context to see why.
 *
 * The boolean form below answers "reject this?", which is all the pipeline needs, and
 * nothing at all when you are trying to work out what the model keeps writing. Both
 * views read the same pattern so they can never disagree about what counts.
 */
export function generatedMetaGlossHits(
  spans: AuthoredSpan[] | undefined,
): Array<{ index: number; field: "z" | "j" | "e"; text: string; gloss: string }> {
  const hits: Array<{ index: number; field: "z" | "j" | "e"; text: string; gloss: string }> = [];
  for (const [index, span] of (spans ?? []).entries()) {
    for (const field of ["z", "j", "e"] as const) {
      const gloss = span[field];
      if (typeof gloss === "string" && GENERATED_META_GLOSS_PATTERN.test(gloss)) {
        hits.push({ index, field, text: span.t, gloss });
      }
    }
  }
  return hits;
}

/** Reject generator narration that is structurally valid but not a learnable gloss. */
export function containsGeneratedMetaGloss(spans: AuthoredSpan[] | undefined): boolean {
  return generatedMetaGlossHits(spans).length > 0;
}

function learningText(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();
}

export function isStandaloneGrammarSpan(
  language: SentenceLanguage,
  text: string,
): boolean {
  const normalized = learningText(text);
  return language === "en"
    ? ENGLISH_DETACHED_GRAMMAR.has(normalized.toLocaleLowerCase("en"))
    : JAPANESE_DETACHED_GRAMMAR.has(normalized);
}

function kanaSequence(text: string): string {
  return [...text.normalize("NFKC")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
    })
    .filter((character) => /[ぁ-ゖー]/u.test(character))
    .join("");
}

function preservesSequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
  }
  return index === needle.length;
}

function semanticCharacterCount(text: string): number {
  return [...text.normalize("NFKC")].filter((character) => /[\p{L}\p{N}ー]/u.test(character)).length;
}

function hasLexicalTrailingPeriod(text: string): boolean {
  const trimmed = text.trim();
  return text === trimmed && /(?:\b[ap]\.m\.|(?:\b[A-Za-z]\.){2,})$/iu.test(trimmed);
}

function isTappableSpan(span: AuthoredSpan): boolean {
  return Boolean(span.z || span.j || span.e);
}

/**
 * Reject technically valid but pedagogically poor splits.
 *
 * Definition and example annotations deliberately share one interaction
 * model: content words and fixed expressions are tappable, while function
 * words, whitespace and punctuation remain present as untappable spans. Count
 * and size limits therefore apply to tappable learning units, not the complete
 * set of spans needed to reproduce the sentence exactly.
 */
export function validateLearningSpanQuality(
  language: SentenceLanguage,
  spans: AuthoredSpan[],
): string[] {
  const issues: string[] = [];
  const tappableSpans = spans.filter(isTappableSpan);
  if (tappableSpans.length < MIN_LEARNING_SPANS) {
    issues.push(`sentence has ${tappableSpans.length} tappable span; minimum is ${MIN_LEARNING_SPANS}`);
  }
  if (tappableSpans.length > MAX_LEARNING_SPANS) {
    issues.push(`sentence has ${tappableSpans.length} tappable spans; maximum is ${MAX_LEARNING_SPANS}`);
  }

  const sentenceSemanticLength = spans.reduce(
    (total, span) => total + semanticCharacterCount(span.t),
    0,
  );
  const largestSemanticLength = Math.max(
    0,
    ...tappableSpans.map((span) => semanticCharacterCount(span.t)),
  );
  if (
    tappableSpans.length > 1 &&
    sentenceSemanticLength >= 8 &&
    largestSemanticLength / sentenceSemanticLength >= MAX_LEARNING_SPAN_FRACTION
  ) {
    issues.push(
      `near-sentence span covers ${largestSemanticLength}/${sentenceSemanticLength} semantic characters; maximum fraction is below ${MAX_LEARNING_SPAN_FRACTION}`,
    );
  }

  const detached: string[] = [];
  const nonSemantic: string[] = [];
  for (const [index, span] of spans.entries()) {
    if (!isTappableSpan(span)) continue;
    const text = learningText(span.t);
    if (!/[\p{L}\p{N}]/u.test(text)) {
      nonSemantic.push(`${index}:${JSON.stringify(span.t)}`);
      continue;
    }
    if (text !== span.t && !hasLexicalTrailingPeriod(span.t)) {
      issues.push(
        `tappable span ${index} includes surrounding function text, spacing, or punctuation: ${JSON.stringify(span.t)}`,
      );
    }
    if (isStandaloneGrammarSpan(language, text)) {
      detached.push(`${index}:${JSON.stringify(span.t)}`);
    }
  }
  if (nonSemantic.length > 0) {
    issues.push(`punctuation or whitespace is tappable: ${nonSemantic.join(", ")}`);
  }
  if (detached.length > 0) {
    issues.push(`grammar fragment is tappable: ${detached.join(", ")}`);
  }
  return issues;
}

export function loadExampleSpanCorpus(): ExampleSpanCorpus {
  const path = new URL("../data/example-spans.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as ExampleSpanCorpus;
}

export function validateAuthoredSentence(
  language: SentenceLanguage,
  sentence: string,
  spans: AuthoredSpan[] | undefined,
): string[] {
  if (!spans) return ["missing annotation"];
  const issues: string[] = [];
  if (!spansCoverSentence(spans.map(({ t }) => ({ text: t })), sentence)) {
    issues.push("spans do not reproduce the sentence exactly");
  }
  for (const [index, span] of spans.entries()) {
    const glossCount = [span.z, span.j, span.e].filter(Boolean).length;
    if (glossCount !== 0 && glossCount !== 3) {
      issues.push(`span ${index} must have all three glosses or none`);
    }
    if (span.p && !EXAMPLE_SPAN_PARTS_OF_SPEECH.has(span.p)) {
      issues.push(`span ${index} has unsupported part of speech: ${span.p}`);
    }
    if (language === "ja" && glossCount === 3 && !span.r) {
      issues.push(`span ${index} is a glossed Japanese span without a reading`);
    }
    if (language === "ja" && glossCount === 3 && span.r) {
      const sourceKana = kanaSequence(span.t);
      const readingKana = kanaSequence(span.r);
      const sourceLength = semanticCharacterCount(span.t);
      const readingLength = semanticCharacterCount(span.r);
      if (/[\p{Script=Han}\p{Script=Latin}]/u.test(span.r)) {
        issues.push(`span ${index} reading must spell the complete phrase in kana, without kanji or Latin letters`);
      }
      if (sourceKana && !preservesSequence(sourceKana, readingKana)) {
        issues.push(`span ${index} reading omits kana from the complete phrase`);
      }
      if (readingLength < Math.ceil(sourceLength * 0.8)) {
        issues.push(`span ${index} reading is too short for the complete phrase`);
      }
    }
    if (language === "en" && span.r) {
      issues.push(`span ${index} is an English span with a Japanese reading`);
    }
    for (const [glossLanguage, gloss] of [["z", span.z], ["j", span.j], ["e", span.e]] as const) {
      if (gloss && META_GLOSS_PATTERN.test(gloss)) {
        issues.push(`span ${index} ${glossLanguage} gloss contains a grammar note instead of only contextual meaning`);
      }
    }
    if (language === "ja" && span.t.includes("前に") && span.z?.includes("前面")) {
      issues.push(`span ${index} z gloss translates temporal 前に as spatial 前面`);
    }
  }
  issues.push(...validateLearningSpanQuality(language, spans));
  return issues;
}

/** Restore function words, whitespace and punctuation between semantic chunks.
 *
 * The gaps intentionally become their own untappable spans. This is the same
 * representation used by target-definition annotations and prevents a tap on
 * a content word from silently expanding into an entire clause translation.
 */
export function alignAuthoredSpans(
  language: SentenceLanguage,
  sentence: string,
  spans: AuthoredSpan[],
): AuthoredSpan[] {
  let cursor = 0;
  const aligned: AuthoredSpan[] = [];
  for (const [index, span] of spans.entries()) {
    if (!span.t) throw new Error(`span ${index} has empty text`);
    const found = sentence.indexOf(span.t, cursor);
    if (found < 0) {
      throw new Error(`span ${index} text is not present in sentence order: ${span.t}`);
    }
    const gap = sentence.slice(cursor, found);
    if (gap) aligned.push({ t: gap });
    const next = { ...span };
    if (language === "en") delete next.r;
    aligned.push(next);
    cursor = found + span.t.length;
  }
  if (cursor < sentence.length) aligned.push({ t: sentence.slice(cursor) });
  return aligned;
}

export function validateMainWordExampleSpanCoverage(
  pairs: MainWordExamplePair[],
  corpus: ExampleSpanCorpus,
): string[] {
  const issues: string[] = [];
  for (const pair of pairs) {
    for (const example of pair.examples) {
      for (const [language, sentence] of [
        ["en", example.en],
        ["ja", example.ja],
      ] as const) {
        const sentenceIssues = validateAuthoredSentence(
          language,
          sentence,
          corpus[language][sentence],
        );
        for (const issue of sentenceIssues) {
          issues.push(`${pair.id}/${example.sortOrder}/${language}: ${issue}`);
        }
      }
    }
  }
  return issues;
}
