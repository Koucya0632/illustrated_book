import "server-only";
import { getSql } from "./db";

export interface PublicUser {
  id: number;
  username: string;
  email: string;
  createdAt: string;
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
}

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export function toPublic(r: UserRow): PublicUser {
  return {
    id: Number(r.id),
    username: r.username,
    email: r.email,
    createdAt: r.created_at,
  };
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, username, email, password_hash, created_at
    FROM users WHERE lower(email) = lower(${email})
    LIMIT 1
  `) as unknown as UserRow[];
  return rows[0] ?? null;
}

export async function findByUsername(username: string): Promise<UserRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, username, email, password_hash, created_at
    FROM users WHERE lower(username) = lower(${username})
    LIMIT 1
  `) as unknown as UserRow[];
  return rows[0] ?? null;
}

export async function findById(id: number): Promise<UserRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, username, email, password_hash, created_at
    FROM users WHERE id = ${id}
    LIMIT 1
  `) as unknown as UserRow[];
  return rows[0] ?? null;
}

export async function createUser(
  username: string,
  email: string,
  passwordHash: string,
): Promise<PublicUser> {
  const sql = requireSql();
  const rows = (await sql`
    INSERT INTO users (username, email, password_hash)
    VALUES (${username}, ${email}, ${passwordHash})
    RETURNING id, username, email, password_hash, created_at
  `) as unknown as UserRow[];
  return toPublic(rows[0]);
}

// ---- Google OAuth helpers ----

export async function findByGoogleSub(sub: string): Promise<UserRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, username, email, password_hash, created_at
    FROM users WHERE google_sub = ${sub}
    LIMIT 1
  `) as unknown as UserRow[];
  return rows[0] ?? null;
}

export async function linkGoogleSub(userId: number, sub: string): Promise<void> {
  const sql = requireSql();
  await sql`UPDATE users SET google_sub = ${sub} WHERE id = ${userId}`;
}

// Try the requested username; on conflict, append -2, -3, ... until free.
async function pickFreeUsername(base: string): Promise<string> {
  const sql = requireSql();
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 20) || "user";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? clean : `${clean}-${i + 1}`;
    const rows = (await sql`SELECT 1 FROM users WHERE lower(username) = lower(${candidate}) LIMIT 1`) as unknown as { "?column?": number }[];
    if (rows.length === 0) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

export async function createOAuthUser(opts: {
  email: string;
  preferredUsername: string;
  googleSub: string;
}): Promise<PublicUser> {
  const sql = requireSql();
  const username = await pickFreeUsername(opts.preferredUsername || opts.email.split("@")[0]);
  const rows = (await sql`
    INSERT INTO users (username, email, password_hash, google_sub)
    VALUES (${username}, ${opts.email}, NULL, ${opts.googleSub})
    RETURNING id, username, email, password_hash, created_at
  `) as unknown as UserRow[];
  return toPublic(rows[0]);
}

// ---- per-user data ----

export async function getFavorites(userId: number): Promise<string[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT word_id FROM user_favorites WHERE user_id = ${userId}
  `) as unknown as { word_id: string }[];
  return rows.map((r) => r.word_id);
}

export async function getLearned(userId: number): Promise<string[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT word_id FROM user_learned WHERE user_id = ${userId}
  `) as unknown as { word_id: string }[];
  return rows.map((r) => r.word_id);
}

export async function addFavorite(userId: number, wordId: string) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_favorites (user_id, word_id) VALUES (${userId}, ${wordId})
    ON CONFLICT DO NOTHING
  `;
}

export async function removeFavorite(userId: number, wordId: string) {
  const sql = requireSql();
  await sql`
    DELETE FROM user_favorites WHERE user_id = ${userId} AND word_id = ${wordId}
  `;
}

export async function addLearned(userId: number, wordId: string) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_learned (user_id, word_id) VALUES (${userId}, ${wordId})
    ON CONFLICT DO NOTHING
  `;
}

export interface QuizResultRow {
  id: number;
  quiz_type: string;
  total: number;
  correct: number;
  created_at: string;
}

export async function recordQuiz(
  userId: number,
  quizType: string,
  total: number,
  correct: number,
) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_quiz_results (user_id, quiz_type, total, correct)
    VALUES (${userId}, ${quizType}, ${total}, ${correct})
  `;
}

export async function getQuizHistory(
  userId: number,
  limit = 20,
): Promise<QuizResultRow[]> {
  const sql = requireSql();
  return (await sql`
    SELECT id, quiz_type, total, correct, created_at
    FROM user_quiz_results
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as unknown as QuizResultRow[];
}

// ---- Per-word mastery (decay applied at read time, not stored decayed) ----

export interface MasteryRow {
  word_id: string;
  mastery: number;
  last_reviewed_at: string | null;
  review_count: number;
}

export async function getMasteryRow(
  userId: number,
  wordId: string,
): Promise<MasteryRow | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT word_id, mastery::float8 AS mastery, last_reviewed_at, review_count
    FROM user_words WHERE user_id = ${userId} AND word_id = ${wordId}
  `) as unknown as MasteryRow[];
  return rows[0] ?? null;
}

export async function upsertMastery(
  userId: number,
  wordId: string,
  newMastery: number,
  now: Date = new Date(),
): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_words (user_id, word_id, mastery, last_reviewed_at, review_count, updated_at)
    VALUES (${userId}, ${wordId}, ${newMastery}, ${now.toISOString()}, 1, ${now.toISOString()})
    ON CONFLICT (user_id, word_id) DO UPDATE SET
      mastery          = EXCLUDED.mastery,
      last_reviewed_at = EXCLUDED.last_reviewed_at,
      review_count     = user_words.review_count + 1,
      updated_at       = EXCLUDED.updated_at
  `;
}

export async function getAllMastery(userId: number): Promise<MasteryRow[]> {
  const sql = requireSql();
  return (await sql`
    SELECT word_id, mastery::float8 AS mastery, last_reviewed_at, review_count
    FROM user_words WHERE user_id = ${userId}
  `) as unknown as MasteryRow[];
}

export async function syncFromClient(
  userId: number,
  favorites: string[],
  learned: string[],
): Promise<{ favorites: string[]; learned: string[] }> {
  const sql = requireSql();

  // De-dupe and limit to known words. We let FK constraint enforce that.
  const favSet = Array.from(new Set(favorites)).filter(Boolean);
  const learnSet = Array.from(new Set(learned)).filter(Boolean);

  // Insert favorites in bulk; ignore conflicts and FK violations silently.
  for (const id of favSet) {
    try {
      await sql`
        INSERT INTO user_favorites (user_id, word_id) VALUES (${userId}, ${id})
        ON CONFLICT DO NOTHING
      `;
    } catch {
      /* ignore missing word_id */
    }
  }
  for (const id of learnSet) {
    try {
      await sql`
        INSERT INTO user_learned (user_id, word_id) VALUES (${userId}, ${id})
        ON CONFLICT DO NOTHING
      `;
    } catch {
      /* ignore */
    }
  }

  // Return the merged authoritative state.
  const [mergedFav, mergedLearn] = await Promise.all([
    getFavorites(userId),
    getLearned(userId),
  ]);
  return { favorites: mergedFav, learned: mergedLearn };
}
