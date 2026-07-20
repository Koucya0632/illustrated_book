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
