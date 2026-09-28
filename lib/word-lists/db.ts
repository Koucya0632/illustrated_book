// 個人詞表 storage. Every query is scoped to the owner — a list id alone never
// reaches a row. Caps are per learning language, like everything else a
// learning direction owns (progress, 自製圖鑑): the two languages are separate
// libraries.
//
// Creating a list and adding a word take a per-owner advisory lock, so two
// devices cannot both pass the cap check and both write.

import "server-only";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import type { WordListRefusal } from "./policy";

type Lang = "en" | "ja";
type Exec = postgres.Sql | postgres.TransactionSql;

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export interface WordListRow {
  id: string;
  name: string;
  targetLanguage: Lang;
  position: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  /** Present only when the listing was asked about one word. */
  containsWord?: boolean;
}

interface RawListRow {
  id: string;
  name: string;
  target_language: Lang;
  position: number;
  word_count: number;
  created_at: string | Date;
  updated_at: string | Date;
  contains_word?: boolean | null;
}

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : String(v));

function toRow(r: RawListRow): WordListRow {
  return {
    id: String(r.id),
    name: r.name,
    targetLanguage: r.target_language,
    position: Number(r.position),
    wordCount: Number(r.word_count),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    ...(r.contains_word === undefined || r.contains_word === null
      ? {}
      : { containsWord: Boolean(r.contains_word) }),
  };
}

/** The owner's lists in one language, in their order (which is also lock order). */
export async function listWordLists(
  userId: string,
  lang: Lang,
  wordId?: string,
): Promise<WordListRow[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT l.id, l.name, l.target_language, l.position, l.created_at, l.updated_at,
           (SELECT count(*)::int FROM user_word_list_items i WHERE i.list_id = l.id) AS word_count
           ${wordId
             ? sql`, EXISTS (
                 SELECT 1 FROM user_word_list_items i
                  WHERE i.list_id = l.id AND i.word_id = ${wordId}
               ) AS contains_word`
             : sql``}
      FROM user_word_lists l
     WHERE l.user_id = ${userId}::uuid AND l.target_language = ${lang}
     ORDER BY l.position ASC, l.created_at ASC, l.id ASC
  `) as unknown as RawListRow[];
  return rows.map(toRow);
}

async function orderedIds(exec: Exec, userId: string, lang: Lang): Promise<string[]> {
  const rows = (await exec`
    SELECT id FROM user_word_lists
     WHERE user_id = ${userId}::uuid AND target_language = ${lang}
     ORDER BY position ASC, created_at ASC, id ASC
  `) as unknown as { id: string }[];
  return rows.map((r) => String(r.id));
}

export async function getWordList(userId: string, listId: string): Promise<WordListRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT l.id, l.name, l.target_language, l.position, l.created_at, l.updated_at,
           (SELECT count(*)::int FROM user_word_list_items i WHERE i.list_id = l.id) AS word_count
      FROM user_word_lists l
     WHERE l.id = ${listId}::uuid AND l.user_id = ${userId}::uuid
  `) as unknown as RawListRow[];
  return rows[0] ? toRow(rows[0]) : null;
}

/** Where the list sits in its owner's order, for the lock rule. */
export async function wordListIndex(userId: string, list: WordListRow): Promise<number> {
  return (await orderedIds(requireSql(), userId, list.targetLanguage)).indexOf(list.id);
}

export async function createWordList(
  userId: string,
  lang: Lang,
  name: string,
  gate: (currentCount: number) => WordListRefusal | null,
): Promise<{ list: WordListRow } | { refusal: WordListRefusal }> {
  const sql = requireSql();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`word-lists:${userId}`}))`;
    const ids = await orderedIds(tx, userId, lang);
    const refusal = gate(ids.length);
    if (refusal) return { refusal };
    // Appended: a new list goes last, so it is never the one that pushes an
    // older list over the cap.
    const [row] = (await tx`
      INSERT INTO user_word_lists (user_id, target_language, name, position)
      VALUES (
        ${userId}::uuid, ${lang}, ${name},
        COALESCE((SELECT max(position) + 1 FROM user_word_lists
                   WHERE user_id = ${userId}::uuid AND target_language = ${lang}), 0)
      )
      RETURNING id, name, target_language, position, created_at, updated_at, 0 AS word_count
    `) as unknown as RawListRow[];
    return { list: toRow(row) };
  });
}

export async function renameWordList(userId: string, listId: string, name: string): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql`
    UPDATE user_word_lists SET name = ${name}, updated_at = now()
     WHERE id = ${listId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteWordList(userId: string, listId: string): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql`
    DELETE FROM user_word_lists
     WHERE id = ${listId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Positions follow `ids`. Ids the caller does not own, or from the other
 * language, are ignored; owned lists missing from `ids` keep their relative
 * order after the given ones.
 */
export async function reorderWordLists(userId: string, lang: Lang, ids: string[]): Promise<void> {
  const sql = requireSql();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`word-lists:${userId}`}))`;
    const current = await orderedIds(tx, userId, lang);
    const owned = new Set(current);
    const given = ids.filter((id, i) => owned.has(id) && ids.indexOf(id) === i);
    const order = given.concat(current.filter((id) => !given.includes(id)));
    for (const [position, id] of order.entries()) {
      await tx`
        UPDATE user_word_lists SET position = ${position}
         WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND position <> ${position}
      `;
    }
  });
}

export async function addWordToList(
  userId: string,
  list: WordListRow,
  wordId: string,
  gate: (currentWords: number) => WordListRefusal | null,
): Promise<{ ok: true } | { refusal: WordListRefusal }> {
  const sql = requireSql();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`word-lists:${userId}`}))`;
    const [present] = (await tx`
      SELECT 1 AS x FROM user_word_list_items WHERE list_id = ${list.id}::uuid AND word_id = ${wordId}
    `) as unknown as { x: number }[];
    // Already there: adding again is a no-op, not a cap question.
    if (present) return { ok: true as const };
    const [{ c }] = (await tx`
      SELECT count(*)::int AS c FROM user_word_list_items WHERE list_id = ${list.id}::uuid
    `) as unknown as { c: number }[];
    const refusal = gate(Number(c));
    if (refusal) return { refusal };
    await tx`
      INSERT INTO user_word_list_items (list_id, word_id)
      VALUES (${list.id}::uuid, ${wordId})
      ON CONFLICT DO NOTHING
    `;
    await tx`UPDATE user_word_lists SET updated_at = now() WHERE id = ${list.id}::uuid`;
    return { ok: true as const };
  });
}

export async function removeWordFromList(listId: string, wordId: string): Promise<void> {
  const sql = requireSql();
  await sql`
    DELETE FROM user_word_list_items WHERE list_id = ${listId}::uuid AND word_id = ${wordId}
  `;
}

/** Only published, undeleted words — a retired word stops counting silently. */
export async function wordExists(wordId: string): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql`
    SELECT 1 FROM words WHERE id = ${wordId} AND deleted_at IS NULL AND status = 'published'
  `;
  return rows.length > 0;
}

export interface WordListWords {
  wordIds: string[];
  /** Counted in the list's own deck, like the study queue will. */
  stats: { total: number; seen: number; due: number };
}

export async function wordListWords(userId: string, list: WordListRow): Promise<WordListWords> {
  const sql = requireSql();
  const deckKey = list.targetLanguage === "ja" ? "image-ja" : "image-en";
  const [ids, [stats]] = await Promise.all([
    sql`
      SELECT i.word_id
        FROM user_word_list_items i
        JOIN words w ON w.id = i.word_id
       WHERE i.list_id = ${list.id}::uuid AND w.deleted_at IS NULL AND w.status = 'published'
       ORDER BY i.added_at DESC, i.word_id ASC
    ` as unknown as Promise<{ word_id: string }[]>,
    sql`
      SELECT count(*)::int AS total,
             count(uc.card_id)::int AS seen,
             count(uc.card_id) FILTER (WHERE uc.next_review_at <= now())::int AS due
        FROM user_word_list_items i
        JOIN words w ON w.id = i.word_id AND w.deleted_at IS NULL AND w.status = 'published'
        JOIN cards c ON c.word_id = i.word_id AND c.deck_key = ${deckKey}
        LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ${userId}::uuid
       WHERE i.list_id = ${list.id}::uuid
    ` as unknown as Promise<{ total: number; seen: number; due: number }[]>,
  ]);
  return {
    wordIds: ids.map((r) => String(r.word_id)),
    stats: {
      total: Number(stats?.total ?? 0),
      seen: Number(stats?.seen ?? 0),
      due: Number(stats?.due ?? 0),
    },
  };
}
