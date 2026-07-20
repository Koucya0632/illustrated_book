// Localize a /study queue payload to the user's UI language.
//
// Cards are seeded with zh-Hant prompts baked into `front` / `back` /
// `explanation`. We can't reseed cards per language (one card → one user
// SRS state), so we transform the payload at the read boundary instead:
//
//   - zh-Hans: convert every zh string via OpenCC.
//   - ja / en: overlay `word.chinese` with the first gloss-language
//     definition (the study flows render only the structured word fields,
//     never card front/back/explanation, so that one field is the whole
//     swap). Custom atlas rows arrive pre-glossed from atlasDueToStudyQueue
//     and are skipped here.
//   - zh-Hant: pass through untouched.

import "server-only";
import type { DueCard } from "./cards-db";
import type { UiLang } from "./settings";
import { getSql } from "./db";
import { toZhHans } from "./opencc";

export async function localizeStudyQueue(
  due: DueCard[],
  lang: UiLang,
): Promise<DueCard[]> {
  if (due.length === 0) return due;
  if (lang === "zh-Hans") return due.map(localizeOneZhHans);
  if (lang === "ja" || lang === "en") return overlayGlossDefinitions(due, lang);
  return due; // zh-Hant
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

/// One batched lookup per queue; rows without a gloss-language definition
/// keep their zh-Hant gloss (load-bearing fallback). Any failure degrades to
/// the zh-Hant payload rather than failing the queue.
async function overlayGlossDefinitions(
  due: DueCard[],
  lang: "ja" | "en",
): Promise<DueCard[]> {
  const ids = [
    ...new Set(due.map((d) => d.word.id).filter((id) => !id.startsWith("atlas:"))),
  ];
  if (ids.length === 0) return due;
  const sql = getSql();
  if (!sql) return due;
  try {
    const rows = (await sql`
      SELECT DISTINCT ON (word_id) word_id, definition
      FROM word_definitions
      WHERE language = ${lang} AND word_id = ANY(${ids})
      ORDER BY word_id, sort_order
    `) as unknown as { word_id: string; definition: string }[];
    const glossById = new Map(rows.map((r) => [r.word_id, r.definition]));
    return due.map((d) => {
      const gloss = glossById.get(d.word.id);
      return gloss ? { ...d, word: { ...d.word, chinese: gloss } } : d;
    });
  } catch {
    return due;
  }
}
