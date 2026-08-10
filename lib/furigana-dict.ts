// Access to the furigana reference dictionary (JmdictFurigana, CC BY-SA).
//
// Splitting a headword probes every substring of it, so the useful unit of
// work is "give me every entry that could possibly apply to these terms" —
// one round trip, not one per candidate. The table is loaded by
// scripts/import-furigana-dict.ts and is read-only from here on.

import { getSql } from "./db";
import { isKanji, type FuriganaDict, type FuriganaEntry } from "./kana";

/**
 * Every substring of `term` a split could look up.
 *
 * Substrings with no kanji are left out: they are spelled the same in the
 * reading as in the headword, so the splitter consumes them character by
 * character and never asks the dictionary about them.
 */
export function candidateSurfaces(term: string): string[] {
  const chars = [...term];
  const out = new Set<string>();
  for (let i = 0; i < chars.length; i++) {
    let hasKanji = false;
    for (let j = i; j < chars.length; j++) {
      if (isKanji(chars[j])) hasKanji = true;
      if (hasKanji) out.add(chars.slice(i, j + 1).join(""));
    }
  }
  return [...out];
}

/** Empty dictionary — every split falls through to run-level anchoring. */
export const EMPTY_FURIGANA_DICT: FuriganaDict = new Map();

/**
 * Load every entry that could apply to `terms`.
 *
 * Returns an empty dictionary when there is no database (local dev without
 * DATABASE_URL) rather than throwing: a missing dictionary costs finer
 * segmentation, which the caller already has a fallback for, and is never a
 * reason to fail a request that is really about something else.
 */
export async function loadFuriganaDict(terms: readonly string[]): Promise<FuriganaDict> {
  const sql = getSql();
  if (!sql) return EMPTY_FURIGANA_DICT;

  const surfaces = [...new Set(terms.flatMap(candidateSurfaces))];
  if (surfaces.length === 0) return EMPTY_FURIGANA_DICT;

  const rows = (await sql`
    SELECT surface, reading, segments
      FROM furigana_dict
     WHERE surface = ANY(${surfaces})
  `) as unknown as { surface: string; reading: string; segments: string }[];

  const dict = new Map<string, FuriganaEntry[]>();
  for (const row of rows) {
    const entries = dict.get(row.surface) ?? [];
    entries.push({ reading: row.reading, segments: row.segments });
    dict.set(row.surface, entries);
  }
  return dict;
}
