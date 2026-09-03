// What 複習's 求救提示 turns the picture over to.
//
// Pure on purpose (no server-only, no DB) so the rules are testable and there
// is exactly one place to read them — three callers ask this question and they
// must not answer it differently: lib/cards-db.ts for the catalogue, this
// file's own `glossForReader` for a ja/en reader at the read boundary, and
// app/api/study/queue for 自製圖鑑 rows.
//
// The hint used to be `word.chinese`, which for a zh reader is the answer
// translated (水桶) rather than a hint. The 釋義 — the explanatory sentence the
// detail page prints under the headline — is the better prompt: 附提把、開口朝上
// 的圓柱形容器. It is the same field either way, so the only real question is
// when a 釋義 is worth sending, and that is what this module answers.

/**
 * The 釋義 to send beside `gloss`, or none.
 *
 * A 釋義 that only repeats the gloss is not a 釋義. That is not merely tidiness:
 * the case where they are equal is monolingual study (UI language == target
 * language), where the gloss already *is* the explanatory definition, written
 * in the language being tested. Sending it as a hint would put the answer's own
 * language on the hint face — the one thing that face may not carry, which is
 * why `reading` and `pronunciation` are kept off it (docs/adr/0007). The
 * de-dupe rule and the leak rule are one rule, so they get one line of code.
 */
export function hintDefinition(
  gloss: string,
  definition: string | null | undefined,
): string | undefined {
  const text = definition?.trim();
  if (!text) return undefined;
  return text === gloss.trim() ? undefined : text;
}

/** A headline and the 釋義 under it, as one answer. */
export interface GlossPair {
  chinese: string;
  definition?: string;
}

/**
 * The pair a ja/en reader gets, given what the catalogue holds in their
 * language: `term` from `word_terms`, `definition` from `word_definitions`.
 *
 * `headword` is the word being tested. A 日文 learner is tested on the ja term
 * itself, so there the term is the *answer* rather than a gloss — that deck
 * keeps the explanatory definition on the headline, as it always has.
 *
 * With neither, the row keeps its zh-Hant gloss (load-bearing fallback) and the
 * zh 釋義 goes with it: a reader shown a Chinese headline is not also handed a
 * Chinese explainer they cannot read, which is the rule lib/word-localize.ts
 * applies to `chineseDefinition` on the detail page.
 */
export function glossForReader(
  row: { word: string; chinese: string },
  term: string | undefined,
  definition: string | undefined,
): GlossPair {
  const headline = term && term !== row.word ? term : definition;
  if (!headline) return { chinese: row.chinese, definition: undefined };
  return { chinese: headline, definition: hintDefinition(headline, definition) };
}
