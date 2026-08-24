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
    if (language === "en" && span.r) {
      issues.push(`span ${index} is an English span with a Japanese reading`);
    }
  }
  return issues;
}

/** Restore whitespace and punctuation a model may leave between semantic
 * chunks. The model still has to return every chunk in the original order;
 * this only assigns the untouched gaps to the following/last span. */
export function alignAuthoredSpans(
  language: SentenceLanguage,
  sentence: string,
  spans: AuthoredSpan[],
): AuthoredSpan[] {
  let cursor = 0;
  const aligned = spans.map((span, index) => {
    if (!span.t) throw new Error(`span ${index} has empty text`);
    const found = sentence.indexOf(span.t, cursor);
    if (found < 0) {
      throw new Error(`span ${index} text is not present in sentence order: ${span.t}`);
    }
    const next = { ...span, t: sentence.slice(cursor, found) + span.t };
    if (language === "en") delete next.r;
    cursor = found + span.t.length;
    return next;
  });
  if (aligned.length > 0 && cursor < sentence.length) {
    aligned[aligned.length - 1] = {
      ...aligned[aligned.length - 1],
      t: aligned[aligned.length - 1].t + sentence.slice(cursor),
    };
  }
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
