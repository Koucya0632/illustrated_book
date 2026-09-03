// Single source of word data for the public app.
// Reads from Postgres when DATABASE_URL is set; otherwise falls back to the
// static lib/words.ts (this keeps `npm run dev` working without a DB).

import { unstable_cache } from "next/cache";
import { dbEnabled, getSql } from "./db";
import { words as staticWords } from "./words";
import { MIN_SPANS_VERSION, spansCoverSentence, unlinkSelfReference } from "./example-spans";
import { localizeSpans, localizeWord, type LocalizedTextMap } from "./word-localize";
import {
  targetLanguageFor,
  type LearningDirection,
  type UiLang,
} from "./settings";
import type {
  CardWord,
  GlossSpan,
  CEFRLevel,
  CategoryId,
  Definition,
  Example,
  FuriganaSegment,
  GlossSpanRow,
  RelationType,
  Word,
  WordRelation,
  WordStatus,
} from "@/types";
import { primaryChinese } from "@/types";

// Raw row shape from the v2 JOIN query. Everything jsonb_agg / array_agg
// produces is nullable when no children exist, so we coerce in `rowToWord`.
interface Row {
  id: string;
  word: string;
  also_known_as: string[];
  category: string;
  part_of_speech: string;
  pronunciation: string;
  audio_url: string | null;
  image_url: string;
  cefr_level: string | null;
  status: string;
  collocations: string[];
  note: string | null;
  etymology: string | null;
  chinese_definition: string | null;
  forms: unknown;         // jsonb array of { label, value }
  audio_by_locale: unknown; // jsonb_object_agg: "<locale>" -> url (kind='audio')
  definitions: unknown;   // jsonb array of { language, definition, cefr_level, sort_order }
  examples: unknown;      // jsonb array of { sentence, cefr_level, sort_order, translations }
  relations: unknown;     // jsonb array of { word_id, relation_type, note }
  tags: string[] | null;
  localized_texts: unknown; // jsonb_object_agg: "<field>|<lang>" -> value
}

// postgres-js sometimes hands us JSON columns as strings; tolerate both.
function parseJsonbColumn<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

function rowToWord(r: Row): { word: Word; localizedTexts: LocalizedTextMap } {
  const rawDefs = parseJsonbColumn<
    { language: string; definition: string; cefr_level: string | null; sort_order: number }[]
  >(r.definitions, []);
  const definitions: Definition[] = rawDefs.map((d) => ({
    language: d.language,
    definition: d.definition,
    cefrLevel: (d.cefr_level as CEFRLevel) ?? undefined,
    sortOrder: d.sort_order,
  }));

  const rawExamples = parseJsonbColumn<
    {
      sentence: string;
      cefr_level: string | null;
      sort_order: number;
      translations: Record<string, string> | null;
    }[]
  >(r.examples, []);
  const examples: Example[] = rawExamples.map((e) => {
    const translations = e.translations ?? {};
    return {
      en: e.sentence,
      zh: translations.zh ?? "",
      translations,
      cefrLevel: (e.cefr_level as CEFRLevel) ?? undefined,
      sortOrder: e.sort_order,
    };
  });

  const rawRelations = parseJsonbColumn<
    { word_id: string; relation_type: string; note: string | null }[]
  >(r.relations, []);
  const relations: WordRelation[] = rawRelations.map((rel) => ({
    wordId: rel.word_id,
    type: rel.relation_type as RelationType,
    note: rel.note ?? undefined,
  }));

  const tags = r.tags ?? [];
  const audioUrls = parseJsonbColumn<Record<string, string>>(r.audio_by_locale, {});
  const chinese = primaryChinese(definitions);
  const englishDefinition = definitions
    .filter((d) => d.language === "en")
    .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.definition;
  const forms = parseJsonbColumn<{ label: string; value: string }[]>(r.forms, []);

  // Legacy back-compat shims so unconverted UI code still works.
  const seeAlso = relations.filter((rel) => rel.type === "see-also").map((rel) => rel.wordId);
  const confusing = relations
    .filter((rel) => rel.type === "confusing")
    .map((rel) => ({ word: rel.wordId, note: rel.note ?? "" }));

  const localizedTexts = parseJsonbColumn<LocalizedTextMap>(r.localized_texts, {});

  const word: Word = {
    id: r.id,
    word: r.word,
    alsoKnownAs: r.also_known_as.length ? r.also_known_as : undefined,
    category: r.category as CategoryId,
    partOfSpeech: r.part_of_speech,
    pronunciation: r.pronunciation,
    audioUrl: r.audio_url ?? undefined,
    audioUrls: audioUrls && Object.keys(audioUrls).length ? audioUrls : undefined,
    imageUrl: r.image_url,
    cefrLevel: (r.cefr_level as CEFRLevel) ?? undefined,
    status: r.status as WordStatus,
    definitions,
    chinese,
    englishDefinition,
    examples,
    tags,
    relations,
    collocations: r.collocations.length ? r.collocations : undefined,
    note: r.note ?? undefined,
    etymology: r.etymology ?? undefined,
    chineseDefinition: r.chinese_definition ?? undefined,
    forms: forms.length ? forms : undefined,
    relatedWords: seeAlso.length ? seeAlso : undefined,
    confusingWords: confusing.length ? confusing : undefined,
  };
  return { word, localizedTexts };
}

// Raw (multi-language) entry: the Word plus a `field|lang -> value` map
// from `word_localized_texts`. Cached as-is and localized per-request based
// on the user's UI language; this avoids fanning the cache out by lang.
interface RawEntry {
  word: Word;
  localizedTexts: LocalizedTextMap;
}

// One query, five correlated subqueries — each aggregating a child table to
// jsonb. With ≤ a few thousand rows and the per-child word_id indexes this
// stays at one round trip and EXPLAIN shows it as a single Sort + nested-
// loop with hash-aggregated children, not N+1.
const fetchAllFromDb = unstable_cache(
  async (): Promise<RawEntry[]> => {
    const sql = getSql();
    if (!sql) return staticWords.map((w) => ({ word: w, localizedTexts: {} }));
    const rows = (await sql`
      SELECT
        w.id, w.word, w.also_known_as, w.category, w.part_of_speech,
        w.pronunciation, w.audio_url, w.image_url, w.cefr_level, w.status,
        w.collocations, w.note, w.etymology, w.chinese_definition, w.forms,
        (SELECT jsonb_agg(jsonb_build_object(
                  'language',   d.language,
                  'definition', d.definition,
                  'cefr_level', d.cefr_level,
                  'sort_order', d.sort_order
                ) ORDER BY d.language, d.sort_order)
         FROM word_definitions d WHERE d.word_id = w.id) AS definitions,
        (SELECT jsonb_agg(jsonb_build_object(
                  'sentence',     e.sentence,
                  'cefr_level',   e.cefr_level,
                  'sort_order',   e.sort_order,
                  'translations', (SELECT jsonb_object_agg(t.language, t.translation)
                                   FROM word_example_translations t
                                   WHERE t.example_id = e.id)
                ) ORDER BY e.sort_order)
         FROM word_examples e WHERE e.word_id = w.id) AS examples,
        (SELECT jsonb_agg(jsonb_build_object(
                  'word_id',       r.target_word_id,
                  'relation_type', r.relation_type,
                  'note',          r.note
                ))
         FROM word_relations r WHERE r.source_word_id = w.id) AS relations,
        (SELECT array_agg(tag_id ORDER BY tag_id) FROM word_tags WHERE word_id = w.id) AS tags,
        (SELECT jsonb_object_agg(m.locale, m.url)
         FROM word_media m
         WHERE m.word_id = w.id AND m.kind = 'audio' AND m.locale IS NOT NULL) AS audio_by_locale,
        (SELECT jsonb_object_agg(lt.field || '|' || lt.language, lt.value)
         FROM word_localized_texts lt WHERE lt.word_id = w.id) AS localized_texts
      FROM words w
      WHERE w.deleted_at IS NULL AND w.status = 'published'
      ORDER BY w.category, w.word
    `) as unknown as Row[];
    return rows.map(rowToWord);
  },
  // v7: Japanese definitions were upgraded from headword placeholders to
  // explanatory text. Bump the persistent Vercel data-cache key so the
  // production deploy cannot retain the pre-backfill rows.
  // v8: added per-locale pronunciation audio (audio_by_locale).
  ["all-words-v8"],
  { tags: ["words"], revalidate: 60 },
);

async function getAllRawEntries(): Promise<RawEntry[]> {
  if (!dbEnabled()) return staticWords.map((w) => ({ word: w, localizedTexts: {} }));
  try {
    return await fetchAllFromDb();
  } catch (err) {
    console.warn("[data] DB read failed, falling back to static:", err);
    return staticWords.map((w) => ({ word: w, localizedTexts: {} }));
  }
}

// `getAllRawEntries` underneath is already `unstable_cache`-wrapped, so
// the SQL hit is amortized across requests; the per-request localize loop
// runs cheaply on JSON-deserialized data.
export async function getAllWords(lang: UiLang = "zh-Hant"): Promise<Word[]> {
  const raw = await getAllRawEntries();
  return raw.map((r) => localizeWord(r.word, lang, r.localizedTexts));
}

export async function getAllLearningWords(
  lang: UiLang = "zh-Hant",
  direction: LearningDirection = "zh-en",
): Promise<Word[]> {
  const raw = await getAllRawEntries();
  const targetLanguage = targetLanguageFor(direction);
  const terms = await targetTermMap(direction);
  const jaGloss = await jaGlossTermMap(lang);
  return raw.flatMap((r) => {
    const word = localizeWord(r.word, lang, r.localizedTexts, jaGloss?.get(r.word.id)?.term);
    const term = terms.get(word.id);
    if (targetLanguage === "ja" && !term) return [];
    return [{
      ...word,
      word: term?.term ?? word.word,
      reading: term?.reading ?? undefined,
      readingSegments: term?.reading_segments ?? undefined,
      pronunciation: term?.pronunciation ?? term?.reading ?? word.pronunciation,
      targetLanguage,
    }];
  });
}

export async function getWord(id: string, lang: UiLang = "zh-Hant"): Promise<Word | undefined> {
  const raw = await getAllRawEntries();
  const hit = raw.find((r) => r.word.id === id);
  return hit ? localizeWord(hit.word, lang, hit.localizedTexts) : undefined;
}

interface TermRow {
  word_id: string;
  term: string;
  reading: string | null;
  pronunciation: string | null;
  reading_segments: FuriganaSegment[] | null;
}

const getTermRowsCached = unstable_cache(
  async (language: "en" | "ja"): Promise<TermRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    return sql<TermRow[]>`
      SELECT word_id, term, reading, pronunciation, reading_segments
      FROM word_terms
      WHERE language = ${language}
    `;
  },
  ["word-terms"],
  { tags: ["words"], revalidate: 300 },
);

async function targetTermMap(
  direction: LearningDirection,
): Promise<Map<string, TermRow>> {
  if (!dbEnabled()) return new Map();
  const rows = await getTermRowsCached(targetLanguageFor(direction));
  return new Map(rows.map((r) => [r.word_id, r]));
}

// ---- 詞塊 (sentence annotation) -----------------------------------------

interface SpanRow {
  sentence_language: string;
  sentence: string;
  text: string;
  base_form: string | null;
  part_of_speech: string | null;
  reading: string | null;
  word_id: string | null;
  glosses: Record<string, string> | null;
  pronunciation: string | null;
}

/**
 * 詞塊 for a set of sentences, fetched by the sentences themselves.
 *
 * Deliberately **not** folded into `fetchAllFromDb`. That query loads the
 * entire catalogue into one `unstable_cache` entry, and spans are roughly an
 * order of magnitude more rows than everything else in it put together — the
 * blob would grow past the 2 MB Vercel data-cache ceiling and silently stop
 * being cached at all, for data that only the word-detail screen reads. Lists,
 * search and the study queue render no sentences.
 *
 * The caller passes the exact strings it is about to render — one word's
 * example sentences plus its `targetDefinition` — so there is no join to a
 * source table and no way to pair an annotation with the wrong sentence.
 */
const getSpanRowsCached = unstable_cache(
  async (language: string, sentences: string[]): Promise<SpanRow[]> => {
    const sql = getSql();
    if (!sql || sentences.length === 0) return [];
    return sql<SpanRow[]>`
      SELECT
        s.sentence_language, s.sentence,
        s.text, s.base_form, s.part_of_speech, s.reading, s.word_id,
        t.pronunciation,
        (SELECT jsonb_object_agg(g.language, g.gloss)
         FROM sentence_span_glosses g
         WHERE g.sentence_language = s.sentence_language
           AND g.sentence = s.sentence
           AND g.sort_order = s.sort_order) AS glosses
      FROM sentence_spans s
      -- The transcription comes from the catalogue, and only when the span is
      -- spelled like the headword: word_id was resolved from the span's base
      -- form, so joining on it alone would print the transcription of "document"
      -- under "documents" and of "corner" under "next corner". 124 spans in the
      -- current corpus would be wrong that way. (No backticks in here: this is
      -- a JS template literal, and one would end the string.)
      LEFT JOIN word_terms t
        ON t.word_id = s.word_id
       AND t.language = s.sentence_language
       AND lower(t.term) = lower(s.text)
      WHERE s.sentence_language = ${language}
        AND s.sentence = ANY(${sentences})
        AND s.version >= ${MIN_SPANS_VERSION}
      ORDER BY s.sentence, s.sort_order
    `;
  },
  // v2: the cached blob gained `pronunciation`. Reusing v1 would serve rows
  // without the column until the tag happened to be revalidated.
  ["sentence-spans-v2"],
  { tags: ["words"], revalidate: 300 },
);

async function spansForSentences(
  language: string,
  sentences: string[],
): Promise<Map<string, GlossSpanRow[]>> {
  const out = new Map<string, GlossSpanRow[]>();
  const wanted = [...new Set(sentences.filter(Boolean))];
  if (!dbEnabled() || wanted.length === 0) return out;
  let rows: SpanRow[];
  try {
    rows = await getSpanRowsCached(language, wanted);
  } catch (err) {
    // An un-annotated sentence and an unreachable annotation look the same on
    // screen — plain text — so this must never take the detail down with it.
    console.warn("[data] span read failed", err);
    return out;
  }
  for (const r of rows) {
    const list = out.get(r.sentence) ?? [];
    list.push({
      text: r.text,
      glosses: r.glosses ?? {},
      baseForm: r.base_form ?? undefined,
      partOfSpeech: r.part_of_speech ?? undefined,
      reading: r.reading ?? undefined,
      wordId: r.word_id ?? undefined,
      pronunciation: r.pronunciation ?? undefined,
    });
    out.set(r.sentence, list);
  }
  return out;
}

/**
 * Short Japanese headwords, keyed by word id — the gloss a ja-UI reader needs,
 * regardless of which language they are learning.
 *
 * `targetTermMap` only loads these when the *learning target* is Japanese. A
 * Japanese speaker studying English is a different case: the target is English
 * and the gloss is Japanese, so the ja terms have to be loaded on the strength
 * of the UI language alone.
 *
 * Every read path that shows a gloss hands this to `localizeWord`, which is
 * where the rule lives: a gloss is a *word* — 電話, not 「電話」は、長距離の音声
 * 通信…, which is what the stored ja definition says and what every ja row
 * printed while this map went unloaded.
 */
async function jaGlossTermMap(lang: UiLang): Promise<Map<string, TermRow> | null> {
  if (lang !== "ja" || !dbEnabled()) return null;
  const rows = await getTermRowsCached("ja");
  return new Map(rows.map((r) => [r.word_id, r]));
}

export async function getLearningWord(
  id: string,
  lang: UiLang = "zh-Hant",
  direction: LearningDirection = "zh-en",
): Promise<Word | undefined> {
  const raw = await getAllRawEntries();
  const hit = raw.find((r) => r.word.id === id);
  if (!hit) return undefined;
  // Same gloss rule as the two list paths: the headline is the ja headword,
  // and the explanatory ja definition drops to the explainer line under it.
  const jaGloss = await jaGlossTermMap(lang);
  const base = localizeWord(hit.word, lang, hit.localizedTexts, jaGloss?.get(id)?.term);
  const targetLanguage = targetLanguageFor(direction);
  const term = (await targetTermMap(direction)).get(id);
  if (!term && targetLanguage === "ja") return undefined;

  const japaneseDefinition = hit.word.definitions
    .filter((d) => d.language === "ja")
    .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.definition;
  const targetDefinition =
    targetLanguage === "ja"
      ? japaneseDefinition?.trim() &&
        japaneseDefinition.trim() !== term?.term.trim()
        ? japaneseDefinition
        : undefined
      : hit.word.englishDefinition;
  let examples =
    targetLanguage === "ja"
      ? base.examples
          .filter((example) => Boolean(example.translations.ja?.trim()))
          .map((example) => ({
            ...example,
            // Japanese detail consumers must never fall back to rendering
            // the English source sentence.
            en: "",
            target: example.translations.ja.trim(),
          }))
      : base.examples.map((example) => ({ ...example, target: example.en }));
  if (lang === "ja" || lang === "en") {
    // Monolingual mode (UI language == sentence language): a gloss that
    // merely repeats the displayed sentence is noise — blank it so clients
    // hide the line.
    examples = examples.map((example) =>
      example.zh?.trim() && example.zh.trim() === example.target?.trim()
        ? { ...example, zh: "" }
        : example,
    );
  }

  // 詞塊 last, once the sentences a reader will actually see are settled:
  // `example.target` (the Japanese translation for a 日文 learner, not `en`)
  // and the 譯義 line. Both are sentences in the language being learned, both
  // are fetched by their own text, so an annotation can never be paired with a
  // sentence it does not describe.
  const annotated = await spansForSentences(targetLanguage, [
    ...examples.map((e) => e.target ?? ""),
    targetDefinition ?? "",
  ]);
  let targetDefinitionSpans: GlossSpan[] | undefined;
  if (annotated.size) {
    // Checked here as well as on the client. The client's check is what
    // actually protects the render, but a set that fails is a data fault worth
    // not shipping — and this is the layer that can still tell the difference
    // between "no annotation" and "a broken one".
    const attach = (sentence: string | undefined): GlossSpan[] | undefined => {
      if (!sentence) return undefined;
      const rows = annotated.get(sentence);
      if (!rows?.length) return undefined;
      if (!spansCoverSentence(rows, sentence)) {
        console.warn("[data] spans do not cover sentence", id, sentence);
        return undefined;
      }
      return localizeSpans(rows, lang);
    };
    examples = examples.map((example) => {
      const spans = unlinkSelfReference(attach(example.target), id);
      return spans ? { ...example, spans } : example;
    });
    targetDefinitionSpans = unlinkSelfReference(attach(targetDefinition), id);
  }

  return {
    ...base,
    // A 日文 learner already reads the ja definition as the 譯義 line above; the
    // explainer would repeat it word for word.
    chineseDefinition:
      base.chineseDefinition && base.chineseDefinition === targetDefinition
        ? undefined
        : base.chineseDefinition,
    word: term?.term ?? base.word,
    reading: term?.reading ?? undefined,
    readingSegments: term?.reading_segments ?? undefined,
    pronunciation: term?.pronunciation ?? term?.reading ?? base.pronunciation,
    targetLanguage,
    targetDefinition,
    targetDefinitionSpans,
    examples,
    // These fields describe English morphology/usage. Japanese detail mode
    // hides them until genuine Japanese equivalents exist.
    forms: targetLanguage === "ja" ? undefined : base.forms,
    collocations: targetLanguage === "ja" ? undefined : base.collocations,
    collocationsZh: targetLanguage === "ja" ? undefined : base.collocationsZh,
    etymology: targetLanguage === "ja" ? undefined : base.etymology,
    englishDefinition: targetLanguage === "ja" ? undefined : base.englishDefinition,
  };
}

export async function getWordsByCategory(
  categoryId: string,
  lang: UiLang = "zh-Hant",
  direction: LearningDirection = "zh-en",
): Promise<Word[]> {
  const all = await getAllLearningWords(lang, direction);
  return all.filter((w) => w.category === categoryId);
}

// Lite shape for list-view consumers (WordsProvider). Drops definitions,
// examples, relations, etymology, note, forms, tags — the heavy fields that
// only the per-word detail page actually reads. At ~468 words this is the
// single biggest payload win on first paint.
export async function getAllCardWords(
  lang: UiLang = "zh-Hant",
  direction: LearningDirection = "zh-en",
): Promise<CardWord[]> {
  const raw = await getAllRawEntries();
  const targetLanguage = targetLanguageFor(direction);
  const terms = await targetTermMap(direction);
  const jaGloss = await jaGlossTermMap(lang);
  // Only the locales the active deck can actually play: Japanese words use
  // the ja-JP clip, English words the US/UK pair (the on-device accent
  // setting picks between them). Keeps the lite payload — and its CDN cache
  // key — independent of the client's accent choice.
  const wanted = targetLanguage === "ja" ? ["ja-JP"] : ["en-US", "en-GB"];
  return raw.flatMap((r) => {
    const w = localizeWord(r.word, lang, r.localizedTexts, jaGloss?.get(r.word.id)?.term);
    const term = terms.get(w.id);
    // Japanese mode only exposes concepts with a real Japanese target term.
    if (targetLanguage === "ja" && !term) return [];
    const audioUrls = w.audioUrls
      ? Object.fromEntries(wanted.filter((l) => w.audioUrls![l]).map((l) => [l, w.audioUrls![l]]))
      : {};
    return [{
      id: w.id,
      word: term?.term ?? w.word,
      chinese: w.chinese,
      imageUrl: w.imageUrl,
      category: w.category,
      pronunciation: term?.pronunciation ?? term?.reading ?? w.pronunciation,
      reading: term?.reading ?? undefined,
      readingSegments: term?.reading_segments ?? undefined,
      targetLanguage,
      audioUrls: Object.keys(audioUrls).length ? audioUrls : undefined,
    }];
  });
}

// Escape ILIKE wildcards in user input so a literal "100%" doesn't match
// any string starting with "100". Default ESCAPE char is backslash.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

// In-memory haystack scan — fallback for local dev (no DATABASE_URL) and for
// the DB-error path. Searches the same fields the SQL path can't index
// (category / relations / tags) so behaviour is roughly equivalent at the
// 105-word scale; at production scale the SQL path is authoritative and
// covers the high-value fields (word, alsoKnownAs, definitions).
function inMemoryMatch(all: Word[], q: string): Word[] {
  const needle = q.toLowerCase();
  return all.filter((w) => {
    const haystack = [
      w.word,
      w.chinese,
      ...(w.alsoKnownAs ?? []),
      w.category,
      ...w.relations.map((r) => r.wordId),
      ...w.tags,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export interface SearchOptions {
  limit?: number;
}

export async function searchWordsAsync(
  query: string,
  options: SearchOptions = {},
  lang: UiLang = "zh-Hant",
): Promise<Word[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const all = await getAllWords(lang);
  if (!dbEnabled()) return inMemoryMatch(all, q).slice(0, limit);
  try {
    const sql = getSql();
    if (!sql) return inMemoryMatch(all, q).slice(0, limit);

    // Indexed ILIKEs:
    //   words.word            → words_word_trgm_idx (GIN, partial on published)
    //   word_definitions.def  → word_defs_text_trgm_idx (GIN)
    // also_known_as is a small TEXT[] column scanned via unnest — no GIN
    // index, but it runs after the words filter on a small candidate set.
    // LIMIT is applied at the SQL layer so the planner can stop early when
    // trigram matches saturate.
    const pattern = `%${escapeLike(q)}%`;
    const rows = (await sql`
      SELECT DISTINCT id FROM (
        SELECT w.id FROM words w
        WHERE w.deleted_at IS NULL AND w.status = 'published'
          AND (
            w.word ILIKE ${pattern}
            OR EXISTS (
              SELECT 1 FROM unnest(w.also_known_as) AS aka
              WHERE aka ILIKE ${pattern}
            )
          )
        UNION
        SELECT d.word_id FROM word_definitions d
        JOIN words w2 ON w2.id = d.word_id
        WHERE w2.deleted_at IS NULL AND w2.status = 'published'
          AND d.definition ILIKE ${pattern}
      ) AS m
      LIMIT ${limit}
    `) as unknown as { id: string }[];

    const ids = new Set(rows.map((r) => r.id));
    // Resolve against the cached Word list so callers get full shaped objects
    // (no second join query). Preserves the existing ORDER BY category, word.
    return all.filter((w) => ids.has(w.id));
  } catch (err) {
    console.warn("[data] search SQL failed, falling back to in-memory:", err);
    return inMemoryMatch(all, q).slice(0, limit);
  }
}

// Lite haystack for the CardWord variant. The CardWord shape omits
// alsoKnownAs / relations / tags, so the in-memory fallback can only match
// on the public-facing display fields (word / chinese / category). That's
// fine — the DB path is the primary source of truth; this fallback only
// fires in local dev without a DB.
function inMemoryMatchCard(all: CardWord[], q: string): CardWord[] {
  const needle = q.toLowerCase();
  return all.filter((w) =>
    [w.word, w.chinese, w.category].join(" ").toLowerCase().includes(needle),
  );
}

// Lite search: same SQL as searchWordsAsync (resolves to a set of word_ids
// via trigram indexes), but resolves the ids against the lite CardWord
// list so callers get the slim shape. Used by /api/search to keep the
// search payload aligned with the /cards optimization.
export async function searchCardWordsAsync(
  query: string,
  options: SearchOptions = {},
  lang: UiLang = "zh-Hant",
  direction: LearningDirection = "zh-en",
): Promise<CardWord[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const all = await getAllCardWords(lang, direction);
  if (!dbEnabled()) return inMemoryMatchCard(all, q).slice(0, limit);
  try {
    const sql = getSql();
    if (!sql) return inMemoryMatchCard(all, q).slice(0, limit);

    const pattern = `%${escapeLike(q)}%`;
    const rows = (await sql`
      SELECT DISTINCT id FROM (
        SELECT w.id FROM words w
        WHERE w.deleted_at IS NULL AND w.status = 'published'
          AND (
            w.word ILIKE ${pattern}
            OR EXISTS (
              SELECT 1 FROM unnest(w.also_known_as) AS aka
              WHERE aka ILIKE ${pattern}
            )
          )
        UNION
        SELECT t.word_id FROM word_terms t
        JOIN words w3 ON w3.id = t.word_id
        WHERE w3.deleted_at IS NULL AND w3.status = 'published'
          AND (t.term ILIKE ${pattern} OR t.reading ILIKE ${pattern})
        UNION
        SELECT d.word_id FROM word_definitions d
        JOIN words w2 ON w2.id = d.word_id
        WHERE w2.deleted_at IS NULL AND w2.status = 'published'
          AND d.definition ILIKE ${pattern}
      ) AS m
      LIMIT ${limit}
    `) as unknown as { id: string }[];

    const ids = new Set(rows.map((r) => r.id));
    return all.filter((w) => ids.has(w.id));
  } catch (err) {
    console.warn("[data] card search SQL failed, falling back to in-memory:", err);
    return inMemoryMatchCard(all, q).slice(0, limit);
  }
}
