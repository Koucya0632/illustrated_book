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

// ----------------------------------------------------------------------------
// study_logs — append-only event stream. One row per answered card.
// Mirrors user_cards / user_words mutations but is never UPDATEd; the table
// is monthly-partitioned + 12-month retention via pg_partman.
//
// The 0-3 rating maps from the Chinese UI labels (Rating in lib/srs.ts):
//   重來 → 0 (again),  困難 → 1 (hard),  穩定 → 2 (good),  熟練 → 3 (easy).
// ----------------------------------------------------------------------------
export type StudyLogActivity =
  | "flashcard"
  | "mcq"
  | "typing"
  | "listening"
  | "image_recall"
  | "reading";

export interface StudyLogInput {
  userId: string;            // UUID
  wordId: string;
  activity: StudyLogActivity;
  rating: 0 | 1 | 2 | 3;
  isCorrect: boolean;
  responseMs?: number | null;
  intervalBefore?: number | null;
  intervalAfter?: number | null;
  easeBefore?: number | null;
  easeAfter?: number | null;
  masteryBefore?: number | null;
  masteryAfter?: number | null;
  clientSessionId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function insertStudyLog(input: StudyLogInput): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO study_logs (
      user_id, word_id, activity, rating, is_correct, response_ms,
      interval_before, interval_after,
      ease_before, ease_after,
      mastery_before, mastery_after,
      client_session_id, metadata
    ) VALUES (
      ${input.userId}::uuid,
      ${input.wordId},
      ${input.activity},
      ${input.rating},
      ${input.isCorrect},
      ${input.responseMs ?? null},
      ${input.intervalBefore ?? null},
      ${input.intervalAfter ?? null},
      ${input.easeBefore ?? null},
      ${input.easeAfter ?? null},
      ${input.masteryBefore ?? null},
      ${input.masteryAfter ?? null},
      ${input.clientSessionId ?? null},
      ${sql.json(input.metadata ?? {})}
    )
  `;
}

export interface StudyStreak {
  current: number; // consecutive days up to today (alive if last day is today or yesterday)
  longest: number; // best run ever
  totalDays: number; // distinct days with ≥1 review
  todayCount: number; // reviews logged today
  lastStudyDate: string | null; // YYYY-MM-DD (local tz), null if never studied
}

const EMPTY_STREAK: StudyStreak = {
  current: 0,
  longest: 0,
  totalDays: 0,
  todayCount: 0,
  lastStudyDate: null,
};

// Consecutive-day streak from study_logs, bucketed by calendar day in the
// user's timezone (default Asia/Taipei — created_at is stored UTC). Uses the
// gaps-and-islands trick: within a run of consecutive dates, (d - row_number)
// is constant, so grouping on it isolates each run.
//
// "current" is alive if the most recent run ends today OR yesterday (so a day
// you haven't studied yet doesn't break the streak until it fully elapses).
//
// Wrapped in try/catch returning zeros: streak is a non-critical dashboard
// widget and must never 500 the /me page.
export async function getStudyStreak(
  userId: string,
  tz = "Asia/Taipei",
): Promise<StudyStreak> {
  const sql = getSql();
  if (!sql) return EMPTY_STREAK;
  try {
    const rows = await sql<
      {
        current: number;
        longest: number;
        total_days: number;
        today_count: number;
        last_study_date: string | null;
      }[]
    >`
      WITH logs AS (
        SELECT (created_at AT TIME ZONE ${tz})::date AS d
        FROM study_logs
        WHERE user_id = ${userId}::uuid
      ),
      days AS (SELECT DISTINCT d FROM logs),
      grouped AS (
        SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM days
      ),
      runs AS (
        SELECT count(*)::int AS len, max(d) AS end_d FROM grouped GROUP BY grp
      ),
      last_run AS (SELECT len, end_d FROM runs ORDER BY end_d DESC LIMIT 1)
      SELECT
        (SELECT count(*)::int FROM days)                    AS total_days,
        COALESCE((SELECT max(len) FROM runs), 0)            AS longest,
        COALESCE((
          SELECT CASE
            WHEN lr.end_d >= (now() AT TIME ZONE ${tz})::date - 1 THEN lr.len
            ELSE 0
          END FROM last_run lr
        ), 0)                                               AS current,
        (SELECT count(*)::int FROM logs
          WHERE d = (now() AT TIME ZONE ${tz})::date)       AS today_count,
        (SELECT to_char(end_d, 'YYYY-MM-DD') FROM last_run) AS last_study_date
    `;
    const r = rows[0];
    if (!r) return EMPTY_STREAK;
    return {
      current: r.current,
      longest: r.longest,
      totalDays: r.total_days,
      todayCount: r.today_count,
      lastStudyDate: r.last_study_date,
    };
  } catch (err) {
    console.warn("[users-db] getStudyStreak failed", err);
    return EMPTY_STREAK;
  }
}
