// Localize a /study queue payload to the user's UI language.
//
// Cards are seeded with zh-Hant prompts baked into `front` / `back` /
// `explanation`. We can't reseed cards per language (one card → one user
// SRS state), so we transform the payload at the read boundary instead:
//
//   - zh-Hant: pass through untouched.
//   - zh-Hans: convert every zh string via OpenCC.
//
// (The retired `ja` UI language used to pull language='ja' overlays here and
// synthesize ja templates; that path was removed when uiLang collapsed to
// zh-Hant / zh-Hans. The ja content rows still live in the DB, unused.)

import "server-only";
import type { DueCard } from "./cards-db";
import type { UiLang } from "./settings";
import { toZhHans } from "./opencc";

export async function localizeStudyQueue(
  due: DueCard[],
  lang: UiLang,
): Promise<DueCard[]> {
  if (lang === "zh-Hant" || due.length === 0) return due;
  // zh-Hans: runtime OpenCC conversion of every zh string.
  return due.map(localizeOneZhHans);
}

function localizeOneZhHans(d: DueCard): DueCard {
  return {
    ...d,
    card: {
      ...d.card,
      front: toZhHans(d.card.front),
      back: toZhHans(d.card.back),
      explanation: d.card.explanation ? toZhHans(d.card.explanation) : d.card.explanation,
    },
    word: { ...d.word, chinese: toZhHans(d.word.chinese) },
    choices: d.choices?.map(toZhHans),
  };
}
