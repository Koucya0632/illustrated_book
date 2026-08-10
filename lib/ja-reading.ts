// What a Japanese reading must look like, and how to check a generated one.
//
// This lives on its own because it had two copies and they drifted. The
// dictionary path (lib/translate.ts) was corrected in 2026-08 after "in
// hiragana only" flattened 284 katakana headwords — ー is not a hiragana
// character, so that instruction forces the model to rewrite シャンプー as
// しゃんぷう. The 自製圖鑑 path (lib/atlas/enrich.ts) kept the original wording
// and none of the validation, so user captures went on being generated the
// broken way long after the catalogue was repaired.
//
// The two callers legitimately differ in one thing — which model they run on —
// so that is the parameter, and everything else is shared.

import { z } from "zod";
import { isKanaOnly, readingKeepsKana, restoreKanaRuns } from "./kana";
import { overrideReading } from "./ja-reading-overrides";

export const JapaneseReadingSchema = z.object({
  reading: z
    .string()
    .describe("Furigana reading: kanji spelled in hiragana, existing kana copied verbatim"),
});

export const JA_READING_SYSTEM =
  "Give the furigana reading of the supplied Japanese dictionary headword.\n" +
  "Rules:\n" +
  "1. Kanji are spelled out in hiragana.\n" +
  "2. Characters already written in kana are copied EXACTLY as they appear — " +
  "katakana stays katakana, and the long-vowel mark ー stays ー. Never convert " +
  "katakana to hiragana and never rewrite ー as あ/い/う/え/お.\n" +
  "3. A headword containing no kanji is its own reading; return it unchanged.\n" +
  "4. Return only the reading: no spaces, punctuation, or explanation.\n" +
  "Examples: バスマット → バスマット; シャンプー → シャンプー; " +
  "掃除ブラシ → そうじブラシ; 洗面台 → せんめんだい; 歯ブラシ → はブラシ.";

/**
 * The answer that needs no model: a hand-decided reading, or a headword that
 * is already its own reading. Returns null when the model does have to be asked.
 */
export function readingWithoutAsking(term: string): string | null {
  return overrideReading(term) ?? (isKanaOnly(term) ? term : null);
}

/**
 * Accept a generated reading, repair it, or reject it.
 *
 * The guard is deterministic and cheap: every kana the headword already spells
 * must survive verbatim. That catches the whole family of damage — katakana
 * folded to hiragana, ー decayed into a vowel, kana dropped — without knowing
 * anything about whether the *kanji* were read correctly, which nothing
 * derivable from these two strings can.
 *
 * Returns null when the answer cannot be salvaged; callers decide whether that
 * is a thrown error (the catalogue, where a bad row is worth stopping for) or a
 * missing reading (a user's capture, which should still produce a card).
 */
export function settleJapaneseReading(term: string, raw: string): string | null {
  const reading = raw.trim();
  if (!reading) return null;
  if (readingKeepsKana(term, reading)) return reading;
  const repaired = restoreKanaRuns(term, reading);
  if (repaired && readingKeepsKana(term, repaired)) return repaired;
  return null;
}
