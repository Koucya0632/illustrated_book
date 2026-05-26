// Single source of word data for the public app.
// Reads from Postgres when DATABASE_URL is set; otherwise falls back to the
// static lib/words.ts (this keeps `npm run dev` working without a DB).

import { unstable_cache } from "next/cache";
import { dbEnabled, getSql } from "./db";
import { words as staticWords } from "./words";
import type {
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
  definitions: unknown;   // jsonb array of { language, definition, cefr_level, sort_order }
  examples: unknown;      // jsonb array of { sentence, cefr_level, sort_order, translations }
  relations: unknown;     // jsonb array of { word_id, relation_type, note }
  tags: string[] | null;
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

function rowToWord(r: Row): Word {
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

  // Legacy back-compat shims so unconverted UI code still works.
  const seeAlso = relations.filter((rel) => rel.type === "see-also").map((rel) => rel.wordId);
  const confusing = relations
    .filter((rel) => rel.type === "confusing")
    .map((rel) => ({ word: rel.wordId, note: rel.note ?? "" }));

  return {
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
    relatedWords: seeAlso.length ? seeAlso : undefined,
    confusingWords: confusing.length ? confusing : undefined,
  };
}

// One query, four correlated subqueries — each aggregating a child table to
// jsonb. With ≤ a few thousand rows and the per-child word_id indexes this
// stays at one round trip and EXPLAIN shows it as a single Sort + nested-
// loop with hash-aggregated children, not N+1.
const fetchAllFromDb = unstable_cache(
  async () => {
    const sql = getSql();
    if (!sql) return staticWords;
    const rows = (await sql`
      SELECT
        w.id, w.word, w.also_known_as, w.category, w.part_of_speech,
        w.pronunciation, w.audio_url, w.image_url, w.cefr_level, w.status,
        w.collocations, w.note,
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
        (SELECT array_agg(tag_id ORDER BY tag_id) FROM word_tags WHERE word_id = w.id) AS tags
      FROM words w
      WHERE w.deleted_at IS NULL AND w.status = 'published'
      ORDER BY w.category, w.word
    `) as unknown as Row[];
    return rows.map(rowToWord);
  },
  // v3: schema v2 read path with new joined tables. Bumped from v2 (which
  // bumped from v1 when the postgres-js JSONB auto-parse landed).
  ["all-words-v3"],
  { tags: ["words"], revalidate: 60 },
);

export async function getAllWords(): Promise<Word[]> {
  if (!dbEnabled()) return staticWords;
  try {
    return await fetchAllFromDb();
  } catch (err) {
    console.warn("[data] DB read failed, falling back to static:", err);
    return staticWords;
  }
}

export async function getWord(id: string): Promise<Word | undefined> {
  const all = await getAllWords();
  return all.find((w) => w.id === id);
}

export async function getWordsByCategory(categoryId: string): Promise<Word[]> {
  const all = await getAllWords();
  return all.filter((w) => w.category === categoryId);
}

export async function searchWordsAsync(query: string): Promise<Word[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await getAllWords();
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
    return haystack.includes(q);
  });
}
