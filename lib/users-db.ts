// Per-user data access. Auth is owned by Supabase (auth.users); this module
// is for the per-user app data tables (favorites, learned, quiz history,
// mastery). user_id is the Supabase auth user's UUID.
//
// Every query also includes `user_id = ${userId}` explicitly — defense in
// depth against accidentally leaking another user's data if RLS is ever
// misconfigured.

import "server-only";
import { getSql } from "./db";

export interface ProfileRow {
  id: string;          // UUID
  username: string;
  email: string;       // pulled from auth.users (joined)
  created_at: string;
}

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const sql = requireSql();
  const rows = await sql<ProfileRow[]>`
    SELECT p.id, p.username, u.email, p.created_at
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = ${userId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ---- favorites ----

export async function getFavorites(userId: string): Promise<string[]> {
  const sql = requireSql();
  const rows = await sql<{ word_id: string }[]>`
    SELECT word_id FROM user_favorites WHERE user_id = ${userId}::uuid
  `;
  return rows.map((r) => r.word_id);
}

export async function addFavorite(userId: string, wordId: string) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_favorites (user_id, word_id)
    VALUES (${userId}::uuid, ${wordId})
    ON CONFLICT DO NOTHING
  `;
}

export async function removeFavorite(userId: string, wordId: string) {
  const sql = requireSql();
  await sql`
    DELETE FROM user_favorites
    WHERE user_id = ${userId}::uuid AND word_id = ${wordId}
  `;
}

// ---- learned ----

export async function getLearned(userId: string): Promise<string[]> {
  const sql = requireSql();
  const rows = await sql<{ word_id: string }[]>`
    SELECT word_id FROM user_learned WHERE user_id = ${userId}::uuid
  `;
  return rows.map((r) => r.word_id);
}

export async function addLearned(userId: string, wordId: string) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_learned (user_id, word_id)
    VALUES (${userId}::uuid, ${wordId})
    ON CONFLICT DO NOTHING
  `;
}

// ---- quiz history ----

export interface QuizResultRow {
  id: number;
  quiz_type: string;
  total: number;
  correct: number;
  created_at: string;
}

export async function recordQuiz(
  userId: string,
  quizType: string,
  total: number,
  correct: number,
) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_quiz_results (user_id, quiz_type, total, correct)
    VALUES (${userId}::uuid, ${quizType}, ${total}, ${correct})
  `;
}

export async function getQuizHistory(
  userId: string,
  limit = 20,
): Promise<QuizResultRow[]> {
  const sql = requireSql();
  return sql<QuizResultRow[]>`
    SELECT id, quiz_type, total, correct, created_at
    FROM user_quiz_results
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

// ---- localStorage → server sync ----

export async function syncFromClient(
  userId: string,
  favorites: string[],
  learned: string[],
): Promise<{ favorites: string[]; learned: string[] }> {
  const favSet = Array.from(new Set(favorites)).filter(Boolean);
  const learnSet = Array.from(new Set(learned)).filter(Boolean);
  const sql = requireSql();

  for (const id of favSet) {
    try {
      await sql`
        INSERT INTO user_favorites (user_id, word_id)
        VALUES (${userId}::uuid, ${id})
        ON CONFLICT DO NOTHING
      `;
    } catch {
      /* unknown word_id — ignore */
    }
  }
  for (const id of learnSet) {
    try {
      await sql`
        INSERT INTO user_learned (user_id, word_id)
        VALUES (${userId}::uuid, ${id})
        ON CONFLICT DO NOTHING
      `;
    } catch {
      /* ignore */
    }
  }

  const [mergedFav, mergedLearn] = await Promise.all([
    getFavorites(userId),
    getLearned(userId),
  ]);
  return { favorites: mergedFav, learned: mergedLearn };
}

// ---- per-word mastery (decay applied at read, not at write) ----

export interface MasteryRow {
  word_id: string;
  mastery: number;
  last_reviewed_at: string | null;
  review_count: number;
}

export async function getMasteryRow(
  userId: string,
  wordId: string,
): Promise<MasteryRow | null> {
  const sql = requireSql();
  const rows = await sql<MasteryRow[]>`
    SELECT word_id, mastery::float8 AS mastery, last_reviewed_at, review_count
    FROM user_words
    WHERE user_id = ${userId}::uuid AND word_id = ${wordId}
  `;
  return rows[0] ?? null;
}

export async function upsertMastery(
  userId: string,
  wordId: string,
  newMastery: number,
  now: Date = new Date(),
): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_words (user_id, word_id, mastery, last_reviewed_at, review_count, updated_at)
    VALUES (${userId}::uuid, ${wordId}, ${newMastery}, ${now.toISOString()}, 1, ${now.toISOString()})
    ON CONFLICT (user_id, word_id) DO UPDATE SET
      mastery          = EXCLUDED.mastery,
      last_reviewed_at = EXCLUDED.last_reviewed_at,
      review_count     = user_words.review_count + 1,
      updated_at       = EXCLUDED.updated_at
  `;
}

export async function getAllMastery(userId: string): Promise<MasteryRow[]> {
  const sql = requireSql();
  return sql<MasteryRow[]>`
    SELECT word_id, mastery::float8 AS mastery, last_reviewed_at, review_count
    FROM user_words
    WHERE user_id = ${userId}::uuid
  `;
}
