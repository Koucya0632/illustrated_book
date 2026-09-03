// Localize a /study queue payload to the user's UI language.
//
// Cards are seeded with zh-Hant prompts baked into `front` / `back` /
// `explanation`. We can't reseed cards per language (one card → one user
// SRS state), so we transform the payload at the read boundary instead:
//
//   - zh-Hans: convert every zh string via OpenCC.
//   - ja / en: overlay `word.chinese` with the gloss-language *headword*
//     (`word_terms`), falling back to the first gloss-language definition
//     (the study flows render only the structured word fields, never card
//     front/back/explanation, so that one field is the whole swap). Custom
//     atlas rows arrive pre-glossed from atlasDueToStudyQueue and are skipped
//     here.
//   - zh-Hant: pass through untouched.
//
// `word.definition` (the 釋義 複習's 求救提示 prints) follows `word.chinese`
// through all of it: a reader who is shown a ja headline must not be handed a
// zh explainer underneath it, which is the same rule lib/word-localize.ts
// applies to `chineseDefinition` on the detail page.

import "server-only";
import type { DueCard } from "./cards-db";
import type { UiLang } from "./settings";
import { getSql } from "./db";
import { toZhHans } from "./opencc";
import { glossForReader } from "./study-hint";

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
    word: {
      ...d.word,
      chinese: toZhHans(d.word.chinese),
      definition: d.word.definition ? toZhHans(d.word.definition) : undefined,
    },
    choices: d.choices?.map(toZhHans),
  };
}

/// One batched lookup per queue; rows without a gloss-language definition
/// keep their zh-Hant gloss (load-bearing fallback). Any failure degrades to
/// the zh-Hant payload rather than failing the queue.
///
/// The headword comes first because this gloss is read at a glance: 複習's
/// 求救提示 flips the picture over to `word.chinese` and 學新字 prints it under
/// the image, and the stored ja definition is a whole explanatory sentence by
/// design (lib/translate.ts). A ja reader was getting 「バケツ」は、液体を積み込ん
/// だり運ぶために使用される… where a zh reader gets 水桶. `word_terms` holds no en
/// headword distinct from the word itself, so en keeps the definition — for a
/// monolingual reader that sentence *is* the gloss.
///
/// Which of the two a row lands on, and what 釋義 (if any) rides along with it,
/// is `glossForReader` in lib/study-hint.ts — pure, so the case analysis is
/// reachable from a test without a database.
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
    const definitionById = new Map(rows.map((r) => [r.word_id, r.definition]));
    const termById = new Map<string, string>();
    if (lang === "ja") {
      const termRows = (await sql`
        SELECT word_id, term
        FROM word_terms
        WHERE language = 'ja' AND word_id = ANY(${ids})
      `) as unknown as { word_id: string; term: string }[];
      for (const { word_id, term } of termRows) {
        if (term.trim()) termById.set(word_id, term.trim());
      }
    }
    return due.map((d) => {
      // Custom atlas rows are glossed *and* defined upstream, in this same
      // language, by pickAtlasGloss / pickAtlasDefinition. The header above has
      // always said they are skipped here; until `definition` existed, dropping
      // out of the lookup was the same thing as skipping. It no longer is —
      // falling through would wipe the definition the route just attached.
      if (d.word.id.startsWith("atlas:")) return d;
      const pair = glossForReader(
        d.word,
        termById.get(d.word.id),
        definitionById.get(d.word.id),
      );
      return { ...d, word: { ...d.word, ...pair } };
    });
  } catch {
    return due;
  }
}
