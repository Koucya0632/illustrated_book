import { toZhHans } from "./opencc";
import type { UiLang } from "./settings";
import type { WordInsights } from "@/types";

export type LocalizedInsight = { zhHant: string; en: string; ja: string };
export type StoredInsights = {
  confusables: { term: string; catalogId: string | null; distinction: LocalizedInsight }[];
  mistakes: { wrong: string; right: string; why: LocalizedInsight }[];
  usage: LocalizedInsight | null;
};

function localize(text: LocalizedInsight, lang: UiLang): string {
  if (lang === "zh-Hans") return toZhHans(text.zhHant);
  if (lang === "ja") return text.ja;
  if (lang === "en") return text.en;
  return text.zhHant;
}

/** The server is the premium-content boundary; free responses contain counts, never hidden text. */
export function presentWordInsights(
  stored: StoredInsights,
  lang: UiLang,
  hasMembership: boolean,
): WordInsights {
  return {
    confusables: stored.confusables.map((item) => ({
      term: item.term,
      catalogId: item.catalogId,
      distinction: localize(item.distinction, lang),
    })),
    mistakes: hasMembership
      ? stored.mistakes.map((item) => ({
          wrong: item.wrong,
          right: item.right,
          why: localize(item.why, lang),
        }))
      : [],
    usage: hasMembership && stored.usage ? localize(stored.usage, lang) : null,
    lockedMistakesCount: hasMembership ? 0 : stored.mistakes.length,
    usageLocked: !hasMembership && stored.usage !== null,
  };
}
