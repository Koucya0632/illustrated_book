import "server-only";
import { unstable_cache } from "next/cache";
import { getSql } from "./db";
import {
  selectDistractors,
  type CandidateMeta,
  type RelationEdge,
  type TargetMeta,
} from "./distractors";
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
  // Spelling MCQ options for the new-learn Step 3 ("pick the correct
  // spelling"). Shuffled, contains the correct back plus 3 algorithmic
  // misspellings from lib/misspellings. Same attach trigger as `choices`.
  spellingChoices?: string[];
  mastery?: number;  // current (decayed) mastery for this word, 0-100
}

const MCQ_TYPES = new Set(["回想卡", "填空卡"]);

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
//
// `prefetched` lets the caller (e.g. /api/study/queue) parallelize the mastery
// fetch with the queue fetch — when provided, this function skips the DB hit.
export async function attachMasteryAndSort(
  userId: string,
  due: DueCard[],
  prefetched?: { word_id: string; mastery: number; last_reviewed_at: string | null; review_count: number }[],
): Promise<DueCard[]> {
  if (due.length === 0) return due;
  const { applyDecay } = await import("./mastery");
  let rows = prefetched;
  if (!rows) {
    const { getAllMastery } = await import("./users-db");
    rows = await getAllMastery(userId);
  }
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

// Attach 3 distractors + the correct back to every MCQ card in the queue.
// Distractors are picked by the metadata-aware scorer in lib/distractors —
// curated relations + same category > same POS + spelling/pronunciation
// similarity. Pool fetch + relation fetch are each a single round-trip; the
// per-card scoring is O(queueSize × poolSize) in memory and trivially fast
// at our scale (~20 × ~470).
export async function attachChoices(due: DueCard[]): Promise<DueCard[]> {
  const mcq = due.filter((d) => MCQ_TYPES.has(d.card.card_type));
  if (mcq.length === 0) return due;

  const sql = requireSql();
  const decks = Array.from(new Set(mcq.map((d) => d.card.deck_key)));
  const targetWordIds = Array.from(new Set(mcq.map((d) => d.word.id)));

  // 1. Candidate pool: every card in the relevant decks, joined with its
  //    word so each candidate knows its POS / category / CEFR / IPA / lemma.
  const poolRows = (await sql`
    SELECT c.id AS card_id, c.back, c.deck_key, c.word_id,
           w.word AS w_word, w.part_of_speech AS pos, w.category AS cat,
           w.cefr_level AS cefr, w.pronunciation AS pron
    FROM cards c
    JOIN words w ON w.id = c.word_id
    WHERE c.deck_key = ANY(${decks}::text[])
      AND w.deleted_at IS NULL
      AND w.status = 'published'
  `) as unknown as Array<{
    card_id: number;
    back: string;
    deck_key: string;
    word_id: string;
    w_word: string;
    pos: string | null;
    cat: string | null;
    cefr: string | null;
    pron: string | null;
  }>;

  const poolsByDeck = new Map<string, CandidateMeta[]>();
  for (const r of poolRows) {
    const meta: CandidateMeta = {
      cardId: Number(r.card_id),
      back: String(r.back),
      wordId: String(r.word_id),
      word: String(r.w_word ?? ""),
      pos: r.pos ?? "",
      category: r.cat ?? "",
      cefr: r.cefr ?? null,
      pronunciation: r.pron ?? "",
    };
    const deck = String(r.deck_key);
    const arr = poolsByDeck.get(deck) ?? [];
    arr.push(meta);
    poolsByDeck.set(deck, arr);
  }

  // 2. Relations: confusing / synonym / see-also edges touching any of the
  //    queue's target words, in either direction.
  const relations: RelationEdge[] =
    targetWordIds.length === 0
      ? []
      : (
          (await sql`
            SELECT source_word_id AS source,
                   target_word_id AS target,
                   relation_type AS type
            FROM word_relations
            WHERE relation_type IN ('confusing','synonym','see-also')
              AND (source_word_id = ANY(${targetWordIds}::text[])
                   OR target_word_id = ANY(${targetWordIds}::text[]))
          `) as unknown as Array<{ source: string; target: string; type: string }>
        ).map((r) => ({
          source: String(r.source),
          target: String(r.target),
          type: String(r.type),
        }));

  // 3. Score + pick per card. Spelling distractors come from a separate
  //    algorithmic generator (lib/misspellings) — no DB hit, so we slot
  //    them in beside `choices` without changing the query shape.
  const { generateMisspellings } = await import("./misspellings");
  for (const d of mcq) {
    const pool = poolsByDeck.get(d.card.deck_key) ?? [];
    const self = pool.find((c) => c.cardId === d.card.id);
    if (!self) continue;
    const target: TargetMeta = { ...self, deckKey: d.card.deck_key };
    const distractors = selectDistractors(target, pool, relations, 3);
    if (distractors.length > 0) {
      d.choices = shuffle([d.card.back, ...distractors]);
    }
    const misspells = generateMisspellings(d.card.back, 3);
    if (misspells.length > 0) {
      d.spellingChoices = shuffle([d.card.back, ...misspells]);
    }
  }
  return due;
}

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export interface QueueFilter {
  /** Restrict to words with `cefr_level` in this set. Empty/undefined = no filter. */
  cefr?: string[];
  /** Restrict to words that have ALL of these tags. */
  tags?: string[];
  /** Restrict to words in any of these categories (words.category). */
  categories?: string[];
  /** Restrict to cards in any of these decks (cards.deck_key). Empty = no filter. */
  deckKeys?: string[];
}

export type QueueMode = "new" | "review" | "both";

// "Due" = unseen cards (no user_cards row) + cards whose next_review_at ≤ now.
// `mode` selects which side of the queue to populate:
//   - "review": only due reviews (`uc.next_review_at <= now()`). `newLimit`
//     is ignored; `limit` caps the review pull.
//   - "new":    only never-seen cards. `limit` caps the new pull; the
//     `newLimit` argument is unused so the caller can pass anything.
//   - "both" (default, legacy): reviews first up to `limit`, then fill the
//     remainder with new cards up to `newLimit`.
export async function fetchDue(
  userId: string,
  limit = 20,
  newLimit = 10,
  filter: QueueFilter = {},
  mode: QueueMode = "both",
): Promise<DueCard[]> {
  const sql = requireSql();
  const cefr = (filter.cefr ?? []).filter((c) => /^[A-C][12]$/.test(c));
  const tags = (filter.tags ?? []).filter((t) => t.length > 0);
  const cats = (filter.categories ?? []).filter((c) => c.length > 0 && c !== "all");
  const decks = (filter.deckKeys ?? []).filter((d) => d.length > 0 && d !== "all");

  // Review queue: ordered by due date asc. The chinese display label comes
  // from a LATERAL pick of the first zh definition (sort_order asc).
  const reviewRows = mode === "new" ? [] : ((await sql`
    SELECT c.id, c.word_id, c.card_type, c.front, c.back, c.explanation, c.tags, c.deck_key,
           uc.user_id, uc.card_id, uc.status, uc.interval_days, uc.next_review_at,
           uc.review_count, uc.mistake_count, uc.last_rating, uc.last_reviewed_at,
           w.word AS w_word,
           COALESCE(zh.definition, '') AS w_chinese,
           w.image_url AS w_image,
           w.pronunciation AS w_pron, w.category AS w_category
    FROM user_cards uc
    JOIN cards c ON c.id = uc.card_id
    JOIN words w ON w.id = c.word_id
    LEFT JOIN LATERAL (
      SELECT definition FROM word_definitions
      WHERE word_id = w.id AND language = 'zh'
      ORDER BY sort_order LIMIT 1
    ) zh ON true
    WHERE uc.user_id = ${userId}::uuid
      AND uc.next_review_at <= now()
      AND w.deleted_at IS NULL
      AND w.status = 'published'
      ${cefr.length ? sql`AND w.cefr_level = ANY(${cefr})` : sql``}
      ${tags.length
        ? sql`AND NOT EXISTS (
            SELECT t FROM unnest(${tags}::text[]) AS t
            WHERE NOT EXISTS (
              SELECT 1 FROM word_tags wt WHERE wt.word_id = w.id AND wt.tag_id = t
            )
          )`
        : sql``}
      ${cats.length ? sql`AND w.category = ANY(${cats})` : sql``}
      ${decks.length ? sql`AND c.deck_key = ANY(${decks})` : sql``}
    ORDER BY uc.next_review_at ASC
    LIMIT ${limit}
  `) as unknown as Record<string, unknown>[]);

  // Pull in new (never-seen) cards. In "both" mode they fill the slack left
  // by reviews up to newLimit; in "new" mode `limit` is the cap directly.
  const newBudget =
    mode === "new"
      ? limit
      : mode === "review"
      ? 0
      : Math.min(Math.max(0, limit - reviewRows.length), newLimit);
  const newRows = newBudget > 0 ? ((await sql`
    SELECT c.id, c.word_id, c.card_type, c.front, c.back, c.explanation, c.tags, c.deck_key,
           w.word AS w_word,
           COALESCE(zh.definition, '') AS w_chinese,
           w.image_url AS w_image,
           w.pronunciation AS w_pron, w.category AS w_category
    FROM cards c
    JOIN words w ON w.id = c.word_id
    LEFT JOIN LATERAL (
      SELECT definition FROM word_definitions
      WHERE word_id = w.id AND language = 'zh'
      ORDER BY sort_order LIMIT 1
    ) zh ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM user_cards uc
      WHERE uc.user_id = ${userId}::uuid AND uc.card_id = c.id
    )
      AND w.deleted_at IS NULL
      AND w.status = 'published'
      ${cefr.length ? sql`AND w.cefr_level = ANY(${cefr})` : sql``}
      ${tags.length
        ? sql`AND NOT EXISTS (
            SELECT t FROM unnest(${tags}::text[]) AS t
            WHERE NOT EXISTS (
              SELECT 1 FROM word_tags wt WHERE wt.word_id = w.id AND wt.tag_id = t
            )
          )`
        : sql``}
      ${cats.length ? sql`AND w.category = ANY(${cats})` : sql``}
      ${decks.length ? sql`AND c.deck_key = ANY(${decks})` : sql``}
    ORDER BY c.id ASC
    LIMIT ${newBudget}
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

// Lite per-word mastery snapshot joined into getCardById (saves a round trip
// in the answer hot path — decay is applied by the caller).
export interface CardMasteryRow {
  mastery: number;
  last_reviewed_at: string | null;
  review_count: number;
}
export type CardWithMastery = DueCard & { masteryRow: CardMasteryRow | null };

// Single-query fetch of a card + its SRS state + the word + the user's current
// mastery row, so the answer endpoint needs one read instead of two.
export async function getCardById(cardId: number, userId: string): Promise<CardWithMastery | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT c.id, c.word_id, c.card_type, c.front, c.back, c.explanation, c.tags, c.deck_key,
           uc.user_id, uc.card_id, uc.status, uc.interval_days, uc.next_review_at,
           uc.review_count, uc.mistake_count, uc.last_rating, uc.last_reviewed_at,
           w.word AS w_word,
           COALESCE(zh.definition, '') AS w_chinese,
           w.image_url AS w_image,
           w.pronunciation AS w_pron, w.category AS w_category,
           uw.mastery::float8 AS uw_mastery,
           uw.last_reviewed_at AS uw_last_reviewed,
           uw.review_count AS uw_review_count
    FROM cards c
    LEFT JOIN user_cards uc ON uc.card_id = c.id AND uc.user_id = ${userId}::uuid
    JOIN words w ON w.id = c.word_id
    LEFT JOIN user_words uw ON uw.user_id = ${userId}::uuid AND uw.word_id = c.word_id
    LEFT JOIN LATERAL (
      SELECT definition FROM word_definitions
      WHERE word_id = w.id AND language = 'zh'
      ORDER BY sort_order LIMIT 1
    ) zh ON true
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
    masteryRow:
      r.uw_mastery != null
        ? {
            mastery: Number(r.uw_mastery),
            last_reviewed_at: (r.uw_last_reviewed as string | null) ?? null,
            review_count: Number(r.uw_review_count),
          }
        : null,
  };
}

// Cached: 30s revalidate + tag `stats:<uid>` for invalidation on writes.
// `due` is time-sensitive (cards become due as `next_review_at` rolls), so
// 30s is the upper bound on staleness — a card that becomes due mid-window
// won't show in the chip until the next refresh. Acceptable for UI counts.
//
// Cache key includes a sorted categories list so different theme filters
// don't collide; same theme set always hits the same entry.
export function studyStats(userId: string, categories: string[] = []) {
  const cats = (categories ?? [])
    .filter((c) => c.length > 0 && c !== "all")
    .sort();
  return unstable_cache(
    () => studyStatsRaw(userId, cats),
    ["studyStats", userId, cats.join(",")],
    { tags: [`stats:${userId}`], revalidate: 30 },
  )();
}

async function studyStatsRaw(userId: string, categories: string[]) {
  const sql = requireSql();
  // Five COUNTs in parallel — postgres-js dispatches them on independent
  // connections so the wall time collapses from ~5 × round-trip to ~1 ×.
  // "Today" in Asia/Taipei matches the date the home page renders, so the
  // chip / cap rolls over at the user's expected midnight.
  //
  // We previously tried folding these into ONE query with FILTER aggregates
  // + a scalar subquery, but that shape blew up at runtime against the
  // Supabase pooler (200/500 on every call). Five-query parallel is the
  // known-good shape; the pool-deadlock risk that motivated the rewrite is
  // already neutralised by max=15 in lib/db.ts (peak fan-out here = 5).
  //
  // The optional `categories` filter is woven into every query rather than
  // applied once (CTE / outer JOIN), so each query stays self-contained
  // and the five-way parallel shape is preserved. The total query JOINs
  // cards → words; the four user_cards queries JOIN user_cards → cards →
  // words. The filter uses `category = ANY(...)` to match fetchDue.
  const cats = (categories ?? []).filter((c) => c.length > 0 && c !== "all");
  const catFilter = cats.length ? sql`AND w.category = ANY(${cats})` : sql``;
  const ucCatFilter = cats.length ? sql`AND w.category = ANY(${cats})` : sql``;
  const [totalRows, seenRows, dueRows, todayNewRows, byStatus] = await Promise.all([
    sql`
      SELECT count(*)::int AS total
      FROM cards c
      JOIN words w ON w.id = c.word_id
      WHERE w.deleted_at IS NULL AND w.status = 'published'
      ${catFilter}
    ` as Promise<{ total: number }[]>,
    sql`
      SELECT count(*)::int AS seen
      FROM user_cards uc
      JOIN cards c ON c.id = uc.card_id
      JOIN words w ON w.id = c.word_id
      WHERE uc.user_id = ${userId}::uuid
      ${ucCatFilter}
    ` as Promise<{ seen: number }[]>,
    sql`
      SELECT count(*)::int AS due
      FROM user_cards uc
      JOIN cards c ON c.id = uc.card_id
      JOIN words w ON w.id = c.word_id
      WHERE uc.user_id = ${userId}::uuid AND uc.next_review_at <= now()
      ${ucCatFilter}
    ` as Promise<{ due: number }[]>,
    sql`
      SELECT count(*)::int AS "todayNew"
      FROM user_cards uc
      JOIN cards c ON c.id = uc.card_id
      JOIN words w ON w.id = c.word_id
      WHERE uc.user_id = ${userId}::uuid
        AND (uc.created_at AT TIME ZONE 'Asia/Taipei')::date
          = (now() AT TIME ZONE 'Asia/Taipei')::date
      ${ucCatFilter}
    ` as Promise<{ todayNew: number }[]>,
    sql`
      SELECT uc.status, count(*)::int AS c
      FROM user_cards uc
      JOIN cards c ON c.id = uc.card_id
      JOIN words w ON w.id = c.word_id
      WHERE uc.user_id = ${userId}::uuid
      ${ucCatFilter}
      GROUP BY uc.status
    ` as Promise<{ status: Status; c: number }[]>,
  ]);
  const total = totalRows[0].total;
  const seen = seenRows[0].seen;
  const due = dueRows[0].due;
  const todayNew = todayNewRows[0].todayNew;
  const newCount = total - seen;
  return { total, seen, due, new: newCount, todayNew, byStatus };
}

// Per-category dictionary completion. `total` = published cards in the
// category; `seen` = those the user has a user_cards row for (i.e. has
// studied at least once). Powers the Progress tab's completion % +
// category breakdown — a single grouped LEFT JOIN, deliberately NOT the
// FILTER-aggregate-with-subquery shape that broke the pooler in
// studyStatsRaw (see note above).
export interface CategoryProgressRow {
  category: string;
  total: number;
  seen: number;
}

export function categoryProgress(userId: string): Promise<CategoryProgressRow[]> {
  return unstable_cache(
    () => categoryProgressRaw(userId),
    ["categoryProgress", userId],
    { tags: [`stats:${userId}`], revalidate: 30 },
  )();
}

async function categoryProgressRaw(userId: string): Promise<CategoryProgressRow[]> {
  const sql = requireSql();
  return sql<CategoryProgressRow[]>`
    SELECT w.category                 AS category,
           count(*)::int              AS total,
           count(uc.card_id)::int     AS seen
    FROM cards c
    JOIN words w ON w.id = c.word_id
    LEFT JOIN user_cards uc
      ON uc.card_id = c.id AND uc.user_id = ${userId}::uuid
    WHERE w.deleted_at IS NULL AND w.status = 'published'
    GROUP BY w.category
  `;
}
