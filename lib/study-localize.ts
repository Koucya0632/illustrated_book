// Localize a /study queue payload to the user's UI language.
//
// Cards are seeded with zh-Hant prompts baked into `front` / `back` /
// `explanation`. We can't reseed cards per language (one card → one user
// SRS state), so we transform the payload at the read boundary instead:
//
//   - zh-Hans: convert every zh string via OpenCC.
//   - ja:      pull ja overlays (word_definitions + word_example_translations
//              with language='ja') and synthesize ja templates for each
//              deck_key. Choices (MCQ distractors) get the same zh→ja
//              substitution so all four options stay in the same language.
//
// Missing ja data degrades gracefully back to zh-Hant for that piece.

import "server-only";
import type { DueCard } from "./cards-db";
import type { UiLang } from "./settings";
import { toZhHans } from "./opencc";
import { getSql } from "./db";

export async function localizeStudyQueue(
  due: DueCard[],
  lang: UiLang,
): Promise<DueCard[]> {
  if (lang === "zh-Hant" || due.length === 0) return due;

  if (lang === "zh-Hans") {
    return due.map(localizeOneZhHans);
  }

  // ja: one round-trip to fetch overlays for every word in the queue +
  // every distinct distractor string. Both are bounded (≤ queue limit × ~4),
  // so this stays a single hop with two correlated subqueries.
  const wordIds = Array.from(new Set(due.map((d) => d.word.id)));
  const distractors = Array.from(
    new Set(
      due
        .flatMap((d) => d.choices ?? [])
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  );
  const ja = await fetchJaOverlays(wordIds, distractors);
  return due.map((d) => localizeOneJa(d, ja));
}

// ---- zh-Hans (runtime OpenCC) ----

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

// ---- ja (overlay + templates) ----

interface JaOverlays {
  // word_id → first ja definition (sort_order 0 if present).
  defByWord: Map<string, string>;
  // `${word_id}|${zh_translation}` → matching ja translation; used to swap
  // the parenthetical hint in cloze cards.
  exampleByWordZh: Map<string, string>;
  // zh definition text → ja equivalent (for translating distractors).
  jaForZhDef: Map<string, string>;
}

async function fetchJaOverlays(
  wordIds: string[],
  distractors: string[],
): Promise<JaOverlays> {
  const sql = getSql();
  if (!sql || wordIds.length === 0) {
    return {
      defByWord: new Map(),
      exampleByWordZh: new Map(),
      jaForZhDef: new Map(),
    };
  }

  const defRows = (await sql`
    SELECT word_id, definition
    FROM word_definitions
    WHERE language = 'ja' AND word_id = ANY(${wordIds}::text[])
    ORDER BY word_id, sort_order
  `) as unknown as { word_id: string; definition: string }[];
  const defByWord = new Map<string, string>();
  for (const r of defRows) {
    if (!defByWord.has(r.word_id)) defByWord.set(r.word_id, r.definition);
  }

  const exRows = (await sql`
    SELECT we.word_id,
      (SELECT translation FROM word_example_translations
       WHERE example_id = we.id AND language = 'zh') AS zh,
      (SELECT translation FROM word_example_translations
       WHERE example_id = we.id AND language = 'ja') AS ja
    FROM word_examples we
    WHERE we.word_id = ANY(${wordIds}::text[])
  `) as unknown as { word_id: string; zh: string | null; ja: string | null }[];
  const exampleByWordZh = new Map<string, string>();
  for (const r of exRows) {
    if (r.zh && r.ja) exampleByWordZh.set(`${r.word_id}|${r.zh}`, r.ja);
  }

  // Distractor zh → ja: only attempt if there are zh-looking strings to map.
  // (For recall-zh-en the choices are English; passing them through is fine —
  // the JOIN simply won't match and they stay as-is.)
  const jaForZhDef = new Map<string, string>();
  if (distractors.length > 0) {
    const mapRows = (await sql`
      SELECT zh.definition AS zh, ja.definition AS ja
      FROM word_definitions zh
      JOIN word_definitions ja
        ON ja.word_id = zh.word_id AND ja.language = 'ja'
      WHERE zh.language = 'zh'
        AND zh.definition = ANY(${distractors}::text[])
    `) as unknown as { zh: string; ja: string }[];
    for (const r of mapRows) {
      if (r.zh && r.ja) jaForZhDef.set(r.zh, r.ja);
    }
  }

  return { defByWord, exampleByWordZh, jaForZhDef };
}

function localizeOneJa(d: DueCard, ja: JaOverlays): DueCard {
  const jaDef = ja.defByWord.get(d.word.id);
  let { front, back, explanation } = d.card;

  // word.chinese is what the UI shows as the "meaning" of the card's word.
  const wordChinese = jaDef ?? d.word.chinese;

  switch (d.card.deck_key) {
    case "recall-zh-en":
      // front: 「{def}」の英語は？  back stays as the English word.
      if (jaDef) front = `「${jaDef}」の英語は？`;
      break;
    case "recall-en-zh":
      front = `「${d.word.word}」の意味は？`;
      if (jaDef) back = jaDef;
      break;
    case "cloze-1": {
      // Front shape: "填入正確單字：\n{blanked en}\n（{zh hint}）"
      const lines = front.split("\n");
      const last = lines.length - 1;
      const parenMatch = lines[last]?.match(/^（(.+)）$/);
      if (parenMatch) {
        const zhHint = parenMatch[1];
        const jaHint = ja.exampleByWordZh.get(`${d.word.id}|${zhHint}`);
        lines[last] = `（${jaHint ?? zhHint}）`;
      }
      lines[0] = "正しい単語を入れてください：";
      front = lines.join("\n");
      if (explanation) {
        explanation = explanation.replace(/^完整句：/, "完全な文：");
      }
      break;
    }
  }

  // Choices: substitute ja for any zh definition we have a mapping for.
  // For decks whose choices are English (recall-zh-en) the map won't match,
  // so they stay as-is. For recall-en-zh, the correct zh back is in the
  // mapping (jaDef came from the same word), so it gets replaced alongside
  // the distractors. Words missing ja stay zh — a partial-coverage fallback
  // so the queue still works mid-translation-rollout.
  const choices = d.choices?.map((c) => ja.jaForZhDef.get(c) ?? c);

  return {
    ...d,
    card: { ...d.card, front, back, explanation },
    word: { ...d.word, chinese: wordChinese },
    choices,
  };
}
