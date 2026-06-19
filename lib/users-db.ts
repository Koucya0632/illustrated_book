// Per-user data access. Auth is owned by Supabase (auth.users); this module
// is for the per-user app data tables (favorites, learned, mastery). user_id
// is the Supabase auth user's UUID.
//
// Every query also includes `user_id = ${userId}` explicitly — defense in
// depth against accidentally leaking another user's data if RLS is ever
// misconfigured.

import "server-only";
import { unstable_cache } from "next/cache";
import { getSql } from "./db";
import { DEFAULT_SETTINGS, normalizeSettings, type UserSettings } from "./settings";

export interface ProfileRow {
  id: string;          // UUID
  username: string;
  nickname: string | null; // editable display name; NULL → use username
  avatar: string;          // mascot pose name
  email: string;       // pulled from auth.users (joined)
  created_at: string;
}

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

// ---- per-user settings ----

export async function getSettings(userId: string): Promise<UserSettings> {
  const sql = getSql();
  if (!sql) return DEFAULT_SETTINGS;
  try {
    const rows = await sql<
      {
        daily_goal: number;
        accent: string;
        show_zh: boolean;
        study_categories: string;
        study_decks: string;
        ui_lang: string;
        font_size: string;
        reminder_enabled: boolean;
        reminder_hour: number;
        reminder_minute: number;
      }[]
    >`
      SELECT daily_goal, accent, show_zh, study_categories, study_decks, ui_lang, font_size,
             reminder_enabled, reminder_hour, reminder_minute
      FROM user_settings WHERE user_id = ${userId}::uuid LIMIT 1
    `;
    const r = rows[0];
    if (!r) return DEFAULT_SETTINGS;
    return normalizeSettings({
      dailyGoal: r.daily_goal,
      accent: r.accent as UserSettings["accent"],
      showZh: r.show_zh,
      studyCategories: (r.study_categories ?? "").split(",").filter(Boolean),
      studyDecks: (r.study_decks ?? "").split(",").filter(Boolean),
      uiLang: r.ui_lang as UserSettings["uiLang"],
      fontSize: r.font_size as UserSettings["fontSize"],
      reminderEnabled: r.reminder_enabled,
      reminderHour: r.reminder_hour,
      reminderMinute: r.reminder_minute,
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(userId: string, s: UserSettings): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_settings (user_id, daily_goal, accent, show_zh, study_categories, study_decks, ui_lang, font_size, reminder_enabled, reminder_hour, reminder_minute, updated_at)
    VALUES (${userId}::uuid, ${s.dailyGoal}, ${s.accent}, ${s.showZh}, ${s.studyCategories.join(",")}, ${s.studyDecks.join(",")}, ${s.uiLang}, ${s.fontSize}, ${s.reminderEnabled}, ${s.reminderHour}, ${s.reminderMinute}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET daily_goal       = EXCLUDED.daily_goal,
          accent           = EXCLUDED.accent,
          show_zh          = EXCLUDED.show_zh,
          study_categories = EXCLUDED.study_categories,
          study_decks      = EXCLUDED.study_decks,
          ui_lang          = EXCLUDED.ui_lang,
          font_size        = EXCLUDED.font_size,
          reminder_enabled = EXCLUDED.reminder_enabled,
          reminder_hour    = EXCLUDED.reminder_hour,
          reminder_minute  = EXCLUDED.reminder_minute,
          updated_at       = now()
  `;
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const sql = requireSql();
  const rows = await sql<ProfileRow[]>`
    SELECT p.id, p.username, p.nickname, p.avatar, u.email, p.created_at
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = ${userId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// Update the editable profile fields (display name + avatar). nickname is
// trimmed to NULL when blank so display falls back to the username handle.
export async function updateProfile(
  userId: string,
  fields: { nickname: string | null; avatar?: string },
): Promise<void> {
  const sql = requireSql();
  const nickname = fields.nickname && fields.nickname.trim() !== "" ? fields.nickname.trim() : null;
  // Avatar is optional: only overwrite the column when a value is supplied,
  // so a nickname-only update never resets the saved pose.
  if (fields.avatar !== undefined) {
    await sql`
      UPDATE profiles
      SET nickname = ${nickname}, avatar = ${fields.avatar}
      WHERE id = ${userId}::uuid
    `;
  } else {
    await sql`
      UPDATE profiles
      SET nickname = ${nickname}
      WHERE id = ${userId}::uuid
    `;
  }
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

// Wipe a user's learning progress: learned words, mastery, SRS card state,
// and the study-log history (which drives streak + heatmap). Favorites and
// settings are intentionally preserved. One transaction so it's all-or-nothing.
export async function clearLearningProgress(userId: string): Promise<void> {
  const sql = requireSql();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM user_learned WHERE user_id = ${userId}::uuid`;
    await tx`DELETE FROM user_words   WHERE user_id = ${userId}::uuid`;
    await tx`DELETE FROM user_cards   WHERE user_id = ${userId}::uuid`;
    await tx`DELETE FROM study_logs   WHERE user_id = ${userId}::uuid`;
  });
  // Bust the streak/heatmap + due/seen caches so the cleared state is
  // visible immediately. Wrapped in try/catch because revalidateTag
  // throws in non-request contexts (e.g. scripts).
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag(`progress:${userId}`);
    revalidateTag(`stats:${userId}`);
  } catch {}
}

// Per-day review activity for the last 6 calendar weeks (current week + 5
// prior), Sunday-aligned, in the user's timezone. Returns exactly 42 cells
// ordered oldest→newest, so index = week*7 + weekday (weekday 0 = Sunday) maps
// straight onto the heatmap grid. `future` marks days after today (the rest of
// the current week) so the UI can render them blank.
export interface HeatCell {
  count: number;
  future: boolean;
}

// Cached: 60s revalidate + tag `progress:<uid>` for explicit busting after
// `study/answer` (writes a row to study_logs) or clearLearningProgress.
// Heatmap moves at most once per minute of activity, so 60s is conservative.
export function getActivityHeatmap(
  userId: string,
  tz = "Asia/Taipei",
): Promise<HeatCell[]> {
  return unstable_cache(
    () => getActivityHeatmapRaw(userId, tz),
    ["heatmap", userId, tz],
    { tags: [`progress:${userId}`], revalidate: 60 },
  )();
}

async function getActivityHeatmapRaw(
  userId: string,
  tz: string,
): Promise<HeatCell[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql<{ count: number; future: boolean }[]>`
      WITH today AS (SELECT (now() AT TIME ZONE ${tz})::date AS d),
      days AS (
        SELECT gs::date AS d
        FROM today,
             generate_series(
               (SELECT d FROM today) - (extract(dow FROM (SELECT d FROM today))::int) - 35,
               (SELECT d FROM today) - (extract(dow FROM (SELECT d FROM today))::int) + 6,
               interval '1 day'
             ) gs
      ),
      counts AS (
        SELECT (created_at AT TIME ZONE ${tz})::date AS d, count(*)::int AS c
        FROM study_logs
        WHERE user_id = ${userId}::uuid
        GROUP BY 1
      )
      SELECT COALESCE(counts.c, 0)::int AS count,
             (days.d > (SELECT d FROM today)) AS future
      FROM days
      LEFT JOIN counts USING (d)
      ORDER BY days.d
    `;
    return rows;
  } catch (err) {
    console.warn("[users-db] getActivityHeatmap failed", err);
    return [];
  }
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
// Cached: 30s revalidate + tag `progress:<uid>`. Streak updates the instant
// the user logs a review (`/api/study/answer` revalidates the tag), so a
// short 30s window only matters when a parallel device adds activity.
export function getStudyStreak(
  userId: string,
  tz = "Asia/Taipei",
): Promise<StudyStreak> {
  return unstable_cache(
    () => getStudyStreakRaw(userId, tz),
    ["streak", userId, tz],
    { tags: [`progress:${userId}`], revalidate: 30 },
  )();
}

async function getStudyStreakRaw(
  userId: string,
  tz: string,
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
