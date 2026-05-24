import "server-only";
import { getSql } from "./db";
import type { Rating, Status } from "./srs";

export interface CardRow {
  id: number;
  word_id: string;
  card_type: string;
  front: string;
  back: string;
  explanation: string | null;
  tags: string[];
  deck_key: string;
}

export interface UserCardRow {
  user_id: string;  // UUID
  card_id: number;
  status: Status;
  interval_days: number;
  next_review_at: string;
  review_count: number;
  mistake_count: number;
  last_rating: Rating | null;
  last_reviewed_at: string | null;
}

export interface DueCard {
  card: CardRow;
  state: UserCardRow | null; // null = brand new for this user
  word: {
    id: string;
    word: string;
    chinese: string;
    image_url: string;
    pronunciation: string;
    category: string;
  };
  choices?: string[]; // multiple-choice options (shuffled, includes correct back)
  mastery?: number;  // current (decayed) mastery for this word, 0-100
}

const MCQ_TYPES = new Set(["回想卡", "填空卡"]);

export async function fetchDistractors(
  excludeCardId: number,
  deckKey: string,
  correctBack: string,
  n = 3,
): Promise<string[]> {
  const sql = requireSql();
  // Filter by deck_key so language/format of distractors matches the answer
  // (e.g. ZH→EN cards only get English distractors).
  // Over-fetch a bit then dedupe — PG forbids DISTINCT + ORDER BY random().
  const rows = (await sql`
    SELECT back FROM cards
    WHERE deck_key = ${deckKey}
      AND id <> ${excludeCardId}
      AND back <> ${correctBack}
    ORDER BY random()
    LIMIT ${n * 3}
  `) as unknown as { back: string }[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (out.length >= n) break;
    if (seen.has(r.back)) continue;
    seen.add(r.back);
    out.push(r.back);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pull all mastery rows for this user once, apply forgetting-curve decay,
// attach current mastery to each due card, then sort weakest-first within the
// already-due slice. New (unseen) cards stay at the end so review work isn't
// drowned out by fresh material.
export async function attachMasteryAndSort(
  userId: string,
  due: DueCard[],
): Promise<DueCard[]> {
  if (due.length === 0) return due;
  const { getAllMastery } = await import("./users-db");
  const { applyDecay } = await import("./mastery");
  const rows = await getAllMastery(userId);
  const byWord = new Map<string, { mastery: number; lastReviewedAt: Date | null }>();
  for (const r of rows) {
    byWord.set(r.word_id, {
      mastery: r.mastery,
      lastReviewedAt: r.last_reviewed_at ? new Date(r.last_reviewed_at) : null,
    });
  }
  const now = new Date();
  for (const d of due) {
    const m = byWord.get(d.word.id);
    d.mastery = m ? Math.round(applyDecay(m.mastery, m.lastReviewedAt, now)) : 0;
  }
  // Review (has state) first, sorted by mastery asc; then new (no state).
  due.sort((a, b) => {
    const aNew = a.state ? 0 : 1;
    const bNew = b.state ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    return (a.mastery ?? 0) - (b.mastery ?? 0);
  });
  return due;
}

export async function attachChoices(due: DueCard[]): Promise<DueCard[]> {
  for (const d of due) {
    if (!MCQ_TYPES.has(d.card.card_type)) continue;
    const distractors = await fetchDistractors(
      d.card.id,
      d.card.deck_key,
      d.card.back,
      3,
    );
    // Need at least 1 distractor to make MCQ meaningful.
    if (distractors.length === 0) continue;
    d.choices = shuffle([d.card.back, ...distractors]);
  }
  return due;
}

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

// "Due" = unseen cards (no user_cards row) + cards whose next_review_at ≤ now.
// New cards are limited per session to avoid overwhelming the user.
export async function fetchDue(
  userId: string,
  limit = 20,
  newLimit = 10,
): Promise<DueCard[]> {
  const sql = requireSql();

  // Review queue: ordered by due date asc.
  const reviewRows = (await sql`
    SELECT c.id, c.word_id, c.card_type, c.front, c.back, c.explanation, c.tags, c.deck_key,
           uc.user_id, uc.card_id, uc.status, uc.interval_days, uc.next_review_at,
           uc.review_count, uc.mistake_count, uc.last_rating, uc.last_reviewed_at,
           w.word AS w_word, w.chinese AS w_chinese, w.image_url AS w_image,
           w.pronunciation AS w_pron, w.category AS w_category
    FROM user_cards uc
    JOIN cards c ON c.id = uc.card_id
    JOIN words w ON w.id = c.word_id
    WHERE uc.user_id = ${userId}::uuid
      AND uc.next_review_at <= now()
    ORDER BY uc.next_review_at ASC
    LIMIT ${limit}
  `) as unknown as Record<string, unknown>[];

  // Pull in new (never-seen) cards if there's room.
  const remaining = Math.max(0, limit - reviewRows.length);
  const newRows = remaining > 0 ? ((await sql`
    SELECT c.id, c.word_id, c.card_type, c.front, c.back, c.explanation, c.tags, c.deck_key,
           w.word AS w_word, w.chinese AS w_chinese, w.image_url AS w_image,
           w.pronunciation AS w_pron, w.category AS w_category
    FROM cards c
    JOIN words w ON w.id = c.word_id
    WHERE NOT EXISTS (
      SELECT 1 FROM user_cards uc
      WHERE uc.user_id = ${userId}::uuid AND uc.card_id = c.id
    )
    ORDER BY c.id ASC
    LIMIT ${Math.min(remaining, newLimit)}
  `) as unknown as Record<string, unknown>[]) : [];

  function rowToDue(r: Record<string, unknown>, hasState: boolean): DueCard {
    const card: CardRow = {
      id: Number(r.id),
      word_id: String(r.word_id),
      card_type: String(r.card_type),
      front: String(r.front),
      back: String(r.back),
      explanation: (r.explanation as string | null) ?? null,
      tags: (r.tags as string[]) ?? [],
      deck_key: String(r.deck_key),
    };
    const state: UserCardRow | null = hasState
      ? {
          user_id: String(r.user_id),
          card_id: Number(r.card_id),
          status: r.status as Status,
          interval_days: Number(r.interval_days),
          next_review_at: String(r.next_review_at),
          review_count: Number(r.review_count),
          mistake_count: Number(r.mistake_count),
          last_rating: (r.last_rating as Rating | null) ?? null,
          last_reviewed_at: (r.last_reviewed_at as string | null) ?? null,
        }
      : null;
    const word = {
      id: card.word_id,
      word: String(r.w_word),
      chinese: String(r.w_chinese),
      image_url: String(r.w_image),
      pronunciation: String(r.w_pron),
      category: String(r.w_category),
    };
    return { card, state, word };
  }

  return [
    ...reviewRows.map((r) => rowToDue(r, true)),
    ...newRows.map((r) => rowToDue(r, false)),
  ];
}

export async function upsertReview(
  userId: string,
  cardId: number,
  next: {
    status: Status;
    intervalDays: number;
    nextReviewAt: Date;
    rating: Rating;
  },
  isMistake: boolean,
) {
  const sql = requireSql();
  await sql`
    INSERT INTO user_cards (
      user_id, card_id, status, interval_days, next_review_at,
      review_count, mistake_count, last_rating, last_reviewed_at, updated_at
    ) VALUES (
      ${userId}::uuid, ${cardId}, ${next.status}, ${next.intervalDays}, ${next.nextReviewAt.toISOString()},
      1, ${isMistake ? 1 : 0}, ${next.rating}, now(), now()
    )
    ON CONFLICT (user_id, card_id) DO UPDATE SET
      status         = EXCLUDED.status,
      interval_days  = EXCLUDED.interval_days,
      next_review_at = EXCLUDED.next_review_at,
      review_count   = user_cards.review_count + 1,
      mistake_count  = user_cards.mistake_count + ${isMistake ? 1 : 0},
      last_rating    = EXCLUDED.last_rating,
      last_reviewed_at = now(),
      updated_at     = now()
  `;
}

export async function getCardById(cardId: number, userId: string): Promise<DueCard | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT c.id, c.word_id, c.card_type, c.front, c.back, c.explanation, c.tags, c.deck_key,
           uc.user_id, uc.card_id, uc.status, uc.interval_days, uc.next_review_at,
           uc.review_count, uc.mistake_count, uc.last_rating, uc.last_reviewed_at,
           w.word AS w_word, w.chinese AS w_chinese, w.image_url AS w_image,
           w.pronunciation AS w_pron, w.category AS w_category
    FROM cards c
    LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ${userId}::uuid
    JOIN words w ON w.id = c.word_id
    WHERE c.id = ${cardId}
    LIMIT 1
  `) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const r = rows[0];
  const hasState = r.user_id != null;
  return {
    card: {
      id: Number(r.id),
      word_id: String(r.word_id),
      card_type: String(r.card_type),
      front: String(r.front),
      back: String(r.back),
      explanation: (r.explanation as string | null) ?? null,
      tags: (r.tags as string[]) ?? [],
      deck_key: String(r.deck_key),
    },
    state: hasState
      ? {
          user_id: String(r.user_id),
          card_id: Number(r.card_id),
          status: r.status as Status,
          interval_days: Number(r.interval_days),
          next_review_at: String(r.next_review_at),
          review_count: Number(r.review_count),
          mistake_count: Number(r.mistake_count),
          last_rating: (r.last_rating as Rating | null) ?? null,
          last_reviewed_at: (r.last_reviewed_at as string | null) ?? null,
        }
      : null,
    word: {
      id: String(r.word_id),
      word: String(r.w_word),
      chinese: String(r.w_chinese),
      image_url: String(r.w_image),
      pronunciation: String(r.w_pron),
      category: String(r.w_category),
    },
  };
}

export async function studyStats(userId: string) {
  const sql = requireSql();
  const [{ total }] =
    (await sql`SELECT count(*)::int AS total FROM cards`) as unknown as { total: number }[];
  const [{ seen }] =
    (await sql`SELECT count(*)::int AS seen FROM user_cards WHERE user_id = ${userId}::uuid`) as unknown as { seen: number }[];
  const [{ due }] =
    (await sql`SELECT count(*)::int AS due FROM user_cards WHERE user_id = ${userId}::uuid AND next_review_at <= now()`) as unknown as { due: number }[];
  const newCount = total - seen;
  const byStatus = (await sql`
    SELECT status, count(*)::int AS c
    FROM user_cards WHERE user_id = ${userId}::uuid
    GROUP BY status
  `) as unknown as { status: Status; c: number }[];
  return { total, seen, due, new: newCount, byStatus };
}
