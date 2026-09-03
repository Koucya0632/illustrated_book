import "server-only";
import { getSql } from "./db";
import { MIN_SPANS_VERSION } from "./example-spans";

/**
 * Example sentences for 聽句 (the listening question 複習 asks about one card in
 * four — see docs/adr/0014 in the iOS repo).
 *
 * Attached to the study queue rather than fetched per card: the question has to
 * be ready the instant the card appears and a hundred-item queue cannot pay a
 * detail round-trip each. What is deliberately *not* attached is the 詞塊
 * annotation. The blurred sentence is drawn as plain text, and the tappable
 * version of the same sentence is one pull-up away in the reveal sheet, where
 * `GET /api/words/{id}` brings the spans with it — carrying them here would
 * ship a hundred copies to serve the one the user opens.
 */
export interface StudyExample {
  sentence: string;
  cefrLevel: string | null;
  /** Pre-generated clips keyed by locale ("en-US" / "en-GB" / "ja-JP"). */
  audioUrls: Record<string, string> | null;
  /**
   * Every catalogue word this sentence names, the target word included.
   *
   * The client uses it to refuse an image distractor: the authored sentences
   * deliberately mention two catalogue nouns ("The air conditioner is in the
   * bedroom.") and 46% of the English set does, so drawing the other one leaves
   * *both* pictures correct — the learner hears it perfectly and the SRS
   * records a failure.
   *
   * It has to be resolved here because only the server has the mapping: a
   * span's `word_id` comes from its **base form**, so "documents" resolves to
   * "document", and the client has neither the base forms nor the spans.
   */
  mentionedWordIds: string[];
}

interface ExampleRow {
  word_id: string;
  sentence: string | null;
  cefr_level: string | null;
  audio_by_locale: Record<string, string> | null;
}

interface MentionRow {
  sentence: string;
  word_id: string;
}

/**
 * One batched read for the whole queue: examples in `language`, each with its
 * clips and the words it names. Words with no example (自製圖鑑, 物見) simply
 * do not appear in the map, and their cards fall back to 選字.
 */
export async function fetchStudyExamples(
  wordIds: string[],
  language: "en" | "ja",
): Promise<Map<string, StudyExample[]>> {
  const sql = getSql();
  const out = new Map<string, StudyExample[]>();
  if (!sql || wordIds.length === 0) return out;

  // `word_examples.sentence` is the English source; ja and zh live in
  // `word_example_translations`. So a Japanese queue reads the sentence from
  // the translation — and `word_example_media` is keyed on the same
  // `example_id`, which is why the ja-JP clip belongs to this row either way.
  //
  // `jsonb_object_agg` would silently keep the last value on a duplicate key.
  // It cannot get one here: `word_example_media` has UNIQUE (example_id,
  // locale). That is the whole reason these clips are not in `word_media`,
  // where the same fold *is* reachable — see the ADR.
  const rows = await sql<ExampleRow[]>`
    SELECT
      e.word_id,
      ${language === "ja" ? sql`tr.translation` : sql`e.sentence`} AS sentence,
      e.cefr_level,
      (SELECT jsonb_object_agg(m.locale, m.url)
       FROM word_example_media m
       WHERE m.example_id = e.id) AS audio_by_locale
    FROM word_examples e
    LEFT JOIN word_example_translations tr
      ON tr.example_id = e.id AND tr.language = 'ja'
    WHERE e.word_id = ANY(${wordIds})
    ORDER BY e.word_id, e.sort_order, e.id
  `;

  const usable = rows.filter((row) => row.sentence && row.sentence.trim().length > 0);
  if (usable.length === 0) return out;

  const sentences = Array.from(new Set(usable.map((row) => row.sentence as string)));
  const mentions = await sql<MentionRow[]>`
    SELECT DISTINCT s.sentence, s.word_id
    FROM sentence_spans s
    WHERE s.sentence_language = ${language}
      AND s.sentence = ANY(${sentences})
      AND s.word_id IS NOT NULL
      AND s.version >= ${MIN_SPANS_VERSION}
  `;

  const mentionedBySentence = new Map<string, string[]>();
  for (const row of mentions) {
    const list = mentionedBySentence.get(row.sentence) ?? [];
    list.push(row.word_id);
    mentionedBySentence.set(row.sentence, list);
  }

  for (const row of usable) {
    const sentence = row.sentence as string;
    const list = out.get(row.word_id) ?? [];
    list.push({
      sentence,
      cefrLevel: row.cefr_level,
      audioUrls:
        row.audio_by_locale && Object.keys(row.audio_by_locale).length > 0
          ? row.audio_by_locale
          : null,
      // The target word itself is included. The client needs it in the set
      // anyway (a distractor equal to the answer is the one exclusion it
      // cannot skip), so filtering it out here would only make the payload
      // lie about what the sentence says.
      mentionedWordIds: mentionedBySentence.get(sentence) ?? [],
    });
    out.set(row.word_id, list);
  }
  return out;
}
