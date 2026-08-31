#!/usr/bin/env node

import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PROJECT_ROOT = "/Users/rex/Desktop/tuji/tuji-web";
const SIMPLE_LEVELS = new Set(["A1", "A2"]);
const COMPLEX_LEVELS = new Set(["B1", "B2"]);
const VERDICTS = new Set(["pass", "fail", "uncertain"]);
const MAX_LEARNING_SPANS = 8;
const MIN_LEARNING_SPANS = 2;
const MAX_LEARNING_SPAN_FRACTION = 0.83;
const ENGLISH_DETACHED_GRAMMAR = new Set([
  "a", "an", "the", "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "can", "could", "will", "would",
  "shall", "should", "may", "might", "must", "to", "of", "in", "on", "at", "by",
  "for", "from", "with", "and", "or", "but", "because", "since", "although", "though",
  "if", "unless", "when", "while", "until", "than",
]);
const JAPANESE_DETACHED_GRAMMAR = new Set([
  "は", "が", "を", "に", "へ", "で", "と", "の", "も", "や", "か", "ね", "よ", "て",
  "います", "いました", "ください", "ます", "ました", "ません", "です",
]);
const REVIEW_CATEGORIES = new Set([
  "example-count",
  "missing-translation",
  "difficulty-mismatch",
  "duplicate-example",
  "semantic-mismatch",
  "daily-life-mismatch",
  "unnatural-language",
  "translation-mismatch",
  "missing-click-translation",
  "invalid-click-translation",
]);

const GENERIC_TEMPLATE_PATTERNS = {
  en: [
    /^You can see .+ (?:on|in|at) the .+\.$/i,
    /^I need .+ (?:at|in) the .+\.$/i,
    /^I use .+ every day\.$/i,
    /^This is (?:a|an|the) .+\.$/i,
    /^The .+ is in the bathroom\.$/i,
  ],
  ja: [
    /^街で.+を見ることができます。$/u,
    /^オフィスで.+が必要です。$/u,
    /^これは.+です。$/u,
    /^.+はバスルームにあります。$/u,
  ],
  zh: [
    /^你可以在街上看到.+。$/u,
    /^我在辦公室需要.+。$/u,
    /^這是.+。$/u,
    /^.+在浴室裡。$/u,
  ],
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textOrNull(value) {
  return typeof value === "string" ? value : null;
}

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function rendered(value) {
  if (value === undefined) return "missing";
  const result = JSON.stringify(value);
  if (result === undefined) return String(value);
  return result.length > 240 ? `${result.slice(0, 237)}...` : result;
}

function normalizedSentence(value) {
  return trimmed(value).normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

function roleForSortOrder(sortOrder) {
  if (sortOrder === 0) return "simple";
  if (sortOrder === 1) return "complex";
  return "extra";
}

function normalizedSpanAudit(value) {
  if (!isObject(value)) return null;
  return {
    spanCount: Number.isInteger(value.spanCount) ? value.spanCount : null,
    glossedSpanCount: Number.isInteger(value.glossedSpanCount) ? value.glossedSpanCount : null,
    partialGlossCount: Number.isInteger(value.partialGlossCount) ? value.partialGlossCount : null,
    missingReadingCount: Number.isInteger(value.missingReadingCount) ? value.missingReadingCount : null,
    unexpectedReadingCount: Number.isInteger(value.unexpectedReadingCount)
      ? value.unexpectedReadingCount
      : null,
    reconstructed: textOrNull(value.reconstructed),
    texts: Array.isArray(value.texts) && value.texts.every((text) => typeof text === "string")
      ? value.texts
      : null,
    glossed: Array.isArray(value.glossed) && value.glossed.every((item) => typeof item === "boolean")
      ? value.glossed
      : null,
    readings: Array.isArray(value.readings) && value.readings.every(
      (reading) => reading === null || typeof reading === "string",
    )
      ? value.readings
      : null,
    metaGlossCount: Number.isInteger(value.metaGlossCount) ? value.metaGlossCount : null,
  };
}

function learningSpanText(text) {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();
}

function hasLexicalTrailingPeriod(text) {
  const trimmedText = text.trim();
  return text === trimmedText && /(?:\b[ap]\.m\.|(?:\b[A-Za-z]\.){2,})$/iu.test(trimmedText);
}

export function clickTranslationBoundaryProblems(language, texts, glossed = null) {
  if (!Array.isArray(texts)) return [];
  const problems = [];
  const tappable = Array.isArray(glossed) && glossed.length === texts.length
    ? glossed
    : texts.map(() => true);
  const tappableCount = tappable.filter(Boolean).length;
  if (tappableCount < MIN_LEARNING_SPANS) {
    problems.push(`too few tappable spans: ${tappableCount} < ${MIN_LEARNING_SPANS}`);
  }
  if (tappableCount > MAX_LEARNING_SPANS) {
    problems.push(`too many tappable spans: ${tappableCount} > ${MAX_LEARNING_SPANS}`);
  }
  const detached = [];
  const nonSemantic = [];
  for (const [index, raw] of texts.entries()) {
    if (!tappable[index]) continue;
    const text = learningSpanText(raw);
    if (!/[\p{L}\p{N}]/u.test(text)) {
      nonSemantic.push({ index, text: raw });
      continue;
    }
    if (text !== raw && !hasLexicalTrailingPeriod(raw)) {
      problems.push(`tappable span includes surrounding function text, spacing, or punctuation: ${rendered({ index, text: raw })}`);
    }
    if (
      (language === "en" && ENGLISH_DETACHED_GRAMMAR.has(text.toLocaleLowerCase("en"))) ||
      (language === "ja" && JAPANESE_DETACHED_GRAMMAR.has(text))
    ) {
      detached.push({ index, text: raw });
    }
  }
  if (nonSemantic.length > 0) problems.push(`tappable punctuation/space: ${rendered(nonSemantic)}`);
  if (detached.length > 0) problems.push(`tappable grammar fragment: ${rendered(detached)}`);

  const sentenceLength = texts.reduce((total, text) => total + semanticCharacterCount(text), 0);
  const largestTappable = Math.max(
    0,
    ...texts.map((text, index) => tappable[index] ? semanticCharacterCount(text) : 0),
  );
  if (
    tappableCount > 1 &&
    sentenceLength >= 8 &&
    largestTappable / sentenceLength >= MAX_LEARNING_SPAN_FRACTION
  ) {
    problems.push(
      `near-sentence tappable span: ${largestTappable}/${sentenceLength} semantic characters >= ${MAX_LEARNING_SPAN_FRACTION}`,
    );
  }
  return problems;
}

function kanaSequence(text) {
  return [...text.normalize("NFKC")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
    })
    .filter((character) => /[ぁ-ゖー]/u.test(character))
    .join("");
}

function preservesSequence(needle, haystack) {
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
  }
  return index === needle.length;
}

function semanticCharacterCount(text) {
  return [...text.normalize("NFKC")].filter((character) => /[\p{L}\p{N}ー]/u.test(character)).length;
}

export function clickTranslationReadingProblems(texts, readings) {
  if (!Array.isArray(texts) || !Array.isArray(readings) || texts.length !== readings.length) return [];
  const problems = [];
  for (let index = 0; index < texts.length; index += 1) {
    const reading = readings[index];
    if (typeof reading !== "string" || !reading.trim()) continue;
    const sourceKana = kanaSequence(texts[index]);
    const readingKana = kanaSequence(reading);
    if (/[\p{Script=Han}\p{Script=Latin}]/u.test(reading)) {
      problems.push({ index, text: texts[index], reading, problem: "reading must spell the complete phrase in kana, without kanji or Latin letters" });
    }
    if (sourceKana && !preservesSequence(sourceKana, readingKana)) {
      problems.push({ index, text: texts[index], reading, problem: "reading omits kana from the complete phrase" });
    }
    if (semanticCharacterCount(reading) < Math.ceil(semanticCharacterCount(texts[index]) * 0.8)) {
      problems.push({ index, text: texts[index], reading, problem: "reading is too short for the complete phrase" });
    }
  }
  return problems;
}

function exampleKey(example, index) {
  return example.id ?? `missing-id:${index}`;
}

function addIssue(
  issues,
  category,
  source,
  wordId,
  exampleId,
  slot,
  field,
  actual,
  expected,
) {
  issues.push({
    category,
    source,
    wordId: wordId ?? "unknown",
    exampleId: exampleId ?? null,
    slot: slot ?? null,
    field,
    actual: rendered(actual),
    expected,
  });
}

export function normalizeWordsPayload(payload) {
  const sourceWords = Array.isArray(payload) ? payload : payload?.words;
  if (!Array.isArray(sourceWords)) {
    throw new Error("example input must be an array or an object with a words array");
  }

  return sourceWords.map((word, wordIndex) => {
    if (!isObject(word)) throw new Error(`words[${wordIndex}] must be an object`);
    const id = textOrNull(word.id) ?? `words[${wordIndex}]`;
    const sourceExamples = Array.isArray(word.examples) ? word.examples : [];
    const examples = sourceExamples.map((example, exampleIndex) => {
      if (!isObject(example)) {
        return {
          id: null,
          sortOrder: null,
          cefrLevel: null,
          en: null,
          ja: null,
          zh: null,
          clickTranslations: { en: null, ja: null },
          sourceIndex: exampleIndex,
        };
      }
      const translations = isObject(example.translations) ? example.translations : {};
      const rawSortOrder = example.sortOrder ?? example.sort_order;
      return {
        id: example.id === undefined || example.id === null ? null : String(example.id),
        sortOrder: Number.isInteger(rawSortOrder) ? rawSortOrder : null,
        cefrLevel: textOrNull(example.cefrLevel ?? example.cefr_level),
        en: textOrNull(example.en ?? example.sentence),
        ja: textOrNull(example.ja ?? translations.ja),
        zh: textOrNull(example.zh ?? translations.zh),
        clickTranslations: {
          en: normalizedSpanAudit(example.clickTranslations?.en ?? example.click_translations?.en),
          ja: normalizedSpanAudit(example.clickTranslations?.ja ?? example.click_translations?.ja),
        },
        sourceIndex: exampleIndex,
      };
    });
    return {
      id,
      enTerm: textOrNull(word.enTerm ?? word.en_term ?? word.word),
      jaTerm: textOrNull(word.jaTerm ?? word.ja_term),
      zhDefinition: textOrNull(word.zhDefinition ?? word.zh_definition ?? word.chinese),
      examples,
    };
  });
}

export function auditExampleWords(words, source = "database") {
  const issues = [];
  const seenWordIds = new Set();

  for (const word of words) {
    if (seenWordIds.has(word.id)) {
      addIssue(
        issues,
        "semantic-mismatch",
        source,
        word.id,
        null,
        null,
        "wordId",
        word.id,
        "unique published main-word ID",
      );
    }
    seenWordIds.add(word.id);

    if (word.examples.length !== 2) {
      addIssue(
        issues,
        "example-count",
        source,
        word.id,
        null,
        null,
        "examples.length",
        word.examples.length,
        "exactly 2 examples: sort_order 0 simple and sort_order 1 complex",
      );
    }

    const seenExampleIds = new Set();
    const seenOrders = new Set();
    for (const [index, example] of word.examples.entries()) {
      const slot = roleForSortOrder(example.sortOrder);
      if (example.id === null) {
        addIssue(
          issues,
          "example-count",
          source,
          word.id,
          null,
          slot,
          `examples[${index}].id`,
          null,
          "database example ID",
        );
      } else if (seenExampleIds.has(example.id)) {
        addIssue(
          issues,
          "duplicate-example",
          source,
          word.id,
          example.id,
          slot,
          "exampleId",
          example.id,
          "unique example ID within the word",
        );
      }
      if (example.id !== null) seenExampleIds.add(example.id);

      if (example.sortOrder !== 0 && example.sortOrder !== 1) {
        addIssue(
          issues,
          "difficulty-mismatch",
          source,
          word.id,
          example.id,
          slot,
          "sortOrder",
          example.sortOrder,
          "0 for the simple example or 1 for the complex example",
        );
      } else if (seenOrders.has(example.sortOrder)) {
        addIssue(
          issues,
          "difficulty-mismatch",
          source,
          word.id,
          example.id,
          slot,
          "sortOrder",
          example.sortOrder,
          "exactly one example at each sort order 0 and 1",
        );
      }
      if (example.sortOrder !== null) seenOrders.add(example.sortOrder);

      for (const language of ["en", "ja", "zh"]) {
        if (!trimmed(example[language])) {
          addIssue(
            issues,
            "missing-translation",
            source,
            word.id,
            example.id,
            slot,
            language,
            example[language],
            `non-empty ${language === "zh" ? "Traditional Chinese" : language === "ja" ? "Japanese" : "English"} sentence`,
          );
        }
      }

      for (const language of ["en", "ja"]) {
        const spanAudit = example.clickTranslations[language];
        const sentence = example[language];
        if (!spanAudit || !spanAudit.spanCount) {
          addIssue(
            issues,
            "missing-click-translation",
            source,
            word.id,
            example.id,
            slot,
            `${language}.clickTranslations`,
            spanAudit,
            "a full covering annotation with at least 2 tappable lexical spans",
          );
          continue;
        }
        if (spanAudit.reconstructed !== sentence) {
          addIssue(
            issues,
            "invalid-click-translation",
            source,
            word.id,
            example.id,
            slot,
            `${language}.reconstructed`,
            spanAudit.reconstructed,
            "span text concatenates exactly to the current sentence",
          );
        }
        if (!spanAudit.glossedSpanCount) {
          addIssue(
            issues,
            "missing-click-translation",
            source,
            word.id,
            example.id,
            slot,
            `${language}.glossedSpanCount`,
            spanAudit.glossedSpanCount,
            "at least one tappable span with Traditional Chinese, Japanese, and English glosses",
          );
        }
        if (spanAudit.partialGlossCount !== 0) {
          addIssue(
            issues,
            "invalid-click-translation",
            source,
            word.id,
            example.id,
            slot,
            `${language}.partialGlossCount`,
            spanAudit.partialGlossCount,
            "0 spans with only part of the required three-language gloss set",
          );
        }
        if (language === "ja" && spanAudit.missingReadingCount !== 0) {
          addIssue(
            issues,
            "invalid-click-translation",
            source,
            word.id,
            example.id,
            slot,
            "ja.missingReadingCount",
            spanAudit.missingReadingCount,
            "0 glossed Japanese spans without a kana reading",
          );
        }
        if (language === "en" && spanAudit.unexpectedReadingCount !== 0) {
          addIssue(
            issues,
            "invalid-click-translation",
            source,
            word.id,
            example.id,
            slot,
            "en.unexpectedReadingCount",
            spanAudit.unexpectedReadingCount,
            "0 English spans carrying a Japanese reading",
          );
        }
        if (spanAudit.metaGlossCount !== null && spanAudit.metaGlossCount !== 0) {
          addIssue(
            issues,
            "invalid-click-translation",
            source,
            word.id,
            example.id,
            slot,
            `${language}.metaGlossCount`,
            spanAudit.metaGlossCount,
            "0 glosses containing parenthetical grammar notes instead of clean contextual meaning",
          );
        }
        const boundaryProblems = clickTranslationBoundaryProblems(
          language,
          spanAudit.texts,
          spanAudit.glossed,
        );
        if (boundaryProblems.length > 0) {
          addIssue(
            issues,
            "invalid-click-translation",
            source,
            word.id,
            example.id,
            slot,
            `${language}.boundaries`,
            { texts: spanAudit.texts, problems: boundaryProblems },
            "2-8 tappable lexical units; function words, particles, spacing, and punctuation remain exact but untappable, matching definition annotations",
          );
        }
        if (language === "ja") {
          const readingProblems = clickTranslationReadingProblems(spanAudit.texts, spanAudit.readings);
          if (readingProblems.length > 0) {
            addIssue(
              issues,
              "invalid-click-translation",
              source,
              word.id,
              example.id,
              slot,
              "ja.readings",
              readingProblems,
              "every Japanese reading covers its complete phrase, including nouns, particles, inflections, auxiliaries, and endings",
            );
          }
        }
      }

      if (example.sortOrder === 0 && !SIMPLE_LEVELS.has(example.cefrLevel)) {
        addIssue(
          issues,
          "difficulty-mismatch",
          source,
          word.id,
          example.id,
          "simple",
          "cefrLevel",
          example.cefrLevel,
          "A1 or A2 for sort_order 0",
        );
      }
      if (example.sortOrder === 1 && !COMPLEX_LEVELS.has(example.cefrLevel)) {
        addIssue(
          issues,
          "difficulty-mismatch",
          source,
          word.id,
          example.id,
          "complex",
          "cefrLevel",
          example.cefrLevel,
          "B1 or B2 for sort_order 1",
        );
      }
    }

    for (let left = 0; left < word.examples.length; left += 1) {
      for (let right = left + 1; right < word.examples.length; right += 1) {
        for (const language of ["en", "ja", "zh"]) {
          const leftText = normalizedSentence(word.examples[left][language]);
          const rightText = normalizedSentence(word.examples[right][language]);
          if (leftText && leftText === rightText) {
            addIssue(
              issues,
              "duplicate-example",
              source,
              word.id,
              word.examples[right].id,
              roleForSortOrder(word.examples[right].sortOrder),
              language,
              word.examples[right][language],
              `different teaching content from example ${exampleKey(word.examples[left], left)}`,
            );
          }
        }
      }
    }
  }

  return issues;
}

export function buildReviewHints(words) {
  const hints = [];
  for (const word of words) {
    for (const example of word.examples) {
      for (const language of ["en", "ja", "zh"]) {
        const sentence = trimmed(example[language]);
        if (!sentence) continue;
        if (GENERIC_TEMPLATE_PATTERNS[language].some((pattern) => pattern.test(sentence))) {
          hints.push({
            category: "daily-life-mismatch",
            source: "template-prefilter",
            wordId: word.id,
            exampleId: example.id,
            slot: roleForSortOrder(example.sortOrder),
            field: language,
            actual: rendered(example[language]),
            expected: "full semantic review for a concrete, useful daily-life situation",
          });
        }
      }
    }
  }
  return hints;
}

export function makeBatches(words, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batch size must be a positive integer");
  }
  const batches = [];
  for (let index = 0; index < words.length; index += batchSize) {
    batches.push(words.slice(index, index + batchSize));
  }
  return batches;
}

export function createSemanticReviewTemplate(words, sourceFile = null) {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceFile,
    words: words.map((word) => ({
      id: word.id,
      pairVerdict: "pending",
      pairCategories: [],
      pairReason: "",
      examples: word.examples.map((example) => ({
        exampleId: example.id,
        sortOrder: example.sortOrder,
        role: roleForSortOrder(example.sortOrder),
        verdict: "pending",
        categories: [],
        reason: "",
      })),
    })),
  };
}

function validateCategories(issues, categories, context) {
  if (!Array.isArray(categories) || categories.length === 0) {
    addIssue(
      issues,
      "review-incomplete",
      "semantic-review",
      context.wordId,
      context.exampleId,
      context.slot,
      "categories",
      categories,
      "one or more supported categories for fail or uncertain verdicts",
    );
    return [];
  }
  const valid = [];
  for (const category of categories) {
    if (!REVIEW_CATEGORIES.has(category)) {
      addIssue(
        issues,
        "review-incomplete",
        "semantic-review",
        context.wordId,
        context.exampleId,
        context.slot,
        "categories",
        category,
        `one of: ${[...REVIEW_CATEGORIES].join(", ")}`,
      );
    } else if (!valid.includes(category)) {
      valid.push(category);
    }
  }
  return valid;
}

function auditReviewVerdict(issues, reviewItem, context, actualContent) {
  const verdict = reviewItem?.verdict ?? reviewItem?.pairVerdict;
  const categories = reviewItem?.categories ?? reviewItem?.pairCategories;
  const reason = reviewItem?.reason ?? reviewItem?.pairReason;
  if (!VERDICTS.has(verdict)) {
    addIssue(
      issues,
      "review-incomplete",
      "semantic-review",
      context.wordId,
      context.exampleId,
      context.slot,
      "verdict",
      verdict,
      "pass, fail, or uncertain",
    );
    return false;
  }
  if (!trimmed(reason)) {
    addIssue(
      issues,
      "review-incomplete",
      "semantic-review",
      context.wordId,
      context.exampleId,
      context.slot,
      "reason",
      reason,
      "non-empty evidence for the semantic verdict",
    );
  }
  if (verdict === "pass") {
    if (Array.isArray(categories) && categories.length > 0) {
      addIssue(
        issues,
        "review-incomplete",
        "semantic-review",
        context.wordId,
        context.exampleId,
        context.slot,
        "categories",
        categories,
        "empty categories for a pass verdict",
      );
    }
    return true;
  }

  const validCategories = validateCategories(issues, categories, context);
  for (const category of validCategories) {
    addIssue(
      issues,
      category,
      "semantic-review",
      context.wordId,
      context.exampleId,
      context.slot,
      context.exampleId === null ? "pair" : "example",
      actualContent,
      verdict === "uncertain"
        ? `resolved evidence for ${category}: ${trimmed(reason)}`
        : `daily-life example contract: ${trimmed(reason)}`,
    );
  }
  return true;
}

export function auditSemanticReview(words, review) {
  const issues = [];
  let reviewedWords = 0;
  let reviewedExamples = 0;
  if (!isObject(review) || !Array.isArray(review.words)) {
    addIssue(
      issues,
      "review-incomplete",
      "semantic-review",
      "response",
      null,
      null,
      "review",
      review,
      "completed semantic-review object with a words array",
    );
    return { status: "pending", reviewedWords, reviewedExamples, issues };
  }

  const expectedWords = new Map(words.map((word) => [word.id, word]));
  const reviewsByWord = new Map();
  for (const item of review.words) {
    const wordId = textOrNull(item?.id);
    if (!wordId || !expectedWords.has(wordId)) {
      addIssue(
        issues,
        "review-incomplete",
        "semantic-review",
        wordId ?? "unknown",
        null,
        null,
        "wordId",
        wordId,
        "one current published main-word ID",
      );
      continue;
    }
    if (reviewsByWord.has(wordId)) {
      addIssue(
        issues,
        "review-incomplete",
        "semantic-review",
        wordId,
        null,
        null,
        "wordId",
        wordId,
        "exactly one review entry per current word",
      );
      continue;
    }
    reviewsByWord.set(wordId, item);
  }

  for (const word of words) {
    const wordReview = reviewsByWord.get(word.id);
    if (!wordReview) {
      addIssue(
        issues,
        "review-incomplete",
        "semantic-review",
        word.id,
        null,
        null,
        "wordReview",
        undefined,
        "one pair review for every current word",
      );
      continue;
    }

    const pairCompleted = auditReviewVerdict(
      issues,
      {
        pairVerdict: wordReview.pairVerdict,
        pairCategories: wordReview.pairCategories,
        pairReason: wordReview.pairReason,
      },
      { wordId: word.id, exampleId: null, slot: "pair" },
      word.examples.map(({ en, ja, zh }) => ({ en, ja, zh })),
    );
    if (pairCompleted) reviewedWords += 1;

    const sourceExamples = new Map(
      word.examples.map((example, index) => [exampleKey(example, index), example]),
    );
    const reviewExamples = Array.isArray(wordReview.examples) ? wordReview.examples : [];
    const reviewsByExample = new Map();
    for (const item of reviewExamples) {
      const key = item?.exampleId === undefined || item?.exampleId === null
        ? null
        : String(item.exampleId);
      if (key === null || !sourceExamples.has(key)) {
        addIssue(
          issues,
          "review-incomplete",
          "semantic-review",
          word.id,
          key,
          item?.role ?? null,
          "exampleId",
          key,
          "one current example ID belonging to this word",
        );
        continue;
      }
      if (reviewsByExample.has(key)) {
        addIssue(
          issues,
          "review-incomplete",
          "semantic-review",
          word.id,
          key,
          item?.role ?? null,
          "exampleId",
          key,
          "exactly one review entry per current example",
        );
        continue;
      }
      reviewsByExample.set(key, item);
    }

    for (const [index, example] of word.examples.entries()) {
      const key = exampleKey(example, index);
      const exampleReview = reviewsByExample.get(key);
      const slot = roleForSortOrder(example.sortOrder);
      if (!exampleReview) {
        addIssue(
          issues,
          "review-incomplete",
          "semantic-review",
          word.id,
          example.id,
          slot,
          "exampleReview",
          undefined,
          "one semantic review for every current example",
        );
        continue;
      }
      const completed = auditReviewVerdict(
        issues,
        exampleReview,
        { wordId: word.id, exampleId: example.id, slot },
        { en: example.en, ja: example.ja, zh: example.zh },
      );
      if (completed) reviewedExamples += 1;
    }
  }

  const hasIncomplete = issues.some((entry) => entry.category === "review-incomplete");
  return {
    status: hasIncomplete ? "incomplete" : issues.length > 0 ? "failed" : "passed",
    reviewedWords,
    reviewedExamples,
    issues,
  };
}

export function buildAuditReport({
  words,
  mechanicalIssues,
  reviewHints,
  reviewResult,
  batchCount,
  source,
  artifacts = {},
}) {
  const issues = [...mechanicalIssues, ...reviewResult.issues];
  const categories = Object.fromEntries(
    [...new Set(issues.map((entry) => entry.category))]
      .sort()
      .map((category) => [category, issues.filter((entry) => entry.category === category).length]),
  );
  const totalExamples = words.reduce((sum, word) => sum + word.examples.length, 0);
  return {
    ok: mechanicalIssues.length === 0 && reviewResult.status === "passed",
    checkedAt: new Date().toISOString(),
    source,
    scope: {
      publishedMainWordsOnly: true,
      customWords: false,
      savedWords: false,
      publicApiExamplesChecked: false,
    },
    counts: {
      words: words.length,
      examples: totalExamples,
      batches: batchCount,
      reviewedWords: reviewResult.reviewedWords,
      reviewedExamples: reviewResult.reviewedExamples,
      reviewHints: reviewHints.length,
    },
    mechanicalStatus: mechanicalIssues.length === 0 ? "passed" : "failed",
    semanticReviewStatus: reviewResult.status,
    summary: { total: issues.length, categories },
    issues,
    reviewHints,
    artifacts,
  };
}

async function loadPublishedWordsFromDatabase(projectRoot) {
  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(path.join(projectRoot, ".env.local"));
    } catch {
      // Report the missing DATABASE_URL below without exposing environment contents.
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required; configure it in the project environment");
  }

  const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
  const postgresModule = requireFromProject("postgres");
  const postgres = postgresModule.default ?? postgresModule;
  const sql = postgres(process.env.DATABASE_URL, {
    ssl: "require",
    prepare: false,
    max: 1,
  });
  try {
    const rows = await sql`
      SELECT
        w.id,
        w.word AS "enTerm",
        ja.term AS "jaTerm",
        zd.definition AS "zhDefinition",
        COALESCE(ex.examples, '[]'::jsonb) AS examples
      FROM words w
      LEFT JOIN word_terms ja
        ON ja.word_id = w.id AND ja.language = 'ja'
      LEFT JOIN LATERAL (
        SELECT definition
        FROM word_definitions
        WHERE word_id = w.id AND language = 'zh'
        ORDER BY sort_order
        LIMIT 1
      ) zd ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id::text,
            'sortOrder', e.sort_order,
            'cefrLevel', e.cefr_level,
            'en', e.sentence,
            'ja', (
              SELECT t.translation
              FROM word_example_translations t
              WHERE t.example_id = e.id AND t.language = 'ja'
              LIMIT 1
            ),
            'zh', (
              SELECT t.translation
              FROM word_example_translations t
              WHERE t.example_id = e.id AND t.language = 'zh'
              LIMIT 1
            ),
            'clickTranslations', jsonb_build_object(
              'en', (
                SELECT jsonb_build_object(
                  'spanCount', count(*)::int,
                  'glossedSpanCount', count(*) FILTER (WHERE a.gloss_count = 3)::int,
                  'partialGlossCount', count(*) FILTER (WHERE a.gloss_count NOT IN (0, 3))::int,
                  'missingReadingCount', count(*) FILTER (
                    WHERE a.gloss_count = 3 AND btrim(COALESCE(a.reading, '')) = ''
                  )::int,
                  'unexpectedReadingCount', count(*) FILTER (
                    WHERE btrim(COALESCE(a.reading, '')) <> ''
                  )::int,
                  'reconstructed', string_agg(a.text, '' ORDER BY a.sort_order),
                  'texts', jsonb_agg(a.text ORDER BY a.sort_order),
                  'glossed', jsonb_agg((a.gloss_count = 3) ORDER BY a.sort_order),
                  'readings', jsonb_agg(a.reading ORDER BY a.sort_order),
                  'metaGlossCount', COALESCE(sum(a.meta_gloss_count), 0)::int
                )
                FROM (
                  SELECT
                    s.sort_order,
                    s.text,
                    s.reading,
                    (
                      SELECT count(*)::int
                      FROM sentence_span_glosses g
                      WHERE g.sentence_language = s.sentence_language
                        AND g.sentence = s.sentence
                        AND g.sort_order = s.sort_order
                    ) AS gloss_count,
                    (
                      SELECT count(*)::int
                      FROM sentence_span_glosses g
                      WHERE g.sentence_language = s.sentence_language
                        AND g.sentence = s.sentence
                        AND g.sort_order = s.sort_order
                        AND g.gloss ~ '[()（）]|助詞|主語標示|做主語|做受詞|作為受詞|賓語|主格|賓格|目的格|敬語|代名詞|持續狀態|持続状態|主題標示|賦予目的'
                    ) AS meta_gloss_count
                  FROM sentence_spans s
                  WHERE s.sentence_language = 'en'
                    AND s.sentence = e.sentence
                    AND s.version >= 1
                ) a
              ),
              'ja', (
                SELECT jsonb_build_object(
                  'spanCount', count(*)::int,
                  'glossedSpanCount', count(*) FILTER (WHERE a.gloss_count = 3)::int,
                  'partialGlossCount', count(*) FILTER (WHERE a.gloss_count NOT IN (0, 3))::int,
                  'missingReadingCount', count(*) FILTER (
                    WHERE a.gloss_count = 3 AND btrim(COALESCE(a.reading, '')) = ''
                  )::int,
                  'unexpectedReadingCount', count(*) FILTER (
                    WHERE btrim(COALESCE(a.reading, '')) <> ''
                  )::int,
                  'reconstructed', string_agg(a.text, '' ORDER BY a.sort_order),
                  'texts', jsonb_agg(a.text ORDER BY a.sort_order),
                  'glossed', jsonb_agg((a.gloss_count = 3) ORDER BY a.sort_order),
                  'readings', jsonb_agg(a.reading ORDER BY a.sort_order),
                  'metaGlossCount', COALESCE(sum(a.meta_gloss_count), 0)::int
                )
                FROM (
                  SELECT
                    s.sort_order,
                    s.text,
                    s.reading,
                    (
                      SELECT count(*)::int
                      FROM sentence_span_glosses g
                      WHERE g.sentence_language = s.sentence_language
                        AND g.sentence = s.sentence
                        AND g.sort_order = s.sort_order
                    ) AS gloss_count,
                    (
                      SELECT count(*)::int
                      FROM sentence_span_glosses g
                      WHERE g.sentence_language = s.sentence_language
                        AND g.sentence = s.sentence
                        AND g.sort_order = s.sort_order
                        AND g.gloss ~ '[()（）]|助詞|主語標示|做主語|做受詞|作為受詞|賓語|主格|賓格|目的格|敬語|代名詞|持續狀態|持続状態|主題標示|賦予目的'
                    ) AS meta_gloss_count
                  FROM sentence_spans s
                  WHERE s.sentence_language = 'ja'
                    AND s.sentence = (
                      SELECT t.translation
                      FROM word_example_translations t
                      WHERE t.example_id = e.id AND t.language = 'ja'
                      LIMIT 1
                    )
                    AND s.version >= 1
                ) a
              )
            )
          ) ORDER BY e.sort_order, e.id
        ) AS examples
        FROM word_examples e
        WHERE e.word_id = w.id
      ) ex ON true
      WHERE w.status = 'published' AND w.deleted_at IS NULL
      ORDER BY w.id
    `;
    return normalizeWordsPayload({ words: rows });
  } finally {
    await sql.end();
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: DEFAULT_PROJECT_ROOT,
    outputDir: null,
    batchSize: 20,
    input: null,
    review: null,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project-root") options.projectRoot = argv[++index];
    else if (arg === "--output-dir") options.outputDir = argv[++index];
    else if (arg === "--batch-size") options.batchSize = Number(argv[++index]);
    else if (arg === "--input") options.input = argv[++index];
    else if (arg === "--review") options.review = argv[++index];
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error("--batch-size must be a positive integer");
  }
  options.projectRoot = path.resolve(options.projectRoot);
  if (options.outputDir) options.outputDir = path.resolve(options.outputDir);
  if (options.input) options.input = path.resolve(options.input);
  if (options.review) options.review = path.resolve(options.review);
  return options;
}

function defaultOutputDir(projectRoot) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(projectRoot, "output", "atlas-example-audit", timestamp);
}

function helpText() {
  return `Usage:
  check-example-contract.mjs [--project-root <path>] [--output-dir <path>] [--batch-size 20] [--json]
  check-example-contract.mjs --input <examples.json> [--output-dir <path>] [--review <semantic-review.json>] [--json]

Without --input, the checker reads DATABASE_URL or <project-root>/.env.local and performs SELECT-only inspection of published main words.`;
}

function markdownReport(report) {
  const lines = [
    "# Tuji 主圖鑑雙例句稽核",
    "",
    `- 檢查時間：${report.checkedAt}`,
    `- 主詞：${report.counts.words}`,
    `- 例句：${report.counts.examples}`,
    `- 批次：${report.counts.batches}`,
    `- 機械檢查：${report.mechanicalStatus}`,
    `- 全量語意覆核：${report.semanticReviewStatus}`,
    `- 問題：${report.summary.total}`,
    `- 模板優先提示：${report.counts.reviewHints}`,
    "",
    "## 問題",
    "",
  ];
  if (report.issues.length === 0) lines.push("無。", "");
  for (const issue of report.issues) {
    lines.push(
      `- \`${issue.category}\` ${issue.wordId}${issue.exampleId ? ` / example ${issue.exampleId}` : ""}${issue.slot ? ` / ${issue.slot}` : ""} / ${issue.field}: actual=${issue.actual}; expected=${issue.expected}`,
    );
  }
  lines.push("", "## 語意覆核優先提示", "");
  if (report.reviewHints.length === 0) lines.push("無。", "");
  for (const hint of report.reviewHints) {
    lines.push(
      `- \`${hint.category}\` ${hint.wordId}${hint.exampleId ? ` / example ${hint.exampleId}` : ""} / ${hint.field}: ${hint.actual}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function writeIfMissing(file, contents) {
  try {
    await access(file);
  } catch {
    await writeFile(file, contents, "utf8");
  }
}

function printHumanReport(report) {
  console.log("Tuji main-catalog example audit");
  console.log(
    `words=${report.counts.words} examples=${report.counts.examples} batches=${report.counts.batches}`,
  );
  console.log(
    `mechanical=${report.mechanicalStatus} semantic-review=${report.semanticReviewStatus} issues=${report.summary.total} hints=${report.counts.reviewHints}`,
  );
  for (const issue of report.issues) {
    console.error(
      `[${issue.category}] ${issue.wordId}${issue.exampleId ? ` example=${issue.exampleId}` : ""}${issue.slot ? ` slot=${issue.slot}` : ""} ${issue.field}: actual=${issue.actual}; expected=${issue.expected}`,
    );
  }
  console.log(`output: ${report.artifacts.outputDir}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }

  const outputDir = options.outputDir ?? defaultOutputDir(options.projectRoot);
  const words = options.input
    ? normalizeWordsPayload(JSON.parse(await readFile(options.input, "utf8")))
    : await loadPublishedWordsFromDatabase(options.projectRoot);
  const source = options.input ?? "database";
  const mechanicalIssues = auditExampleWords(words, source);
  const reviewHints = buildReviewHints(words);
  const batches = makeBatches(words, options.batchSize);

  await mkdir(path.join(outputDir, "batches"), { recursive: true });
  const examplesFile = path.join(outputDir, "examples.json");
  const reviewFile = path.join(outputDir, "semantic-review.json");
  const auditFile = path.join(outputDir, "audit.json");
  const markdownFile = path.join(outputDir, "audit.md");
  const snapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    source,
    words,
  };
  await writeFile(examplesFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  const totalBatches = batches.length;
  for (const [index, batchWords] of batches.entries()) {
    const wordIds = new Set(batchWords.map((word) => word.id));
    const file = path.join(
      outputDir,
      "batches",
      `batch-${String(index + 1).padStart(3, "0")}.json`,
    );
    const batch = {
      version: 1,
      batch: index + 1,
      totalBatches,
      words: batchWords,
      reviewHints: reviewHints.filter((hint) => wordIds.has(hint.wordId)),
    };
    await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
  }
  await writeIfMissing(
    reviewFile,
    `${JSON.stringify(createSemanticReviewTemplate(words, examplesFile), null, 2)}\n`,
  );

  const suppliedReview = options.review
    ? JSON.parse(await readFile(options.review, "utf8"))
    : null;
  const reviewResult = auditSemanticReview(words, suppliedReview);
  const artifacts = { outputDir, auditFile, markdownFile, examplesFile, reviewFile };
  const report = buildAuditReport({
    words,
    mechanicalIssues,
    reviewHints,
    reviewResult,
    batchCount: batches.length,
    source,
    artifacts,
  });
  await writeFile(auditFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownFile, markdownReport(report), "utf8");

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHumanReport(report);
  if (!report.ok) process.exitCode = 1;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[audit-tuji-atlas-examples] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}
