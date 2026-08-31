// Turn a span corpus (data/example-spans.json shape) into the audit payload the
// example grader accepts through --input.
//
// The grader's database path computes this shape in SQL. This module reimplements that
// arithmetic against corpus rows so freshly generated spans — which exist only as
// corpus rows, having never been written anywhere — can be scored by the same ruler.
// `verifyAgainstAudited` below exists because a second implementation of someone else's
// arithmetic is worth nothing until it is shown to agree with the original.

// Mirrors the meta-gloss pattern in the grader's SQL: a gloss that explains grammar
// instead of meaning ("助詞", "(pronoun)") is a generated-filler signal.
const META_GLOSS = /[()（）]|助詞|主語標示|做主語|做受詞|作為受詞|賓語|主格|賓格|目的格|敬語|代名詞|持續狀態|持続状態|主題標示|賦予目的/;

const GLOSS_KEYS = ["z", "j", "e"];

function presentGlosses(span) {
  return GLOSS_KEYS.map((key) => span[key]).filter(
    (gloss) => typeof gloss === "string" && gloss.trim() !== "",
  );
}

function readingOf(span) {
  return typeof span.r === "string" ? span.r : null;
}

export function auditFromSpans(spans) {
  if (!Array.isArray(spans) || spans.length === 0) return null;
  const glossCounts = spans.map((span) => presentGlosses(span).length);
  const readings = spans.map(readingOf);
  // The SQL counts any non-empty reading as unexpected and only then subtracts the ones
  // a fully glossed span is entitled to; keeping both counts raw preserves that split.
  const hasReading = readings.map((reading) => (reading ?? "").trim() !== "");
  return {
    spanCount: spans.length,
    glossedSpanCount: glossCounts.filter((count) => count === 3).length,
    partialGlossCount: glossCounts.filter((count) => count !== 0 && count !== 3).length,
    missingReadingCount: glossCounts.filter(
      (count, index) => count === 3 && !hasReading[index],
    ).length,
    unexpectedReadingCount: hasReading.filter(Boolean).length,
    reconstructed: spans.map((span) => span.t ?? "").join(""),
    texts: spans.map((span) => span.t ?? ""),
    glossed: glossCounts.map((count) => count === 3),
    readings,
    metaGlossCount: spans.reduce(
      (total, span) =>
        total + presentGlosses(span).filter((gloss) => META_GLOSS.test(gloss)).length,
      0,
    ),
  };
}

// `words` carries the sentences and their metadata; `corpus` carries the spans. The
// result is the grader's --input payload.
export function buildAuditPayload({ words, corpus, source }) {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    source,
    words: words.map((word) => ({
      id: word.id,
      enTerm: word.enTerm ?? null,
      jaTerm: word.jaTerm ?? null,
      zhDefinition: word.zhDefinition ?? null,
      examples: word.examples.map((example) => ({
        id: example.id,
        sortOrder: example.sortOrder,
        cefrLevel: example.cefrLevel,
        en: example.en,
        ja: example.ja,
        zh: example.zh,
        clickTranslations: {
          en: example.en ? auditFromSpans(corpus.en?.[example.en]) : null,
          ja: example.ja ? auditFromSpans(corpus.ja?.[example.ja]) : null,
        },
      })),
    })),
  };
}

// Compare this module's arithmetic against audit objects the grader's SQL produced for
// the same sentences. Returns the disagreements; an empty array means the two rulers
// agree on every sentence they both cover.
export function verifyAgainstAudited({ auditedWords, corpus }) {
  const mismatches = [];
  for (const word of auditedWords) {
    for (const example of word.examples) {
      for (const language of ["en", "ja"]) {
        const sentence = example[language];
        if (!sentence) continue;
        const audited = example.clickTranslations?.[language];
        const spans = corpus[language]?.[sentence];
        if (!audited && !spans) continue;
        if (!audited || !spans) {
          mismatches.push({
            wordId: word.id,
            exampleId: example.id,
            language,
            field: "presence",
            database: audited ? "present" : "absent",
            corpus: spans ? "present" : "absent",
          });
          continue;
        }
        const rebuilt = auditFromSpans(spans);
        for (const field of Object.keys(audited)) {
          const left = JSON.stringify(audited[field]);
          const right = JSON.stringify(rebuilt[field]);
          if (left !== right) {
            mismatches.push({
              wordId: word.id,
              exampleId: example.id,
              language,
              field,
              database: left.slice(0, 160),
              corpus: right.slice(0, 160),
            });
          }
        }
      }
    }
  }
  return mismatches;
}
