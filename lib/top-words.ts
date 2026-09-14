// 我's 需要加強 / best words: mastery rows ranked by SQL, drawn the way the
// catalogue draws the word.
//
// The route used to select the headline gloss straight off `words.chinese`.
// That column was dropped when glosses moved to `word_definitions`, and every
// request since has been a 500 — which neither client showed, because both
// hide the section when the read fails. So the gloss is no longer read here
// at all: the word comes from the same localized catalogue 圖鑑 shows, which
// already knows the reader's UI language and learning direction.

import type { Word } from "@/types";

/** One `user_words` row, already ordered by the query. */
export interface MasteryRankRow {
  word_id: string;
  /** `mastery::float8` — a bare NUMERIC arrives as a string and breaks decoding. */
  mastery: number;
  review_count: number;
}

export interface TopWord {
  id: string;
  word: string;
  chinese: string;
  imageUrl: string;
  pronunciation: string;
  category: string;
  reading?: string;
  targetLanguage?: "en" | "ja";
  mastery: number;
  reviewCount: number;
}

/**
 * The first `limit` ranked rows that are still words in this catalogue.
 *
 * A row whose word is unpublished, deleted, or has no term in the learning
 * language is skipped rather than returned bare: the client opens the word on
 * tap, and a row it cannot open is worse than a shorter list. The strings are
 * never null — iOS decodes `chinese`, `imageUrl` and `category` as non-optional,
 * and one null fails the whole response.
 */
export function topWords(rows: MasteryRankRow[], catalogue: Word[], limit: number): TopWord[] {
  const byId = new Map(catalogue.map((w) => [w.id, w]));
  const out: TopWord[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const w = byId.get(row.word_id);
    if (!w) continue;
    out.push({
      id: w.id,
      word: w.word,
      chinese: w.chinese ?? "",
      imageUrl: w.imageUrl ?? "",
      pronunciation: w.pronunciation ?? "",
      category: w.category ?? "",
      reading: w.reading,
      targetLanguage: w.targetLanguage,
      mastery: Math.round(Number(row.mastery)),
      reviewCount: row.review_count,
    });
  }
  return out;
}
