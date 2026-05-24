// Server-only DB CRUD for words. Imported by admin API routes.
//
// Throws if DATABASE_URL is missing — admin routes must not silently fall
// back to the read-only static data.

import "server-only";
import { revalidateTag } from "next/cache";
import { getSql } from "./db";
import type { Word, CategoryId } from "@/types";

interface Row {
  id: string;
  word: string;
  also_known_as: string[];
  chinese: string;
  category: string;
  part_of_speech: string;
  pronunciation: string;
  image_url: string;
  collocations: string[];
  examples: unknown;          // jsonb — string from postgres-js
  related_words: string[];
  confusing_words: unknown;   // jsonb — same
  note: string | null;
}

function parseJsonb<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}

function rowToWord(r: Row): Word {
  const examples = parseJsonb<{ en: string; zh: string }[]>(r.examples, []);
  const confusing = parseJsonb<{ word: string; note: string }[]>(r.confusing_words, []);
  return {
    id: r.id,
    word: r.word,
    alsoKnownAs: r.also_known_as.length ? r.also_known_as : undefined,
    chinese: r.chinese,
    category: r.category as CategoryId,
    partOfSpeech: r.part_of_speech,
    pronunciation: r.pronunciation,
    imageUrl: r.image_url,
    collocations: r.collocations.length ? r.collocations : undefined,
    examples,
    relatedWords: r.related_words.length ? r.related_words : undefined,
    confusingWords: confusing.length ? confusing : undefined,
    note: r.note ?? undefined,
  };
}

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export async function listAll(): Promise<Word[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, word, also_known_as, chinese, category, part_of_speech,
           pronunciation, image_url, collocations, examples,
           related_words, confusing_words, note
    FROM words
    ORDER BY category, word
  `) as unknown as Row[];
  return rows.map(rowToWord);
}

export async function getById(id: string): Promise<Word | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, word, also_known_as, chinese, category, part_of_speech,
           pronunciation, image_url, collocations, examples,
           related_words, confusing_words, note
    FROM words WHERE id = ${id}
  `) as unknown as Row[];
  return rows[0] ? rowToWord(rows[0]) : null;
}

function bustCaches(category?: string) {
  revalidateTag("words");
  // Hard revalidate the public pages that show word lists.
  // (revalidatePath would also work, but tag-only is enough since data layer is tagged.)
}

export async function create(w: Word): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO words (
      id, word, also_known_as, chinese, category, part_of_speech,
      pronunciation, image_url, collocations, examples,
      related_words, confusing_words, note
    ) VALUES (
      ${w.id}, ${w.word}, ${w.alsoKnownAs ?? []}, ${w.chinese}, ${w.category},
      ${w.partOfSpeech}, ${w.pronunciation}, ${w.imageUrl},
      ${w.collocations ?? []}, ${JSON.stringify(w.examples)}::jsonb,
      ${w.relatedWords ?? []}, ${JSON.stringify(w.confusingWords ?? [])}::jsonb,
      ${w.note ?? null}
    )
  `;
  bustCaches(w.category);
}

export async function update(id: string, w: Word): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE words SET
      word = ${w.word},
      also_known_as = ${w.alsoKnownAs ?? []},
      chinese = ${w.chinese},
      category = ${w.category},
      part_of_speech = ${w.partOfSpeech},
      pronunciation = ${w.pronunciation},
      image_url = ${w.imageUrl},
      collocations = ${w.collocations ?? []},
      examples = ${JSON.stringify(w.examples)}::jsonb,
      related_words = ${w.relatedWords ?? []},
      confusing_words = ${JSON.stringify(w.confusingWords ?? [])}::jsonb,
      note = ${w.note ?? null},
      updated_at = now()
    WHERE id = ${id}
  `;
  bustCaches(w.category);
}

export async function remove(id: string): Promise<void> {
  const sql = requireSql();
  await sql`DELETE FROM words WHERE id = ${id}`;
  bustCaches();
}
