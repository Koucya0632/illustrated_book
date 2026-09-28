// 個人筆記 storage. Always scoped to the owner.

import "server-only";
import { getSql } from "@/lib/db";

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export interface WordNote {
  wordId: string;
  body: string;
  updatedAt: string;
}

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : String(v));

/**
 * Every note the person has, for words still published. Small by nature (one
 * per word, ≤500 characters), so the app reads them once and keeps them — the
 * review reveal shows a note without a request of its own.
 */
export async function listWordNotes(userId: string): Promise<WordNote[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT n.word_id, n.body, n.updated_at
      FROM user_word_notes n
      JOIN words w ON w.id = n.word_id
     WHERE n.user_id = ${userId}::uuid AND w.deleted_at IS NULL AND w.status = 'published'
     ORDER BY n.updated_at DESC
  `) as unknown as { word_id: string; body: string; updated_at: string | Date }[];
  return rows.map((r) => ({ wordId: String(r.word_id), body: r.body, updatedAt: iso(r.updated_at) }));
}

export async function upsertWordNote(userId: string, wordId: string, body: string): Promise<WordNote> {
  const sql = requireSql();
  const [row] = (await sql`
    INSERT INTO user_word_notes (user_id, word_id, body)
    VALUES (${userId}::uuid, ${wordId}, ${body})
    ON CONFLICT (user_id, word_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()
    RETURNING word_id, body, updated_at
  `) as unknown as { word_id: string; body: string; updated_at: string | Date }[];
  return { wordId: String(row.word_id), body: row.body, updatedAt: iso(row.updated_at) };
}

export async function deleteWordNote(userId: string, wordId: string): Promise<void> {
  const sql = requireSql();
  await sql`DELETE FROM user_word_notes WHERE user_id = ${userId}::uuid AND word_id = ${wordId}`;
}

/** Only published, undeleted official words take a note. */
export async function noteableWord(wordId: string): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql`
    SELECT 1 FROM words WHERE id = ${wordId} AND deleted_at IS NULL AND status = 'published'
  `;
  return rows.length > 0;
}
