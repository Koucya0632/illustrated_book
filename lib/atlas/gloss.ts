// Gloss-language selection for custom atlas items. The gloss language
// follows the UI language: zh-Hant reads the base columns, zh-Hans OpenCC-
// converts them at the caller, ja/en read the per-language columns written
// by the enrich gloss pack / backfill script.
//
// Fallback chain for ja/en (load-bearing — never return nothing):
//   display_G → (G == target_language ? definition/lemma-language value : —)
//   → zh-Hant base.
// Pre-backfill items therefore show their zh-Hant gloss until the lazy
// re-enrich (enrichVersion gate) fills the columns.

import type { AtlasItemRow } from "./types";
import type { UiLang } from "@/lib/settings";

type GlossFields = Pick<
  AtlasItemRow,
  | "display_zh_hant"
  | "display_ja"
  | "display_en"
  | "definition_zh_hant"
  | "definition_ja"
  | "definition_en"
  | "definition_target"
  | "target_language"
>;

/** The Chinese name a confirm should store.
 *
 *  A ja/en interface never shows the Chinese-name field, so when its user
 *  renames the card the candidate's Chinese name rides through describing the
 *  object they just corrected away from. Storing it would publish a wrong name
 *  to every Chinese reader and feed the enrich prompts a contradiction.
 *
 *  `submitted` is undefined when the client did not send one. The lemma is the
 *  stand-in ("no Chinese name yet"): display_zh_hant is NOT NULL, and
 *  `needsChineseName` is how the enrich pass knows to write the real one. */
export function confirmedChineseName(input: {
  lemma: string;
  submitted: string | undefined;
  candidate: { label: string; zh_hant: string | null } | null;
  /** True when the capturing interface is known not to be Chinese. */
  chineseFieldHidden: boolean;
}): string {
  const { lemma, submitted, candidate } = input;
  if (!candidate) return submitted ?? lemma;
  // Clients prefill the label when the model gave no Chinese name.
  const suggested = candidate.zh_hant ?? candidate.label;
  const renamed = lemma !== candidate.label;
  if (submitted === undefined) return renamed ? lemma : suggested;
  if (renamed && input.chineseFieldHidden && submitted === suggested) return lemma;
  return submitted;
}

/** Whether display_zh_hant is still the lemma stand-in. A Japanese headword
 *  that really is its own Chinese name (山) is regenerated to the same thing. */
export function needsChineseName(item: Pick<AtlasItemRow, "lemma" | "display_zh_hant">): boolean {
  return item.display_zh_hant.trim() === item.lemma.trim();
}

/** Headline gloss of the lemma (word.chinese / list `chinese` slots).
 *  When the UI language equals the item's target language the short display
 *  would just repeat the lemma, so monolingual mode uses the explanatory
 *  definition instead — mirroring how official words gloss in that combo. */
export function pickAtlasGloss(item: GlossFields, lang: UiLang): string {
  if (lang === "ja") {
    if (item.target_language === "ja") {
      return item.definition_ja ?? item.definition_target ?? item.display_zh_hant;
    }
    return item.display_ja ?? item.display_zh_hant;
  }
  if (lang === "en") {
    if (item.target_language === "en") {
      return item.definition_en ?? item.definition_target ?? item.display_zh_hant;
    }
    return item.display_en ?? item.display_zh_hant;
  }
  return item.display_zh_hant; // zh-Hant base; zh-Hans callers OpenCC it
}

/** Dictionary definition (chineseDefinition / study explanation slots). */
export function pickAtlasDefinition(item: GlossFields, lang: UiLang): string | null {
  if (lang === "ja") {
    return (
      item.definition_ja ??
      (item.target_language === "ja" ? item.definition_target : null) ??
      item.definition_zh_hant
    );
  }
  if (lang === "en") {
    return (
      item.definition_en ??
      (item.target_language === "en" ? item.definition_target : null) ??
      item.definition_zh_hant
    );
  }
  return item.definition_zh_hant;
}
