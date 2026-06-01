// Single source of word data for the public app.
// Reads from Postgres when DATABASE_URL is set; otherwise falls back to the
// static lib/words.ts (this keeps `npm run dev` working without a DB).

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { dbEnabled, getSql } from "./db";
import { words as staticWords } from "./words";
import { localizeWord, type LocalizedTextMap } from "./word-localize";
import type { UiLang } from "./settings";
import type {
  CardWord,
  CEFRLevel,
  CategoryId,
  Definition,
  Example,
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
  forms: unknown;         // jsonb array of { label, value }
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
  const chinese = primaryChinese(definitions);
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
    imageUrl: r.image_url,
    cefrLevel: (r.cefr_level as CEFRLevel) ?? undefined,
    status: r.status as WordStatus,
    definitions,
    chinese,
    examples,
    tags,
    relations,
    collocations: r.collocations.length ? r.collocations : undefined,
    note: r.note ?? undefined,
    etymology: r.etymology ?? undefined,
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
        w.collocations, w.note, w.etymology, w.forms,
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
        (SELECT jsonb_object_agg(lt.field || '|' || lt.language, lt.value)
         FROM word_localized_texts lt WHERE lt.word_id = w.id) AS localized_texts
      FROM words w
      WHERE w.deleted_at IS NULL AND w.status = 'published'
      ORDER BY w.category, w.word
    `) as unknown as Row[];
    return rows.map(rowToWord);
  },
  // v5: added per-language overlay fetch (word_localized_texts) and split
  // RawEntry from Word so per-request localization happens above the cache.
  ["all-words-v5"],
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

// React's `cache()` amortizes the per-request localize loop within a single
// render — every server component that asks for the same lang shares the
// same materialized array. `getAllRawEntries` underneath is already
// `unstable_cache`-wrapped, so cross-request reuse is also covered.
export const getAllWords = cache(async (lang: UiLang = "zh-Hant"): Promise<Word[]> => {
  const raw = await getAllRawEntries();
  return raw.map((r) => localizeWord(r.word, lang, r.localizedTexts));
});

export async function getWord(id: string, lang: UiLang = "zh-Hant"): Promise<Word | undefined> {
  const raw = await getAllRawEntries();
  const hit = raw.find((r) => r.word.id === id);
  return hit ? localizeWord(hit.word, lang, hit.localizedTexts) : undefined;
}

export async function getWordsByCategory(
  categoryId: string,
  lang: UiLang = "zh-Hant",
): Promise<Word[]> {
  const raw = await getAllRawEntries();
  return raw
    .filter((r) => r.word.category === categoryId)
    .map((r) => localizeWord(r.word, lang, r.localizedTexts));
}

// Lite shape for list-view consumers (WordsProvider). Drops definitions,
// examples, relations, etymology, note, forms, tags — the heavy fields that
// only the per-word detail page actually reads. At ~468 words this is the
// single biggest payload win on first paint.
export const getAllCardWords = cache(
  async (lang: UiLang = "zh-Hant"): Promise<CardWord[]> => {
    const raw = await getAllRawEntries();
    return raw.map((r) => {
      const w = localizeWord(r.word, lang, r.localizedTexts);
      return {
        id: w.id,
        word: w.word,
        chinese: w.chinese,
        imageUrl: w.imageUrl,
        category: w.category,
        pronunciation: w.pronunciation,
      };
    });
  },
);

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
