// Single source of word data for the public app.
// Reads from Postgres when DATABASE_URL is set; otherwise falls back to the
// static lib/words.ts (this keeps `npm run dev` working without a DB).

import { unstable_cache } from "next/cache";
import { dbEnabled, getSql } from "./db";
import { words as staticWords } from "./words";
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
  examples: { en: string; zh: string }[];
  related_words: string[];
  confusing_words: { word: string; note: string }[];
  note: string | null;
}

function rowToWord(r: Row): Word {
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
    examples: r.examples,
    relatedWords: r.related_words.length ? r.related_words : undefined,
    confusingWords: r.confusing_words.length ? r.confusing_words : undefined,
    note: r.note ?? undefined,
  };
}

const fetchAllFromDb = unstable_cache(
  async () => {
    const sql = getSql();
    if (!sql) return staticWords;
    const rows = (await sql`
      SELECT id, word, also_known_as, chinese, category, part_of_speech,
             pronunciation, image_url, collocations, examples,
             related_words, confusing_words, note
      FROM words
      ORDER BY category, word
    `) as unknown as Row[];
    return rows.map(rowToWord);
  },
  // v2: bump to invalidate stale entries from before the postgres-js
  // JSONB auto-parse fix (otherwise `.examples` is still a string).
  ["all-words-v2"],
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
      ...(w.relatedWords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
