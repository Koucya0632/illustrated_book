import "server-only";
import { randomUUID } from "node:crypto";
import { getSql } from "./db";
import type { Rating, Status } from "./srs";
import type { FuriganaSegment } from "./kana";
import type {
  AtlasCardRow,
  AtlasCardStateRow,
  AtlasCollectionReviewStatus,
  AtlasCollectionMemberRow,
  AtlasCollectionRow,
  AtlasDeckKey,
  AtlasDueCard,
  AtlasImageRow,
  AtlasItemRow,
  AtlasMasteryRow,
  AtlasModerationPhase,
  AtlasModerationVerdict,
  AtlasPublicItemRow,
  AtlasPublicItemWithAuthorRow,
  AtlasRecognitionJobRow,
  AtlasReviewStatus,
  AtlasTargetLanguage,
} from "./atlas/types";
import {
  memberNeedsOwnReview,
  refusalForAdd,
  type AtlasCollectionAddRefusal,
} from "./atlas/collection-membership";
import { atlasContainsPattern } from "./atlas/public-query";
import type { ReportReason, ReportTarget } from "./atlas/report-reasons";

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export async function getAtlasImage(
  userId: string,
  imageId: string,
): Promise<AtlasImageRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasImageRow[]>`
    SELECT *
    FROM user_atlas_images
    WHERE user_id = ${userId}::uuid
      AND id = ${imageId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listAtlasImages(
  userId: string,
  limit = 30,
): Promise<AtlasImageRow[]> {
  const sql = requireSql();
  return sql<AtlasImageRow[]>`
    SELECT *
    FROM user_atlas_images
    WHERE user_id = ${userId}::uuid
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;
}

export async function getLatestAtlasRecognitionJob(
  userId: string,
  imageId: string,
): Promise<AtlasRecognitionJobRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasRecognitionJobRow[]>`
    SELECT *
    FROM user_atlas_recognition_jobs
    WHERE user_id = ${userId}::uuid
      AND image_id = ${imageId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function updateAtlasImageStatus(
  userId: string,
  imageId: string,
  status: AtlasImageRow["status"],
  failureReason?: string | null,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE user_atlas_images
    SET status = ${status},
        failure_reason = ${failureReason ?? null},
        updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND id = ${imageId}::uuid
      AND deleted_at IS NULL
  `;
}

export async function getAtlasItem(
  userId: string,
  itemId: string,
): Promise<AtlasItemRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasItemRow[]>`
    SELECT *
    FROM user_atlas_items
    WHERE user_id = ${userId}::uuid
      AND id = ${itemId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createAtlasCardsForItem(
  userId: string,
  itemId: string,
  cardTypes: ("image_recall" | "flashcard" | "spelling" | "word_recall")[],
): Promise<AtlasCardRow[]> {
  const sql = requireSql();
  const item = await getAtlasItem(userId, itemId);
  if (!item) return [];
  const image = await getAtlasImage(userId, item.image_id);
  if (!image) return [];
  const deckKey: AtlasDeckKey = item.target_language === "ja" ? "atlas-image-ja" : "atlas-image-en";
  const created: AtlasCardRow[] = [];

  for (const cardType of Array.from(new Set(cardTypes))) {
    const back = cardType === "flashcard" ? `${item.lemma}｜${item.display_zh_hant}` : item.lemma;
    const frontText = cardType === "flashcard" ? item.display_zh_hant : null;
    const rows = await sql<AtlasCardRow[]>`
      INSERT INTO user_atlas_cards (
        user_id, item_id, image_id, deck_key, card_type,
        front_text, front_image_path, back, explanation, tags, updated_at
      )
      VALUES (
        ${userId}::uuid,
        ${item.id}::uuid,
        ${image.id}::uuid,
        ${deckKey},
        ${cardType},
        ${frontText},
        ${image.thumb_path},
        ${back},
        ${item.definition_zh_hant ?? item.display_zh_hant},
        ${["atlas"]},
        now()
      )
      ON CONFLICT (user_id, item_id, deck_key, card_type)
        WHERE deleted_at IS NULL
      DO UPDATE SET
        front_text = EXCLUDED.front_text,
        front_image_path = EXCLUDED.front_image_path,
        back = EXCLUDED.back,
        explanation = EXCLUDED.explanation,
        updated_at = now()
      RETURNING *
    `;
    const card = rows[0];
    created.push(card);
    await sql`
      INSERT INTO user_atlas_card_state (user_id, card_id, status, next_review_at, updated_at)
      VALUES (${userId}::uuid, ${card.id}::uuid, '新卡', now(), now())
      ON CONFLICT (user_id, card_id) DO NOTHING
    `;
  }

  await updateAtlasImageStatus(userId, item.image_id, "cards_ready");
  return created;
}

export async function fetchAtlasDue(
  userId: string,
  limit = 20,
  mode: "new" | "review" | "both" = "both",
  // Required (nullable, no default) on purpose: every caller must decide the
  // language scope explicitly. The unified study queue passes the session's
  // learning direction — without it, EN captures surface in a JA 學新字/復習
  // and the queue disagrees with atlasStudyStats / atlasCategoryProgress,
  // which both filter. null = all languages (the dedicated atlas page).
  targetLanguage: AtlasTargetLanguage | null,
  // Required (no default) for the same reason: items locked for being over the
  // slot cap (getLockedAtlasItemIds) must never reach a study queue, and a new
  // caller has to say so. Pass [] only where no lock can apply.
  excludeItemIds: readonly string[],
): Promise<AtlasDueCard[]> {
  const sql = requireSql();
  const excluded = excludeItemIds.length
    ? sql`AND NOT (i.id = ANY(${[...excludeItemIds]}::uuid[]))`
    : sql``;
  const includeNew = mode === "new" || mode === "both";
  const includeReview = mode === "review" || mode === "both";
  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      c.*,
      s.status AS s_status,
      s.interval_days AS s_interval_days,
      s.next_review_at AS s_next_review_at,
      s.review_count AS s_review_count,
      s.mistake_count AS s_mistake_count,
      s.last_rating AS s_last_rating,
      s.last_reviewed_at AS s_last_reviewed_at,
      s.created_at AS s_created_at,
      s.updated_at AS s_updated_at,
      i.id AS i_id,
      i.user_id AS i_user_id,
      i.image_id AS i_image_id,
      i.selected_candidate_id AS i_selected_candidate_id,
      i.target_language AS i_target_language,
      i.canonical_word_id AS i_canonical_word_id,
      i.primary_label AS i_primary_label,
      i.fine_label AS i_fine_label,
      i.lemma AS i_lemma,
      i.display_zh_hant AS i_display_zh_hant,
      i.display_ja AS i_display_ja,
      i.display_en AS i_display_en,
      i.part_of_speech AS i_part_of_speech,
      i.cefr_level AS i_cefr_level,
      i.pronunciation AS i_pronunciation,
      i.reading AS i_reading,
      i.reading_segments AS i_reading_segments,
      i.category AS i_category,
      i.taxonomy_path AS i_taxonomy_path,
      i.definition_zh_hant AS i_definition_zh_hant,
      i.definition_ja AS i_definition_ja,
      i.definition_en AS i_definition_en,
      i.definition_target AS i_definition_target,
      i.example_target AS i_example_target,
      i.example_zh_hant AS i_example_zh_hant,
      i.note_zh_hant AS i_note_zh_hant,
      i.correction_source AS i_correction_source,
      i.backfill_status AS i_backfill_status,
      i.backfill_error AS i_backfill_error,
      i.visibility AS i_visibility,
      i.review_status AS i_review_status,
      i.published_at AS i_published_at,
      i.public_slug AS i_public_slug,
      i.share_image_path AS i_share_image_path,
      i.cdn_cache_key AS i_cdn_cache_key,
      i.created_at AS i_created_at,
      i.updated_at AS i_updated_at,
      i.deleted_at AS i_deleted_at,
      img.id AS img_id,
      img.user_id AS img_user_id,
      img.status AS img_status,
      img.bucket AS img_bucket,
      img.original_path AS img_original_path,
      img.thumb_path AS img_thumb_path,
      img.recognition_path AS img_recognition_path,
      img.mime_type AS img_mime_type,
      img.byte_size AS img_byte_size,
      img.width AS img_width,
      img.height AS img_height,
      img.sha256 AS img_sha256,
      img.perceptual_hash AS img_perceptual_hash,
      img.failure_reason AS img_failure_reason,
      img.created_at AS img_created_at,
      img.updated_at AS img_updated_at,
      img.deleted_at AS img_deleted_at,
      COALESCE(m.mastery::float8, 0) AS mastery
    FROM user_atlas_cards c
    JOIN user_atlas_items i ON i.id = c.item_id AND i.user_id = ${userId}::uuid
    JOIN user_atlas_images img ON img.id = c.image_id AND img.user_id = ${userId}::uuid
    LEFT JOIN user_atlas_card_state s
      ON s.card_id = c.id AND s.user_id = ${userId}::uuid
    LEFT JOIN user_atlas_item_mastery m
      ON m.item_id = i.id
     AND m.user_id = ${userId}::uuid
     AND m.target_language = i.target_language
    WHERE c.user_id = ${userId}::uuid
      AND c.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND img.deleted_at IS NULL
      ${targetLanguage ? sql`AND i.target_language = ${targetLanguage}` : sql``}
      ${excluded}
      AND (
        -- New: a 新卡 card whose ITEM has no studied card yet. An item makes two
        -- cards (image_recall + flashcard) but the study flow dedupes to one per
        -- item, so once any card is studied the item must leave the new pool —
        -- otherwise its leftover 新卡 sibling resurfaces the word in 學新字 and,
        -- being the oldest, starves never-studied items out of the limit.
        (${includeNew} AND (s.card_id IS NULL OR s.status = '新卡')
          AND NOT EXISTS (
            SELECT 1
            FROM user_atlas_cards c2
            JOIN user_atlas_card_state s2
              ON s2.card_id = c2.id AND s2.user_id = ${userId}::uuid
            WHERE c2.item_id = i.id
              AND c2.deleted_at IS NULL
              AND s2.status <> '新卡'
          ))
        -- Review: genuinely scheduled cards only. 新卡 rows carry a creation-time
        -- next_review_at (already in the past), so without the status guard they
        -- would masquerade as due here.
        OR (${includeReview} AND s.status <> '新卡' AND s.next_review_at <= now())
      )
    ORDER BY
      CASE WHEN s.card_id IS NULL OR s.status = '新卡' THEN 1 ELSE 0 END,
      s.next_review_at ASC NULLS FIRST,
      c.created_at ASC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;

  return rows.map(rowToAtlasDueCard);
}

export async function listAtlasCustomWords(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
): Promise<Array<{
  item: AtlasItemRow;
  originalPath: string;
  thumbPath: string;
  updatedAt: string;
}>> {
  const sql = requireSql();
  // Returns the FULL item row (to_jsonb) plus both image paths so the
  // custom-words route can embed the complete per-word detail
  // (atlasItemToWord). That lets iOS render WordDetailView without a second
  // round-trip to /api/atlas/items/{id}/detail on every open.
  return sql`
    SELECT DISTINCT ON (i.id)
      to_jsonb(i) AS item,
      img.original_path AS "originalPath",
      img.thumb_path AS "thumbPath",
      GREATEST(i.updated_at, c.updated_at, img.updated_at) AS "updatedAt"
    FROM user_atlas_items i
    JOIN user_atlas_cards c
      ON c.item_id = i.id
     AND c.user_id = ${userId}::uuid
     AND c.deleted_at IS NULL
    JOIN user_atlas_images img
      ON img.id = i.image_id
     AND img.user_id = ${userId}::uuid
     AND img.deleted_at IS NULL
    WHERE i.user_id = ${userId}::uuid
      AND i.target_language = ${targetLanguage}
      AND i.deleted_at IS NULL
    ORDER BY i.id, GREATEST(i.updated_at, c.updated_at, img.updated_at) DESC
  `;
}

export async function atlasStudyStats(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
  /** Items locked for being over the slot cap; required, see fetchAtlasDue. */
  excludeItemIds: readonly string[],
  /** Whose midnight `todayNew` rolls over at — lib/timezone.ts. */
  tz = "Asia/Taipei",
): Promise<{
  total: number;
  seen: number;
  due: number;
  new: number;
  todayNew: number;
  byStatus: Array<{ status: Status; c: number }>;
}> {
  const sql = requireSql();
  const excluded = excludeItemIds.length
    ? sql`AND NOT (i.id = ANY(${[...excludeItemIds]}::uuid[]))`
    : sql``;
  // Counts are per ITEM, not per card. An item makes two cards (image_recall +
  // flashcard) but the study flow dedupes to one card per item, so card-level
  // counts double the numbers the queue actually serves. `seen`/studied keys off
  // last_reviewed_at, which is equivalent to "has a non-新卡 card" — the same
  // signal fetchAtlasDue uses to drop an item from the new pool, so `new`
  // (= total - seen) matches the new queue and `due` matches the review queue.
  const [totalRows, seenRows, dueRows, todayRows, byStatus] = await Promise.all([
    sql<{ total: number }[]>`
      SELECT count(DISTINCT i.id)::int AS total
      FROM user_atlas_items i
      JOIN user_atlas_cards c
        ON c.item_id = i.id AND c.user_id = ${userId}::uuid AND c.deleted_at IS NULL
      WHERE i.user_id = ${userId}::uuid
        AND i.deleted_at IS NULL
        AND i.target_language = ${targetLanguage}
        ${excluded}
    `,
    sql<{ seen: number }[]>`
      SELECT count(DISTINCT i.id)::int AS seen
      FROM user_atlas_items i
      JOIN user_atlas_cards c
        ON c.item_id = i.id AND c.user_id = ${userId}::uuid AND c.deleted_at IS NULL
      JOIN user_atlas_card_state s
        ON s.card_id = c.id AND s.user_id = ${userId}::uuid
      WHERE i.user_id = ${userId}::uuid
        AND i.deleted_at IS NULL
        AND i.target_language = ${targetLanguage}
        ${excluded}
        AND s.last_reviewed_at IS NOT NULL
    `,
    sql<{ due: number }[]>`
      SELECT count(DISTINCT i.id)::int AS due
      FROM user_atlas_items i
      JOIN user_atlas_cards c
        ON c.item_id = i.id AND c.user_id = ${userId}::uuid AND c.deleted_at IS NULL
      JOIN user_atlas_card_state s
        ON s.card_id = c.id AND s.user_id = ${userId}::uuid
      WHERE i.user_id = ${userId}::uuid
        AND i.deleted_at IS NULL
        AND i.target_language = ${targetLanguage}
        ${excluded}
        AND s.status <> '新卡'
        AND s.next_review_at <= now()
    `,
    sql<{ todayNew: number }[]>`
      SELECT count(DISTINCT i.id)::int AS "todayNew"
      FROM user_atlas_items i
      JOIN user_atlas_cards c
        ON c.item_id = i.id AND c.user_id = ${userId}::uuid AND c.deleted_at IS NULL
      JOIN user_atlas_card_state s
        ON s.card_id = c.id AND s.user_id = ${userId}::uuid
      WHERE i.user_id = ${userId}::uuid
        AND i.deleted_at IS NULL
        AND i.target_language = ${targetLanguage}
        ${excluded}
        AND s.last_reviewed_at IS NOT NULL
        AND (s.last_reviewed_at AT TIME ZONE ${tz})::date
          = (now() AT TIME ZONE ${tz})::date
    `,
    // One representative status per item — the card the queue would surface
    // (prefer an in-progress card over a leftover 新卡, then soonest due).
    sql<{ status: Status; c: number }[]>`
      SELECT rep.status, count(*)::int AS c
      FROM (
        SELECT DISTINCT ON (i.id) i.id, s.status
        FROM user_atlas_items i
        JOIN user_atlas_cards c
          ON c.item_id = i.id AND c.user_id = ${userId}::uuid AND c.deleted_at IS NULL
        LEFT JOIN user_atlas_card_state s
          ON s.card_id = c.id AND s.user_id = ${userId}::uuid
        WHERE i.user_id = ${userId}::uuid
          AND i.deleted_at IS NULL
          AND i.target_language = ${targetLanguage}
          ${excluded}
        ORDER BY i.id,
          CASE WHEN s.status IS NULL OR s.status = '新卡' THEN 1 ELSE 0 END,
          s.next_review_at ASC NULLS LAST
      ) rep
      GROUP BY rep.status
    `,
  ]);
  const total = totalRows[0]?.total ?? 0;
  const seen = seenRows[0]?.seen ?? 0;
  return {
    total,
    seen,
    due: dueRows[0]?.due ?? 0,
    new: Math.max(0, total - seen),
    todayNew: todayRows[0]?.todayNew ?? 0,
    byStatus: byStatus.filter((row) => row.status),
  };
}

export async function atlasCategoryProgress(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
  excludeItemIds: readonly string[],
): Promise<{ category: "custom"; total: number; seen: number } | null> {
  const stats = await atlasStudyStats(userId, targetLanguage, excludeItemIds);
  if (stats.total === 0) return null;
  return { category: "custom", total: stats.total, seen: stats.seen };
}

function rowToAtlasDueCard(r: Record<string, unknown>): AtlasDueCard {
  const card = {
    id: String(r.id),
    user_id: String(r.user_id),
    item_id: String(r.item_id),
    image_id: String(r.image_id),
    deck_key: r.deck_key as AtlasDeckKey,
    card_type: r.card_type as AtlasCardRow["card_type"],
    front_text: (r.front_text as string | null) ?? null,
    front_image_path: (r.front_image_path as string | null) ?? null,
    back: String(r.back),
    explanation: (r.explanation as string | null) ?? null,
    tags: (r.tags as string[]) ?? [],
    metadata: r.metadata,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    deleted_at: (r.deleted_at as string | null) ?? null,
  };
  const item = {
    id: String(r.i_id),
    user_id: String(r.i_user_id),
    image_id: String(r.i_image_id),
    selected_candidate_id: (r.i_selected_candidate_id as string | null) ?? null,
    target_language: r.i_target_language as AtlasTargetLanguage,
    canonical_word_id: (r.i_canonical_word_id as string | null) ?? null,
    primary_label: String(r.i_primary_label),
    fine_label: (r.i_fine_label as string | null) ?? null,
    lemma: String(r.i_lemma),
    display_zh_hant: String(r.i_display_zh_hant),
    display_ja: (r.i_display_ja as string | null) ?? null,
    display_en: (r.i_display_en as string | null) ?? null,
    part_of_speech: (r.i_part_of_speech as string | null) ?? null,
    cefr_level: (r.i_cefr_level as string | null) ?? null,
    pronunciation: (r.i_pronunciation as string | null) ?? null,
    reading: (r.i_reading as string | null) ?? null,
    reading_segments: (r.i_reading_segments as FuriganaSegment[] | null) ?? null,
    category: (r.i_category as string | null) ?? null,
    taxonomy_path: (r.i_taxonomy_path as string[]) ?? [],
    definition_zh_hant: (r.i_definition_zh_hant as string | null) ?? null,
    definition_ja: (r.i_definition_ja as string | null) ?? null,
    definition_en: (r.i_definition_en as string | null) ?? null,
    definition_target: (r.i_definition_target as string | null) ?? null,
    example_target: (r.i_example_target as string | null) ?? null,
    example_zh_hant: (r.i_example_zh_hant as string | null) ?? null,
    note_zh_hant: (r.i_note_zh_hant as string | null) ?? null,
    correction_source: r.i_correction_source as AtlasItemRow["correction_source"],
    backfill_status: r.i_backfill_status as AtlasItemRow["backfill_status"],
    backfill_error: (r.i_backfill_error as string | null) ?? null,
    visibility: r.i_visibility as AtlasItemRow["visibility"],
    review_status: r.i_review_status as AtlasItemRow["review_status"],
    published_at: (r.i_published_at as string | null) ?? null,
    public_slug: (r.i_public_slug as string | null) ?? null,
    share_image_path: (r.i_share_image_path as string | null) ?? null,
    cdn_cache_key: (r.i_cdn_cache_key as string | null) ?? null,
    created_at: String(r.i_created_at),
    updated_at: String(r.i_updated_at),
    deleted_at: (r.i_deleted_at as string | null) ?? null,
  };
  const image = {
    id: String(r.img_id),
    user_id: String(r.img_user_id),
    status: r.img_status as AtlasImageRow["status"],
    bucket: String(r.img_bucket),
    original_path: String(r.img_original_path),
    thumb_path: String(r.img_thumb_path),
    recognition_path: String(r.img_recognition_path),
    mime_type: String(r.img_mime_type),
    byte_size: Number(r.img_byte_size),
    width: r.img_width == null ? null : Number(r.img_width),
    height: r.img_height == null ? null : Number(r.img_height),
    sha256: String(r.img_sha256),
    perceptual_hash: (r.img_perceptual_hash as string | null) ?? null,
    failure_reason: (r.img_failure_reason as string | null) ?? null,
    created_at: String(r.img_created_at),
    updated_at: String(r.img_updated_at),
    deleted_at: (r.img_deleted_at as string | null) ?? null,
  };
  const state =
    r.s_status == null
      ? null
      : {
          user_id: String(r.user_id),
          card_id: String(r.id),
          status: r.s_status as Status,
          interval_days: Number(r.s_interval_days),
          next_review_at: String(r.s_next_review_at),
          review_count: Number(r.s_review_count),
          mistake_count: Number(r.s_mistake_count),
          last_rating: (r.s_last_rating as Rating | null) ?? null,
          last_reviewed_at: (r.s_last_reviewed_at as string | null) ?? null,
          created_at: String(r.s_created_at),
          updated_at: String(r.s_updated_at),
        };
  return { card, item, image, state, mastery: Number(r.mastery) || 0 };
}

export async function getAtlasDueCardById(
  userId: string,
  cardId: string,
): Promise<AtlasDueCard | null> {
  const sql = requireSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      c.*,
      s.status AS s_status,
      s.interval_days AS s_interval_days,
      s.next_review_at AS s_next_review_at,
      s.review_count AS s_review_count,
      s.mistake_count AS s_mistake_count,
      s.last_rating AS s_last_rating,
      s.last_reviewed_at AS s_last_reviewed_at,
      s.created_at AS s_created_at,
      s.updated_at AS s_updated_at,
      i.id AS i_id,
      i.user_id AS i_user_id,
      i.image_id AS i_image_id,
      i.selected_candidate_id AS i_selected_candidate_id,
      i.target_language AS i_target_language,
      i.canonical_word_id AS i_canonical_word_id,
      i.primary_label AS i_primary_label,
      i.fine_label AS i_fine_label,
      i.lemma AS i_lemma,
      i.display_zh_hant AS i_display_zh_hant,
      i.display_ja AS i_display_ja,
      i.display_en AS i_display_en,
      i.part_of_speech AS i_part_of_speech,
      i.cefr_level AS i_cefr_level,
      i.pronunciation AS i_pronunciation,
      i.reading AS i_reading,
      i.reading_segments AS i_reading_segments,
      i.category AS i_category,
      i.taxonomy_path AS i_taxonomy_path,
      i.definition_zh_hant AS i_definition_zh_hant,
      i.definition_ja AS i_definition_ja,
      i.definition_en AS i_definition_en,
      i.definition_target AS i_definition_target,
      i.example_target AS i_example_target,
      i.example_zh_hant AS i_example_zh_hant,
      i.note_zh_hant AS i_note_zh_hant,
      i.correction_source AS i_correction_source,
      i.backfill_status AS i_backfill_status,
      i.backfill_error AS i_backfill_error,
      i.visibility AS i_visibility,
      i.review_status AS i_review_status,
      i.published_at AS i_published_at,
      i.public_slug AS i_public_slug,
      i.share_image_path AS i_share_image_path,
      i.cdn_cache_key AS i_cdn_cache_key,
      i.created_at AS i_created_at,
      i.updated_at AS i_updated_at,
      i.deleted_at AS i_deleted_at,
      img.id AS img_id,
      img.user_id AS img_user_id,
      img.status AS img_status,
      img.bucket AS img_bucket,
      img.original_path AS img_original_path,
      img.thumb_path AS img_thumb_path,
      img.recognition_path AS img_recognition_path,
      img.mime_type AS img_mime_type,
      img.byte_size AS img_byte_size,
      img.width AS img_width,
      img.height AS img_height,
      img.sha256 AS img_sha256,
      img.perceptual_hash AS img_perceptual_hash,
      img.failure_reason AS img_failure_reason,
      img.created_at AS img_created_at,
      img.updated_at AS img_updated_at,
      img.deleted_at AS img_deleted_at,
      COALESCE(m.mastery::float8, 0) AS mastery
    FROM user_atlas_cards c
    JOIN user_atlas_items i ON i.id = c.item_id AND i.user_id = ${userId}::uuid
    JOIN user_atlas_images img ON img.id = c.image_id AND img.user_id = ${userId}::uuid
    LEFT JOIN user_atlas_card_state s
      ON s.card_id = c.id AND s.user_id = ${userId}::uuid
    LEFT JOIN user_atlas_item_mastery m
      ON m.item_id = i.id
     AND m.user_id = ${userId}::uuid
     AND m.target_language = i.target_language
    WHERE c.user_id = ${userId}::uuid
      AND c.id = ${cardId}::uuid
      AND c.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND img.deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ? rowToAtlasDueCard(rows[0]) : null;
}

export interface AtlasMasteryScheduleRow {
  item_id: string;
  mastery: number;
  last_reviewed_at: string | null;
  // Soonest next_review_at across the item's atlas cards, or null if none are
  // scheduled yet. SRS state is per-card; mastery is per-item.
  next_review_at: string | null;
}

// Per-item atlas mastery + the item's soonest next-due review time (MIN over
// its cards), for the iOS 圖鑑 grid where custom 自制圖鑑 words render as
// `atlas:<itemId>`. Mirrors getAllMasteryWithSchedule for dictionary words so
// /api/users/mastery can fold both namespaces into one map.
export async function getAllAtlasMasteryWithSchedule(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
): Promise<AtlasMasteryScheduleRow[]> {
  const sql = requireSql();
  return sql<AtlasMasteryScheduleRow[]>`
    SELECT
      m.item_id,
      m.mastery::float8 AS mastery,
      m.last_reviewed_at,
      (
        SELECT MIN(s.next_review_at)
        FROM user_atlas_cards c
        JOIN user_atlas_card_state s
          ON s.card_id = c.id AND s.user_id = ${userId}::uuid
        WHERE c.item_id = m.item_id
          AND c.user_id = ${userId}::uuid
          AND c.deleted_at IS NULL
      ) AS next_review_at
    FROM user_atlas_item_mastery m
    JOIN user_atlas_items i
      ON i.id = m.item_id AND i.user_id = ${userId}::uuid
    WHERE m.user_id = ${userId}::uuid
      AND m.target_language = ${targetLanguage}
      AND i.deleted_at IS NULL
  `;
}

export async function getAtlasMastery(
  userId: string,
  itemId: string,
  targetLanguage: AtlasTargetLanguage,
): Promise<AtlasMasteryRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasMasteryRow[]>`
    SELECT item_id, user_id, target_language, mastery::float8 AS mastery,
           last_reviewed_at, review_count, updated_at
    FROM user_atlas_item_mastery
    WHERE user_id = ${userId}::uuid
      AND item_id = ${itemId}::uuid
      AND target_language = ${targetLanguage}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertAtlasReview(
  userId: string,
  cardId: string,
  next: {
    status: Status;
    intervalDays: number;
    nextReviewAt: Date;
    rating: Rating;
  },
  isMistake: boolean,
): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_atlas_card_state (
      user_id, card_id, status, interval_days, next_review_at,
      review_count, mistake_count, last_rating, last_reviewed_at, updated_at
    )
    VALUES (
      ${userId}::uuid, ${cardId}::uuid, ${next.status}, ${next.intervalDays},
      ${next.nextReviewAt.toISOString()}, 1, ${isMistake ? 1 : 0},
      ${next.rating}, now(), now()
    )
    ON CONFLICT (user_id, card_id) DO UPDATE SET
      status = EXCLUDED.status,
      interval_days = EXCLUDED.interval_days,
      next_review_at = EXCLUDED.next_review_at,
      review_count = user_atlas_card_state.review_count + 1,
      mistake_count = user_atlas_card_state.mistake_count + ${isMistake ? 1 : 0},
      last_rating = EXCLUDED.last_rating,
      last_reviewed_at = now(),
      updated_at = now()
  `;
}

export async function upsertAtlasMastery(
  userId: string,
  itemId: string,
  targetLanguage: AtlasTargetLanguage,
  mastery: number,
): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_atlas_item_mastery (
      user_id, item_id, target_language, mastery, last_reviewed_at, review_count, updated_at
    )
    VALUES (
      ${userId}::uuid, ${itemId}::uuid, ${targetLanguage}, ${mastery}, now(), 1, now()
    )
    ON CONFLICT (user_id, item_id, target_language) DO UPDATE SET
      mastery = EXCLUDED.mastery,
      last_reviewed_at = EXCLUDED.last_reviewed_at,
      review_count = user_atlas_item_mastery.review_count + 1,
      updated_at = now()
  `;
}

export async function insertAtlasStudyLog(input: {
  userId: string;
  itemId: string;
  cardId: string;
  imageId: string;
  targetLanguage: AtlasTargetLanguage;
  activity: string;
  rating: 0 | 1 | 2 | 3;
  isCorrect: boolean;
  responseMs: number | null;
  intervalBefore: number | null;
  intervalAfter: number | null;
  masteryBefore: number | null;
  masteryAfter: number | null;
  clientSessionId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_atlas_study_logs (
      user_id, item_id, card_id, image_id, target_language, activity, rating,
      is_correct, response_ms, interval_before, interval_after,
      mastery_before, mastery_after, client_session_id, metadata
    )
    VALUES (
      ${input.userId}::uuid,
      ${input.itemId}::uuid,
      ${input.cardId}::uuid,
      ${input.imageId}::uuid,
      ${input.targetLanguage},
      ${input.activity},
      ${input.rating},
      ${input.isCorrect},
      ${input.responseMs},
      ${input.intervalBefore},
      ${input.intervalAfter},
      ${input.masteryBefore},
      ${input.masteryAfter},
      ${input.clientSessionId},
      ${sql.json(input.metadata ?? {})}
    )
  `;
}

export interface AtlasStorageCleanupPaths {
  privatePaths: string[];
  publicPaths: string[];
}

export async function getAtlasStoragePathsForUser(
  userId: string,
): Promise<AtlasStorageCleanupPaths> {
  const sql = requireSql();
  const privateRows = await sql<{ original_path: string; thumb_path: string; recognition_path: string }[]>`
    SELECT original_path, thumb_path, recognition_path
    FROM user_atlas_images
    WHERE user_id = ${userId}::uuid
  `;
  const publicRows = await sql<{ image_public_path: string | null }[]>`
    SELECT image_public_path
    FROM atlas_public_items
    WHERE owner_user_id = ${userId}::uuid
      AND image_public_path IS NOT NULL
  `;
  const collectionAvatarRows = await sql<{ avatar_private_path: string | null }[]>`
    SELECT avatar_private_path
    FROM atlas_collections
    WHERE owner_user_id = ${userId}::uuid
      AND avatar_private_path IS NOT NULL
  `;
  const collectionAvatarPaths = collectionAvatarRows
    .map((row) => row.avatar_private_path)
    .filter((path): path is string => Boolean(path));
  return {
    privatePaths: privateRows.flatMap((row) => [
      row.original_path,
      row.thumb_path,
      row.recognition_path,
    ]).concat(
      collectionAvatarPaths.filter((path) => !path.startsWith("collections/")),
    ),
    publicPaths: publicRows
      .map((row) => row.image_public_path)
      .filter((path): path is string => Boolean(path))
      .concat(collectionAvatarPaths.filter((path) => path.startsWith("collections/"))),
  };
}

export async function deleteAtlasImageCascade(
  userId: string,
  imageId: string,
): Promise<AtlasStorageCleanupPaths | null> {
  const sql = requireSql();
  const imageRows = await sql<{
    original_path: string;
    thumb_path: string;
    recognition_path: string;
  }[]>`
    SELECT original_path, thumb_path, recognition_path
    FROM user_atlas_images
    WHERE user_id = ${userId}::uuid
      AND id = ${imageId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const image = imageRows[0];
  if (!image) return null;

  const publicRows = await sql<{ image_public_path: string | null }[]>`
    SELECT p.image_public_path
    FROM atlas_public_items p
    JOIN user_atlas_items i
      ON i.id = p.source_item_id
     AND i.user_id = ${userId}::uuid
     AND i.image_id = ${imageId}::uuid
    WHERE p.owner_user_id = ${userId}::uuid
      AND p.image_public_path IS NOT NULL
  `;

  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM user_atlas_study_logs
      WHERE user_id = ${userId}::uuid
        AND image_id = ${imageId}::uuid
    `;
    await tx`
      DELETE FROM user_atlas_images
      WHERE user_id = ${userId}::uuid
        AND id = ${imageId}::uuid
    `;
  });

  return {
    privatePaths: [image.original_path, image.thumb_path, image.recognition_path],
    publicPaths: publicRows
      .map((row) => row.image_public_path)
      .filter((path): path is string => Boolean(path)),
  };
}

export async function deleteAtlasItemCascade(
  userId: string,
  itemId: string,
): Promise<AtlasStorageCleanupPaths | null> {
  const sql = requireSql();
  const rows = await sql<{ image_id: string }[]>`
    SELECT image_id
    FROM user_atlas_items
    WHERE user_id = ${userId}::uuid
      AND id = ${itemId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const item = rows[0];
  if (!item) return null;
  return deleteAtlasImageCascade(userId, item.image_id);
}

export async function cleanupOldAtlasRawResponses(retentionDays = 30): Promise<number> {
  const sql = requireSql();
  const days = Math.min(365, Math.max(1, Math.floor(retentionDays)));
  const rows = await sql<{ cleaned: number }[]>`
    WITH cleaned AS (
      UPDATE user_atlas_recognition_jobs
      SET raw_response = NULL,
          updated_at = now()
      WHERE raw_response IS NOT NULL
        AND COALESCE(finished_at, updated_at, created_at) < now() - (${days}::text || ' days')::interval
      RETURNING id
    )
    SELECT count(*)::int AS cleaned
    FROM cleaned
  `;
  return Number(rows[0]?.cleaned ?? 0);
}

/**
 * Admin review queue. The default filter is `pending_review` — items the
 * machine gate flagged for a human. Legacy `pending` rows (submitted before the
 * gate existed) are folded into that same filter so nothing gets stranded.
 */
export async function listAtlasReviewItems(
  status: "pending_review" | "approved" | "rejected" | "takedown" | "" = "pending_review",
  limit = 100,
): Promise<(AtlasItemRow & { username: string | null; thumb_path: string | null })[]> {
  const sql = requireSql();
  const legacyPending = status === "pending_review";
  return sql<(AtlasItemRow & { username: string | null; thumb_path: string | null })[]>`
    SELECT i.*, p.username, img.thumb_path
    FROM user_atlas_items i
    LEFT JOIN profiles p ON p.id = i.user_id
    LEFT JOIN user_atlas_images img ON img.id = i.image_id
    WHERE i.deleted_at IS NULL
      AND (
        ${status} = ''
        OR i.review_status = ${status}
        OR (${legacyPending} AND i.review_status IN ('pending','pending_auto'))
      )
      AND i.review_status <> 'draft'
    ORDER BY
      CASE i.review_status
        WHEN 'pending_review' THEN 0
        WHEN 'pending' THEN 0
        WHEN 'pending_auto' THEN 0
        ELSE 1
      END,
      i.updated_at DESC
    LIMIT ${Math.min(200, Math.max(1, Math.floor(limit)))}
  `;
}

export interface AtlasSyncBundle {
  serverTime: string;
  images: AtlasImageRow[];
  items: AtlasItemRow[];
  cards: AtlasCardRow[];
  cardStates: AtlasCardStateRow[];
  mastery: AtlasMasteryRow[];
}

function syncSinceClause(since: Date | null): string | null {
  return since ? since.toISOString() : null;
}

export async function getAtlasSyncBundle(
  userId: string,
  since: Date | null,
  limit = 500,
): Promise<AtlasSyncBundle> {
  const sql = requireSql();
  const maxRows = Math.min(1000, Math.max(1, Math.floor(limit)));
  const sinceIso = syncSinceClause(since);
  const [images, items, cards, cardStates, mastery, nowRows] = await Promise.all([
    sql<AtlasImageRow[]>`
      SELECT *
      FROM user_atlas_images
      WHERE user_id = ${userId}::uuid
        AND (${sinceIso}::timestamptz IS NULL OR updated_at > ${sinceIso}::timestamptz)
      ORDER BY updated_at ASC
      LIMIT ${maxRows}
    `,
    sql<AtlasItemRow[]>`
      SELECT *
      FROM user_atlas_items
      WHERE user_id = ${userId}::uuid
        AND (${sinceIso}::timestamptz IS NULL OR updated_at > ${sinceIso}::timestamptz)
      ORDER BY updated_at ASC
      LIMIT ${maxRows}
    `,
    sql<AtlasCardRow[]>`
      SELECT *
      FROM user_atlas_cards
      WHERE user_id = ${userId}::uuid
        AND (${sinceIso}::timestamptz IS NULL OR updated_at > ${sinceIso}::timestamptz)
      ORDER BY updated_at ASC
      LIMIT ${maxRows}
    `,
    sql<AtlasCardStateRow[]>`
      SELECT user_id, card_id, status, interval_days::float8 AS interval_days,
             next_review_at, review_count, mistake_count, last_rating,
             last_reviewed_at, created_at, updated_at
      FROM user_atlas_card_state
      WHERE user_id = ${userId}::uuid
        AND (${sinceIso}::timestamptz IS NULL OR updated_at > ${sinceIso}::timestamptz)
      ORDER BY updated_at ASC
      LIMIT ${maxRows}
    `,
    sql<AtlasMasteryRow[]>`
      SELECT user_id, item_id, target_language, mastery::float8 AS mastery,
             last_reviewed_at, review_count, updated_at
      FROM user_atlas_item_mastery
      WHERE user_id = ${userId}::uuid
        AND (${sinceIso}::timestamptz IS NULL OR updated_at > ${sinceIso}::timestamptz)
      ORDER BY updated_at ASC
      LIMIT ${maxRows}
    `,
    sql<{ now: string }[]>`SELECT now()::text AS now`,
  ]);

  return {
    serverTime: nowRows[0]?.now ?? new Date().toISOString(),
    images,
    items,
    cards,
    cardStates,
    mastery,
  };
}

export async function getAtlasReviewItem(itemId: string): Promise<AtlasItemRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasItemRow[]>`
    SELECT *
    FROM user_atlas_items
    WHERE id = ${itemId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// MARK: - 景點 (lib/travel/spot-tagging.ts)

/** 「大家拍的」: approved cards their owners shared to this spot, newest first. */
export async function listAtlasPublicItemsAtSpot(
  spotId: string,
  limit = 24,
): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.spot_id = ${spotId}
      AND pi.review_status = 'approved'
    ORDER BY pi.published_at DESC
    LIMIT ${Math.min(60, Math.max(1, Math.floor(limit)))}
  `;
}

/**
 * Item columns + the author's identity, joined live from `profiles`.
 *
 * Live rather than snapshotted on purpose: an author who renames must rename
 * across everything they ever published, or the community sees one person as
 * several. `publicAuthor()` decides what of this is allowed out — this
 * fragment only carries the raw columns.
 *
 * Requires the item table to be aliased `pi`.
 */
const publicItemWithAuthorSelect = (sql: ReturnType<typeof requireSql>) => sql`
  pi.*,
  pr.username                   AS author_username,
  pr.nickname                   AS author_nickname,
  pr.avatar                     AS author_avatar
`;

export async function listAtlasPublicItems(limit = 60): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.review_status = 'approved'
    ORDER BY pi.published_at DESC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;
}

/**
 * Community aggregation for the word detail page: every approved public item
 * teaching the same lemma in the same target language (docs/COMMUNITY_ATLAS_PLAN.md
 * §1 原則 2 — aggregate by word, not by individual photo).
 *
 * Lemma match is case-insensitive; the supporting index is on lower(lemma).
 */
export async function listAtlasPublicItemsByLemma(
  lemma: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 24,
): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  const trimmed = lemma.trim();
  if (!trimmed) return [];
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE lower(pi.lemma) = lower(${trimmed})
      AND pi.target_language = ${targetLanguage}
      AND pi.review_status = 'approved'
    ORDER BY pi.published_at DESC
    LIMIT ${Math.min(60, Math.max(1, Math.floor(limit)))}
  `;
}

// Publishing, withdrawing, reports and moderation: lib/atlas/publication.ts.

// MARK: - Author profiles (community identity)

export interface AtlasAuthorRow {
  user_id: string;
  username: string;
  nickname: string | null;
  avatar: string;
  /** Author-written self-introduction, already text-gated on write. */
  bio: string | null;
  joined_at: string;
  published_count: number;
  /** Total saves across this author's public items and public collections. */
  save_count: number;
}

/**
 * Public author profile: identity plus the aggregate feedback signals
 * (docs/COMMUNITY_ATLAS_PLAN.md §3C). Counts only approved items — a takedown
 * must not keep inflating an author's numbers.
 *
 * 公開卡片 counts what a reader can actually reach: approved items that sit in at
 * least one approved collection, every language together. A public card outside
 * any collection never shows in 探索, and counting it read as 「公開卡片 17」 over
 * seven cards anyone could find. `listAtlasAuthorItems` lists the same set, and
 * 被收藏 counts saves on that set plus saves on approved collections.
 *
 * Returns null for unknown usernames and for authors with nothing public, so
 * the endpoint can't be used to enumerate accounts. Also null when the account
 * never confirmed a public identity: without consent there is no author to
 * show, and answering would turn this route into a handle oracle.
 */
export async function getAtlasAuthor(username: string): Promise<AtlasAuthorRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasAuthorRow[]>`
    SELECT
      pr.id                              AS user_id,
      pr.username,
      pr.nickname,
      pr.avatar,
      pr.bio,
      pr.created_at                      AS joined_at,
      count(DISTINCT p.id)::int          AS published_count,
      (
        SELECT count(*)::int
        FROM atlas_saves item_saves
        JOIN atlas_public_items saved_item
          ON saved_item.id = item_saves.public_item_id
        WHERE saved_item.owner_user_id = pr.id
          AND saved_item.review_status = 'approved'
          -- Same set as 公開卡片: saves on a card no reader can reach don't count.
          AND EXISTS (
            SELECT 1 FROM atlas_collection_items ci
            JOIN atlas_collections c ON c.id = ci.collection_id
            WHERE ci.public_item_id = saved_item.id
              AND c.review_status = 'approved'
          )
      ) + (
        SELECT count(*)::int
        FROM atlas_collection_saves collection_saves
        JOIN atlas_collections saved_collection
          ON saved_collection.id = collection_saves.collection_id
        WHERE saved_collection.owner_user_id = pr.id
          AND saved_collection.review_status = 'approved'
      )                                  AS save_count
    FROM profiles pr
    LEFT JOIN atlas_public_items p
      ON p.owner_user_id = pr.id
     AND p.review_status = 'approved'
     AND EXISTS (
       SELECT 1 FROM atlas_collection_items ci
       JOIN atlas_collections c ON c.id = ci.collection_id
       WHERE ci.public_item_id = p.id
         AND c.review_status = 'approved'
     )
    WHERE pr.username = ${username}
    GROUP BY pr.id, pr.username, pr.nickname, pr.avatar, pr.bio, pr.created_at
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * An author's approved public items, newest first.
 *
 * The cap is 300 because that is the Pro 自製圖鑑 capacity, and a published item
 * cannot outlive its custom one (deleting a 自製圖鑑 item cascades the public row
 * — see `deleteAtlasImageCascade`). So published ≤ live custom items ≤ 300, and
 * the limit is unreachable rather than merely generous. That matters on the
 * profile: the header's `published_count` is an unbounded `count(*)`, so any
 * truncation here would put "公開 200" over a grid of 60 — and the client groups
 * these by language, which would silently eat whichever language is older.
 *
 * If capacity ever rises above 300, this needs real pagination, not a bigger
 * number.
 */
export async function listAtlasAuthorItems(
  userId: string,
  limit = 300,
): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.owner_user_id = ${userId}::uuid
      AND pi.review_status = 'approved'
      -- The set 公開卡片 counts (see getAtlasAuthor): in an approved collection.
      AND EXISTS (
        SELECT 1 FROM atlas_collection_items ci
        JOIN atlas_collections c ON c.id = ci.collection_id
        WHERE ci.public_item_id = pi.id
          AND c.review_status = 'approved'
      )
    ORDER BY pi.published_at DESC
    LIMIT ${Math.min(300, Math.max(1, Math.floor(limit)))}
  `;
}

// MARK: - Saves (consumption quota)
//
// Saving someone else's public item is the CONSUMPTION side of the quota split
// (docs/COMMUNITY_ATLAS_PLAN.md §4.1). These rows live in atlas_saves and are
// never written to user_atlas_items, so they cannot consume the creation slots
// that getAtlasUsage() counts.

/** The two virtual cards every saved public item yields. */
export const ATLAS_SAVED_CARD_TYPES = ["image_recall", "flashcard"] as const;

/**
 * Idempotent: saving twice is a no-op, not an error.
 *
 * Also materialises the item's SRS rows so it enters the review queue right
 * away. They carry their own UUIDs, which is what lets the existing answer
 * endpoint address a saved card.
 */
export async function saveAtlasPublicItem(
  userId: string,
  publicItemId: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO atlas_saves (user_id, public_item_id)
    VALUES (${userId}::uuid, ${publicItemId}::uuid)
    ON CONFLICT (user_id, public_item_id) DO NOTHING
  `;
  for (const cardType of ATLAS_SAVED_CARD_TYPES) {
    await sql`
      INSERT INTO atlas_saved_cards (user_id, public_item_id, card_type)
      VALUES (${userId}::uuid, ${publicItemId}::uuid, ${cardType})
      ON CONFLICT (user_id, public_item_id, card_type) DO NOTHING
    `;
  }
}

/** Removes the save and its review progress. */
export async function unsaveAtlasPublicItem(
  userId: string,
  publicItemId: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    DELETE FROM atlas_saved_cards
    WHERE user_id = ${userId}::uuid
      AND public_item_id = ${publicItemId}::uuid
  `;
  await sql`
    DELETE FROM atlas_saves
    WHERE user_id = ${userId}::uuid
      AND public_item_id = ${publicItemId}::uuid
  `;
}

export async function isAtlasPublicItemSaved(
  userId: string,
  publicItemId: string,
): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one
    FROM atlas_saves
    WHERE user_id = ${userId}::uuid
      AND public_item_id = ${publicItemId}::uuid
    LIMIT 1
  `;
  return rows.length > 0;
}

// MARK: - Saved community deck (SRS)
//
// Mirrors fetchAtlasDue's new/review split so the community deck behaves like
// the rest of the app, but reads from atlas_saved_cards joined to the public
// item. Images come from the public bucket, so no signed URLs are needed.

export interface AtlasSavedDueCard {
  id: string;
  card_type: string;
  public_item_id: string;
  slug: string;
  lemma: string;
  display_zh_hant: string;
  target_language: AtlasTargetLanguage;
  image_public_path: string | null;
  status: string;
  interval_days: number;
  next_review_at: string;
  review_count: number;
  mistake_count: number;
  mastery: number;
}

export async function fetchSavedCommunityDue(
  userId: string,
  limit = 20,
  mode: "new" | "review" | "both" = "both",
  targetLanguage: AtlasTargetLanguage | null = null,
): Promise<AtlasSavedDueCard[]> {
  const sql = requireSql();
  const includeNew = mode === "new" || mode === "both";
  const includeReview = mode === "review" || mode === "both";
  return sql<AtlasSavedDueCard[]>`
    SELECT
      sc.id,
      sc.card_type,
      sc.public_item_id,
      p.public_slug         AS slug,
      p.lemma,
      p.display_zh_hant,
      p.target_language,
      p.image_public_path,
      sc.status,
      sc.interval_days::float8 AS interval_days,
      sc.next_review_at,
      sc.review_count,
      sc.mistake_count,
      sc.mastery::float8    AS mastery
    FROM atlas_saved_cards sc
    JOIN atlas_public_items p ON p.id = sc.public_item_id
    WHERE sc.user_id = ${userId}::uuid
      -- A taken-down item must stop appearing in study immediately.
      AND p.review_status = 'approved'
      ${targetLanguage ? sql`AND p.target_language = ${targetLanguage}` : sql``}
      AND (
        -- New: dedupe to one card per item, same rule as fetchAtlasDue —
        -- otherwise the sibling card resurfaces the same word.
        (${includeNew} AND sc.status = '新卡'
          AND NOT EXISTS (
            SELECT 1 FROM atlas_saved_cards sc2
            WHERE sc2.user_id = sc.user_id
              AND sc2.public_item_id = sc.public_item_id
              AND sc2.status <> '新卡'
          ))
        OR (${includeReview} AND sc.status <> '新卡' AND sc.next_review_at <= now())
      )
    ORDER BY
      CASE WHEN sc.status = '新卡' THEN 1 ELSE 0 END,
      sc.next_review_at ASC,
      sc.created_at ASC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;
}

/** Single saved card for the answer path (ownership enforced by user_id). */
export async function getSavedCommunityCardById(
  userId: string,
  cardId: string,
): Promise<AtlasSavedDueCard | null> {
  const sql = requireSql();
  const rows = await sql<AtlasSavedDueCard[]>`
    SELECT
      sc.id, sc.card_type, sc.public_item_id,
      p.public_slug AS slug, p.lemma, p.display_zh_hant, p.target_language,
      p.image_public_path,
      sc.status, sc.interval_days::float8 AS interval_days, sc.next_review_at,
      sc.review_count, sc.mistake_count, sc.mastery::float8 AS mastery
    FROM atlas_saved_cards sc
    JOIN atlas_public_items p ON p.id = sc.public_item_id
    WHERE sc.id = ${cardId}::uuid
      AND sc.user_id = ${userId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function recordSavedCommunityReview(
  userId: string,
  cardId: string,
  next: {
    status: string;
    intervalDays: number;
    nextReviewAt: Date;
    rating: string;
    mastery: number;
  },
  isMistake: boolean,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE atlas_saved_cards
    SET status = ${next.status},
        interval_days = ${next.intervalDays},
        next_review_at = ${next.nextReviewAt},
        last_rating = ${next.rating},
        last_reviewed_at = now(),
        review_count = review_count + 1,
        mistake_count = mistake_count + ${isMistake ? 1 : 0},
        mastery = ${next.mastery},
        updated_at = now()
    WHERE id = ${cardId}::uuid
      AND user_id = ${userId}::uuid
  `;
}

/** Totals for the 社群圖鑑 theme's progress row. */
export async function savedCommunityStats(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
): Promise<{ total: number; seen: number }> {
  const sql = getSql();
  if (!sql) return { total: 0, seen: 0 };
  const rows = await sql<{ total: number; seen: number }[]>`
    SELECT
      count(DISTINCT sc.public_item_id)::int AS total,
      count(DISTINCT sc.public_item_id)
        FILTER (WHERE sc.status <> '新卡')::int AS seen
    FROM atlas_saved_cards sc
    JOIN atlas_public_items p ON p.id = sc.public_item_id
    WHERE sc.user_id = ${userId}::uuid
      AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage}
  `;
  return { total: rows[0]?.total ?? 0, seen: rows[0]?.seen ?? 0 };
}

/** "N people saved this" for a single public item. */
export async function countAtlasSaves(publicItemId: string): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM atlas_saves
    WHERE public_item_id = ${publicItemId}::uuid
  `;
  return rows[0]?.count ?? 0;
}

/** How many community items this user has saved (their consumption usage). */
export async function countAtlasSavesByUser(userId: string): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM atlas_saves
    WHERE user_id = ${userId}::uuid
  `;
  return rows[0]?.count ?? 0;
}

/**
 * The user's saved community items, newest first.
 *
 * Language-scoped like every other study surface, and approved-only: an item
 * the author withdrew simply stops appearing here, the same way it stops being
 * scheduled. Their `atlas_saved_cards` rows survive, so republishing restores
 * the entry with its review progress intact.
 */
/**
 * A saved public item plus the kana its source item carries.
 *
 * `atlas_public_items` is a publication snapshot of lemma + gloss and has no
 * reading column, so a saved Japanese word used to arrive on the consumer's
 * 圖鑑 with no kana at all — the same card taught the author more than the
 * person who saved it. The reading is not private (it is how the published
 * word is read), so it comes back over the join.
 */
export type AtlasSavedItemRow = AtlasPublicItemRow & {
  source_reading: string | null;
  source_reading_segments: FuriganaSegment[] | null;
  source_pronunciation: string | null;
  /** The author's public UID, so the client can apply its block list. */
  author_handle: string | null;
};

export async function listAtlasSavedItems(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 200,
): Promise<AtlasSavedItemRow[]> {
  const sql = requireSql();
  // LEFT JOIN: an item the author later deleted must not drop the word the
  // saver is still studying — it just loses the kana line.
  return sql<AtlasSavedItemRow[]>`
    SELECT p.*,
           i.reading          AS source_reading,
           i.reading_segments AS source_reading_segments,
           i.pronunciation AS source_pronunciation,
           pr.username        AS author_handle
    FROM atlas_saves s
    JOIN atlas_public_items p ON p.id = s.public_item_id
    LEFT JOIN user_atlas_items i ON i.id = p.source_item_id
    LEFT JOIN profiles pr ON pr.id = p.owner_user_id
    WHERE s.user_id = ${userId}::uuid
      AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage}
    ORDER BY s.created_at DESC
    LIMIT ${Math.min(300, Math.max(1, Math.floor(limit)))}
  `;
}

/**
 * 收進 cards picked for a 情境故事, by public slug.
 *
 * Narrower than the saved list on purpose: a card only comes back when this
 * person has saved it, it is still public (a takedown or the author's own
 * withdrawal drops it), and its author is not someone this person blocked.
 * Blocking leaves saved words in 圖鑑 (BlockStore on iOS), but a story is new
 * use of someone's work, so it is refused here rather than trusted to the
 * client's copy of the block list.
 */
export async function listStorySavedItems(
  userId: string,
  slugs: string[],
  targetLanguage: AtlasTargetLanguage,
): Promise<AtlasSavedItemRow[]> {
  if (!slugs.length) return [];
  const sql = requireSql();
  return sql<AtlasSavedItemRow[]>`
    SELECT p.*,
           i.reading          AS source_reading,
           i.reading_segments AS source_reading_segments,
           i.pronunciation AS source_pronunciation,
           NULL::text         AS author_handle
    FROM atlas_saves s
    JOIN atlas_public_items p ON p.id = s.public_item_id
    LEFT JOIN user_atlas_items i ON i.id = p.source_item_id
    WHERE s.user_id = ${userId}::uuid
      AND p.public_slug = ANY(${slugs})
      AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage}
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE b.blocker_user_id = ${userId}::uuid
          AND b.blocked_user_id = p.owner_user_id
      )
  `;
}

/**
 * Per-ITEM mastery for saved community items, keyed by public slug.
 *
 * `atlas_saved_cards` stores mastery per CARD and every item yields two
 * (image_recall + flashcard), so the 圖鑑 grid — which shows one badge per
 * item — needs them averaged. Averaged rather than maxed: practising only one
 * card type shouldn't read as having mastered the word.
 *
 * Aggregated at read time instead of in a `user_saved_item_mastery` table
 * because the card rows are already the single source of truth; a second copy
 * is a second thing to keep in sync.
 */
export async function getSavedCommunityMastery(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
): Promise<
  {
    slug: string;
    mastery: number;
    last_reviewed_at: string | null;
    next_review_at: string | null;
  }[]
> {
  const sql = requireSql();
  return sql<
    {
      slug: string;
      mastery: number;
      last_reviewed_at: string | null;
      next_review_at: string | null;
    }[]
  >`
    SELECT p.public_slug AS slug,
           avg(sc.mastery)::float8 AS mastery,
           max(sc.last_reviewed_at) AS last_reviewed_at,
           -- Soonest of the item's two cards, matching what the client means by
           -- "next review" everywhere else (see getAllAtlasMasteryWithSchedule).
           min(sc.next_review_at) AS next_review_at
    FROM atlas_saved_cards sc
    JOIN atlas_public_items p ON p.id = sc.public_item_id
    WHERE sc.user_id = ${userId}::uuid
      AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage}
    GROUP BY p.public_slug
  `;
}

/** Saved-community totals for the 進度 page: one category row's worth. */
export async function savedCommunityCategoryProgress(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
): Promise<{ total: number; seen: number }> {
  const sql = requireSql();
  const [row] = await sql<{ total: number; seen: number }[]>`
    SELECT count(DISTINCT p.id)::int AS total,
           count(DISTINCT p.id) FILTER (WHERE sc.review_count > 0)::int AS seen
    FROM atlas_saves s
    JOIN atlas_public_items p ON p.id = s.public_item_id
    LEFT JOIN atlas_saved_cards sc
      ON sc.public_item_id = p.id AND sc.user_id = ${userId}::uuid
    WHERE s.user_id = ${userId}::uuid
      AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage}
  `;
  return { total: row?.total ?? 0, seen: row?.seen ?? 0 };
}

export async function getAtlasPublicItem(
  slug: string,
): Promise<AtlasPublicItemWithAuthorRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.public_slug = ${slug}
      AND pi.review_status = 'approved'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Full source content behind an already-approved public item.
 *
 * Callers must resolve the public row first; this intentionally does not accept
 * a slug or perform its own publication check. It exists so the public detail
 * route can render the same stored learning content as the owner's atlas
 * without triggering another enrichment pass.
 */
export async function getAtlasPublicSourceItem(
  sourceItemId: string,
): Promise<AtlasItemRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasItemRow[]>`
    SELECT *
    FROM user_atlas_items
    WHERE id = ${sourceItemId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type AtlasReportReason = ReportReason;
export type AtlasReportStatus = "open" | "reviewed" | "dismissed";

/**
 * What a report points at. Everything publicly readable that a user did not
 * write themselves needs an out: the photo, the 合集 that curates it, and the
 * author identity (暱稱/簽名/頭像) attached to both.
 */
export type AtlasReportTarget = ReportTarget;

export interface AtlasReportRow {
  id: string;
  target_type: AtlasReportTarget;
  target_id: string | null;
  public_item_id: string | null;
  source_item_id: string | null;
  slug: string;
  reporter_user_id: string;
  reason: AtlasReportReason;
  detail: string | null;
  status: AtlasReportStatus;
  created_at: string;
  lemma: string | null;
  display_zh_hant: string | null;
  public_review_status: string | null;
  /** The author's own row. Differs from the public copy after an auto-hide. */
  item_review_status: string | null;
  collection_title: string | null;
  collection_slug: string | null;
  collection_review_status: string | null;
  author_handle: string | null;
}

/** Admin: list reports, newest first, optionally filtered by status. */
export async function listAtlasReports(
  status: AtlasReportStatus | "",
  limit = 200,
): Promise<AtlasReportRow[]> {
  const sql = requireSql();
  const capped = Math.min(500, Math.max(1, Math.floor(limit)));
  // One queue, three kinds of target, so each row has to name itself: the item's
  // lemma, the 合集's title, or the author's handle. Joined on target_id rather
  // than public_item_id — only item rows have the latter.
  if (status) {
    return sql<AtlasReportRow[]>`
      SELECT r.*, p.lemma, p.display_zh_hant, p.review_status AS public_review_status,
             ui.review_status AS item_review_status,
             c.title AS collection_title, c.slug AS collection_slug,
             c.review_status AS collection_review_status,
             pr.username AS author_handle
      FROM atlas_reports r
      LEFT JOIN atlas_public_items p ON p.id = r.public_item_id
      LEFT JOIN user_atlas_items ui ON ui.id = r.source_item_id
      LEFT JOIN atlas_collections c
        ON r.target_type = 'collection' AND c.id = r.target_id
      LEFT JOIN profiles pr
        ON r.target_type = 'author' AND pr.id = r.target_id
      WHERE r.status = ${status}
      ORDER BY r.created_at DESC
      LIMIT ${capped}
    `;
  }
  return sql<AtlasReportRow[]>`
    SELECT r.*, p.lemma, p.display_zh_hant, p.review_status AS public_review_status,
           ui.review_status AS item_review_status,
           c.title AS collection_title, c.slug AS collection_slug,
           c.review_status AS collection_review_status,
           pr.username AS author_handle
    FROM atlas_reports r
    LEFT JOIN atlas_public_items p ON p.id = r.public_item_id
    LEFT JOIN user_atlas_items ui ON ui.id = r.source_item_id
    LEFT JOIN atlas_collections c
      ON r.target_type = 'collection' AND c.id = r.target_id
    LEFT JOIN profiles pr
      ON r.target_type = 'author' AND pr.id = r.target_id
    ORDER BY r.created_at DESC
    LIMIT ${capped}
  `;
}

export interface AtlasFunnelReport {
  days: number;
  funnel: {
    uploads: number; // images uploaded
    recognized: number; // images with a successful primary AI pass
    confirmed: number; // items created
    carded: number; // items that got cards
  };
  ai: {
    calls: number;
    successRate: number; // 0..1
    totalCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    avgLatencyMs: number | null;
    byOperation: {
      operation: string;
      calls: number;
      costUsd: number;
      successRate: number;
      inputTokens: number;
      outputTokens: number;
    }[];
    byModel: {
      provider: string;
      model: string | null;
      calls: number;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
      /** Calls with no cost estimate — a non-zero value means the cost column understates spend. */
      unpricedCalls: number;
    }[];
  };
  topUsersByCost: {
    userId: string;
    costUsd: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }[];
}

/**
 * Capture-flow funnel + AI cost, derived from existing tables over the last
 * `days`. No separate event pipeline — the raw material is already in
 * user_atlas_images / _ai_usage / _items / _cards.
 */
export async function getAtlasFunnel(days: number): Promise<AtlasFunnelReport> {
  const sql = requireSql();
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const since = sql`now() - make_interval(days => ${d})`;

  const [uploads, recognized, confirmed, carded, totals, byOp, byModel, topUsers] =
    await Promise.all([
      sql<{ c: number }[]>`
        SELECT count(*)::int AS c FROM user_atlas_images WHERE created_at >= ${since}
      `,
      sql<{ c: number }[]>`
        SELECT count(DISTINCT image_id)::int AS c FROM user_atlas_ai_usage
        WHERE operation = 'primary' AND success AND created_at >= ${since}
      `,
      sql<{ c: number }[]>`
        SELECT count(*)::int AS c FROM user_atlas_items
        WHERE deleted_at IS NULL AND created_at >= ${since}
      `,
      sql<{ c: number }[]>`
        SELECT count(DISTINCT item_id)::int AS c FROM user_atlas_cards
        WHERE deleted_at IS NULL AND created_at >= ${since}
      `,
      sql<{
        calls: number;
        success_rate: number;
        total_cost: number;
        input_tokens: number;
        output_tokens: number;
        avg_latency: number | null;
      }[]>`
        SELECT
          count(*)::int AS calls,
          coalesce(avg(success::int), 0)::float8 AS success_rate,
          coalesce(sum(estimated_cost_usd), 0)::float8 AS total_cost,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens,
          avg(latency_ms)::float8 AS avg_latency
        FROM user_atlas_ai_usage WHERE created_at >= ${since}
      `,
      sql<{
        operation: string;
        calls: number;
        cost: number;
        success_rate: number;
        input_tokens: number;
        output_tokens: number;
      }[]>`
        SELECT
          operation,
          count(*)::int AS calls,
          coalesce(sum(estimated_cost_usd), 0)::float8 AS cost,
          coalesce(avg(success::int), 0)::float8 AS success_rate,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens
        FROM user_atlas_ai_usage WHERE created_at >= ${since}
        GROUP BY operation ORDER BY calls DESC
      `,
      sql<{
        provider: string;
        model: string | null;
        calls: number;
        cost: number;
        input_tokens: number;
        output_tokens: number;
        unpriced: number;
      }[]>`
        SELECT
          provider,
          model,
          count(*)::int AS calls,
          coalesce(sum(estimated_cost_usd), 0)::float8 AS cost,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens,
          count(*) FILTER (WHERE estimated_cost_usd IS NULL AND success)::int AS unpriced
        FROM user_atlas_ai_usage WHERE created_at >= ${since}
        GROUP BY provider, model ORDER BY cost DESC, calls DESC
      `,
      sql<{ user_id: string; cost: number; calls: number; input_tokens: number; output_tokens: number }[]>`
        SELECT
          user_id,
          coalesce(sum(estimated_cost_usd), 0)::float8 AS cost,
          count(*)::int AS calls,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens
        FROM user_atlas_ai_usage WHERE created_at >= ${since}
        GROUP BY user_id ORDER BY cost DESC LIMIT 10
      `,
    ]);

  const t = totals[0];
  return {
    days: d,
    funnel: {
      uploads: uploads[0]?.c ?? 0,
      recognized: recognized[0]?.c ?? 0,
      confirmed: confirmed[0]?.c ?? 0,
      carded: carded[0]?.c ?? 0,
    },
    ai: {
      calls: t?.calls ?? 0,
      successRate: t?.success_rate ?? 0,
      totalCostUsd: t?.total_cost ?? 0,
      inputTokens: t?.input_tokens ?? 0,
      outputTokens: t?.output_tokens ?? 0,
      avgLatencyMs: t?.avg_latency ?? null,
      byOperation: byOp.map((r) => ({
        operation: r.operation,
        calls: r.calls,
        costUsd: r.cost,
        successRate: r.success_rate,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
      })),
      byModel: byModel.map((r) => ({
        provider: r.provider,
        model: r.model,
        calls: r.calls,
        costUsd: r.cost,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        unpricedCalls: r.unpriced,
      })),
    },
    topUsersByCost: topUsers.map((r) => ({
      userId: r.user_id,
      costUsd: r.cost,
      calls: r.calls,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
    })),
  };
}

// =====================================================================
// Community collections (合集) — a user-authored, named grouping over the
// author's OWN approved public items (scripts/migrate.ts atlas_collections).
// Cover = a chosen member item's already-public image, so publishing only needs
// a text gate on title/description (lib/atlas/collection-submit-pipeline.ts).
// =====================================================================

/** Browse-card projection. Counts are ::int so Postgres NUMERIC never serialises
 *  as a JSON string and breaks the iOS Int decode. */
export interface AtlasPublicCollectionCardRow {
  id: string;
  /** Internal authorization field; public serializers deliberately omit it. */
  owner_user_id: string;
  slug: string;
  title: string;
  description: string | null;
  target_language: AtlasTargetLanguage;
  author_username: string;
  author_nickname: string | null;
  author_avatar: string | null;
  item_count: number;
  save_count: number;
  cover_image_path: string | null;
  avatar_image_path: string | null;
  avatar_color: string | null;
  published_at: string | null;
}

export interface AtlasMyCollectionRow extends AtlasCollectionRow {
  item_count: number;
  cover_image_path: string | null;
}

export interface AtlasPublicCollectionDetail {
  collection: AtlasPublicCollectionCardRow;
  items: AtlasPublicItemWithAuthorRow[];
}

/** Card projection + member items, ordered by position (approved members only). */
const collectionCardSelect = (sql: ReturnType<typeof requireSql>) => sql`
  c.id, c.owner_user_id, c.slug, c.title, c.description, c.target_language, c.published_at,
  c.avatar_color, c.avatar_private_path AS avatar_image_path,
  pr.username                   AS author_username,
  pr.nickname                   AS author_nickname,
  pr.avatar                     AS author_avatar,
  -- Approved members only, like the list below it: a member still inside the
  -- item gate is invisible here, and a card reading 「內容 5」 over four tiles
  -- is a count that lies.
  (SELECT count(*)::int FROM atlas_collection_items ci
    JOIN atlas_public_items member
      ON member.id = ci.public_item_id
     AND member.review_status = 'approved'
    WHERE ci.collection_id = c.id) AS item_count,
  (SELECT count(*)::int FROM atlas_collection_saves cs
    WHERE cs.collection_id = c.id) AS save_count,
  COALESCE(
    cover.image_public_path,
    (SELECT pi.image_public_path FROM atlas_collection_items ci
       JOIN atlas_public_items pi ON pi.id = ci.public_item_id
      WHERE ci.collection_id = c.id ORDER BY ci.position ASC LIMIT 1)
  ) AS cover_image_path
`;

// MARK: - Collections: author-side CRUD

/** Create a draft collection. Slug = slug(title)-<8 hex>, unique per collection. */
function slugifyAtlas(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "atlas";
}

export async function createAtlasCollection(input: {
  ownerUserId: string;
  title: string;
  description: string | null;
  targetLanguage: AtlasTargetLanguage;
}): Promise<AtlasCollectionRow> {
  const sql = requireSql();
  const slug = `${slugifyAtlas(input.title)}-${randomUUID().slice(0, 8)}`;
  const rows = await sql<AtlasCollectionRow[]>`
    INSERT INTO atlas_collections
      (owner_user_id, slug, title, description, target_language, review_status)
    VALUES (
      ${input.ownerUserId}::uuid, ${slug}, ${input.title},
      ${input.description}, ${input.targetLanguage}, 'draft'
    )
    RETURNING *
  `;
  return rows[0];
}

/** Owner-gated edit. target_language is fixed at creation to preserve the
 *  member-language invariant, so it is intentionally not updatable here. */
export async function updateAtlasCollection(input: {
  id: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  coverPublicItemId: string | null;
}): Promise<AtlasCollectionRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionRow[]>`
    UPDATE atlas_collections
    SET title = ${input.title},
        description = ${input.description},
        cover_public_item_id = ${input.coverPublicItemId}::uuid,
        updated_at = now()
    WHERE id = ${input.id}::uuid
      AND owner_user_id = ${input.ownerUserId}::uuid
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function updateAtlasCollectionAvatar(input: {
  id: string;
  ownerUserId: string;
  avatarPath: string;
  avatarColor: string;
}): Promise<AtlasCollectionRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionRow[]>`
    UPDATE atlas_collections
    SET avatar_private_path = ${input.avatarPath},
        avatar_color = ${input.avatarColor},
        updated_at = now()
    WHERE id = ${input.id}::uuid
      AND owner_user_id = ${input.ownerUserId}::uuid
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function deleteAtlasCollection(id: string, ownerUserId: string): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql<{ id: string }[]>`
    DELETE FROM atlas_collections
    WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

/** Guarded insert of the owner's confirmed source item in the collection language. */
export type AtlasCollectionAddOutcome =
  | {
      added: true;
      /**
       * The member has to cross the item gate on its own, because the
       * collection is live (or already inside the gate) and cannot carry it.
       * The caller submits it; until it passes, the member is in the collection
       * but invisible to everyone else.
       */
      needsOwnReview: boolean;
    }
  | { added: false; reason: AtlasCollectionAddRefusal | "no_collection" };

/**
 * Adds one member, or says why it would not.
 *
 * The INSERT is the guard: it matches only an item the collection can actually
 * take — the owner's own, same language, confirmed, not rejected or taken down.
 * It deliberately does **not** ask whether the item is public yet: a member
 * that isn't joins as a pending one (`public_item_id` stays NULL, which every
 * public read already treats as invisible) and is sent through the item gate by
 * the caller. Requiring 取消公開 first was the old answer, and it took the whole
 * collection off 物見 to add one photo.
 *
 * Matching nothing used to be the whole answer, which left the route with
 * `false` and the reader with 「伺服器出了點問題（409）」. A miss is now
 * classified by one follow-up read; see lib/atlas/collection-membership.ts.
 */
export async function addAtlasCollectionItem(input: {
  collectionId: string;
  ownerUserId: string;
  sourceItemId: string;
}): Promise<AtlasCollectionAddOutcome> {
  const sql = requireSql();
  // One statement, so nothing can change between the guard and the write. The
  // outer SELECT reads back what the caller has to decide next — whether this
  // member arrived already public, and whether the collection can still carry
  // it through review.
  const rows = await sql<{ public_item_id: string | null; review_status: string }[]>`
    WITH inserted AS (
      INSERT INTO atlas_collection_items (collection_id, source_item_id, public_item_id, position)
      SELECT c.id, i.id, pi.id,
             COALESCE((SELECT max(position) + 1 FROM atlas_collection_items
                       WHERE collection_id = c.id), 0)
      FROM atlas_collections c
      JOIN user_atlas_items i
        ON i.id = COALESCE(
             (SELECT source_item_id FROM atlas_public_items WHERE id = ${input.sourceItemId}::uuid),
             ${input.sourceItemId}::uuid
           )
       AND i.user_id = c.owner_user_id
       AND i.target_language = c.target_language
       AND i.deleted_at IS NULL
       AND i.review_status NOT IN ('rejected', 'takedown')
      JOIN user_atlas_images img
        ON img.id = i.image_id
       AND img.user_id = i.user_id
       AND img.deleted_at IS NULL
       AND img.status IN ('confirmed', 'cards_ready')
      LEFT JOIN atlas_public_items pi
        ON pi.source_item_id = i.id
       AND pi.review_status = 'approved'
      WHERE c.id = ${input.collectionId}::uuid
        AND c.owner_user_id = ${input.ownerUserId}::uuid
        AND c.review_status <> 'takedown'
      ON CONFLICT (collection_id, source_item_id) DO NOTHING
      RETURNING collection_id, public_item_id
    )
    SELECT inserted.public_item_id, c.review_status
    FROM inserted
    JOIN atlas_collections c ON c.id = inserted.collection_id
  `;
  const inserted = rows[0];
  if (!inserted) {
    return { added: false, reason: await classifyAtlasCollectionAddMiss(input) };
  }
  return {
    added: true,
    needsOwnReview:
      inserted.public_item_id === null && memberNeedsOwnReview(inserted.review_status),
  };
}

/**
 * Why the INSERT above matched nothing. Deliberately a second read rather than
 * a rewrite of the insert: the guard stays one statement (no window between
 * checking and inserting), and this runs only on the path that already failed.
 */
async function classifyAtlasCollectionAddMiss(input: {
  collectionId: string;
  ownerUserId: string;
  sourceItemId: string;
}): Promise<AtlasCollectionAddRefusal | "no_collection"> {
  const sql = requireSql();
  const [row] = await sql<{ is_member: boolean; item_is_addable: boolean }[]>`
    WITH target AS (
      SELECT COALESCE(
        (SELECT source_item_id FROM atlas_public_items WHERE id = ${input.sourceItemId}::uuid),
        ${input.sourceItemId}::uuid
      ) AS item_id
    )
    SELECT EXISTS (SELECT 1 FROM atlas_collection_items ci
                    WHERE ci.collection_id = c.id
                      AND ci.source_item_id = t.item_id) AS is_member,
           EXISTS (SELECT 1 FROM user_atlas_items i
                     JOIN user_atlas_images img
                       ON img.id = i.image_id AND img.user_id = i.user_id
                    WHERE i.id = t.item_id
                      AND i.user_id = c.owner_user_id
                      AND i.target_language = c.target_language
                      AND i.deleted_at IS NULL
                      AND img.deleted_at IS NULL
                      AND img.status IN ('confirmed', 'cards_ready')
                      AND i.review_status NOT IN ('rejected', 'takedown')) AS item_is_addable
    FROM atlas_collections c, target t
    WHERE c.id = ${input.collectionId}::uuid
      AND c.owner_user_id = ${input.ownerUserId}::uuid
  `;
  // No row means the collection isn't this caller's (or isn't there at all).
  // That is a 404, not a conflict — the old code answered 409 for it.
  if (!row) return "no_collection";
  return refusalForAdd({ isMember: row.is_member, itemIsAddable: row.item_is_addable });
}

export async function removeAtlasCollectionItem(input: {
  collectionId: string;
  ownerUserId: string;
  sourceItemId: string;
}): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql<{ source_item_id: string }[]>`
    DELETE FROM atlas_collection_items ci
    USING atlas_collections c
    WHERE ci.collection_id = c.id
      AND c.id = ${input.collectionId}::uuid
      AND c.owner_user_id = ${input.ownerUserId}::uuid
      AND ci.source_item_id = COALESCE(
        (SELECT source_item_id FROM atlas_public_items WHERE id = ${input.sourceItemId}::uuid),
        ${input.sourceItemId}::uuid
      )
    RETURNING ci.source_item_id
  `;
  return rows.length > 0;
}

export async function listAtlasCollectionCandidates(
  ownerUserId: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 300,
): Promise<AtlasCollectionMemberRow[]> {
  const sql = requireSql();
  return sql<AtlasCollectionMemberRow[]>`
    SELECT i.id, pi.id AS public_item_id, i.lemma, i.display_zh_hant,
           i.target_language, i.category, i.review_status, i.visibility,
           img.thumb_path, pi.image_public_path, true AS eligible
    FROM user_atlas_items i
    JOIN user_atlas_images img
      ON img.id = i.image_id AND img.user_id = i.user_id
    LEFT JOIN atlas_public_items pi
      ON pi.source_item_id = i.id AND pi.review_status = 'approved'
    WHERE i.user_id = ${ownerUserId}::uuid
      AND i.target_language = ${targetLanguage}
      AND i.deleted_at IS NULL
      AND img.deleted_at IS NULL
      AND img.status IN ('confirmed', 'cards_ready')
      AND i.review_status NOT IN ('rejected', 'takedown')
    ORDER BY i.created_at DESC
    LIMIT ${Math.min(300, Math.max(1, Math.floor(limit)))}
  `;
}

export async function listOwnedAtlasCollectionMembers(
  collectionId: string,
): Promise<AtlasCollectionMemberRow[]> {
  const sql = requireSql();
  return sql<AtlasCollectionMemberRow[]>`
    SELECT i.id, pi.id AS public_item_id, i.lemma, i.display_zh_hant,
           i.target_language, i.category, i.review_status, i.visibility,
           img.thumb_path, pi.image_public_path, ci.position,
           (i.deleted_at IS NULL
             AND img.deleted_at IS NULL
             AND img.status IN ('confirmed', 'cards_ready')
             AND i.review_status NOT IN ('rejected', 'takedown')) AS eligible
    FROM atlas_collection_items ci
    JOIN user_atlas_items i ON i.id = ci.source_item_id
    JOIN user_atlas_images img ON img.id = i.image_id
    LEFT JOIN atlas_public_items pi
      ON pi.source_item_id = i.id AND pi.review_status = 'approved'
    WHERE ci.collection_id = ${collectionId}::uuid
    ORDER BY ci.position ASC, i.created_at DESC
  `;
}

/** The author's own collections (all statuses), newest-updated first. */
export async function listMyAtlasCollections(ownerUserId: string): Promise<AtlasMyCollectionRow[]> {
  const sql = requireSql();
  return sql<AtlasMyCollectionRow[]>`
    SELECT c.*,
      (SELECT count(*)::int FROM atlas_collection_items ci WHERE ci.collection_id = c.id) AS item_count,
      COALESCE(
        cover.image_public_path,
        (SELECT pi.image_public_path FROM atlas_collection_items ci
           JOIN atlas_public_items pi ON pi.id = ci.public_item_id
          WHERE ci.collection_id = c.id ORDER BY ci.position ASC LIMIT 1)
      ) AS cover_image_path
    FROM atlas_collections c
    LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
    WHERE c.owner_user_id = ${ownerUserId}::uuid
    ORDER BY c.updated_at DESC
  `;
}

/** The owner's approved public items in one language — the pool a collection
 *  can draw members from (the authoring picker). Fresh (no cache) so a
 *  just-approved item is immediately addable. */
export async function listUserApprovedPublicItems(
  ownerUserId: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 200,
): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.owner_user_id = ${ownerUserId}::uuid
      AND pi.review_status = 'approved'
      AND pi.target_language = ${targetLanguage}
    ORDER BY pi.published_at DESC
    LIMIT ${Math.min(300, Math.max(1, Math.floor(limit)))}
  `;
}

/** Owner-scoped fetch with members, for the edit screen. */
export async function getOwnedAtlasCollection(
  id: string,
  ownerUserId: string,
): Promise<{ collection: AtlasCollectionRow; items: AtlasPublicItemWithAuthorRow[]; members: AtlasCollectionMemberRow[] } | null> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionRow[]>`
    SELECT * FROM atlas_collections
    WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid
    LIMIT 1
  `;
  const collection = rows[0];
  if (!collection) return null;
  const items = await sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_collection_items ci
    JOIN atlas_public_items pi ON pi.id = ci.public_item_id
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE ci.collection_id = ${id}::uuid
    ORDER BY ci.position ASC, pi.published_at DESC
  `;
  const members = await listOwnedAtlasCollectionMembers(id);
  return { collection, items, members };
}

// MARK: - Collections: public reads (CDN-cached routes)

/**
 * How many members a 合集 needs to sort above the rest of the browse feed.
 *
 * A guess, deliberately: it only affects ordering, never whether something can
 * be published, so getting it wrong costs a tuning change rather than a
 * blocked author.
 */
export const ATLAS_COLLECTION_FEATURED_MIN_ITEMS = 3;

export async function listPublicAtlasCollections(
  targetLanguage: AtlasTargetLanguage,
  limit = 60,
): Promise<AtlasPublicCollectionCardRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicCollectionCardRow[]>`
    SELECT * FROM (
      SELECT ${collectionCardSelect(sql)}
      FROM atlas_collections c
      JOIN profiles pr ON pr.id = c.owner_user_id
      LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
      WHERE c.target_language = ${targetLanguage}
        AND c.review_status = 'approved'
    ) cards
    -- Two tiers, then newest first. A one-item 合集 is legal — publishing must
    -- never be blocked on size (docs/COMMUNITY_ATLAS_PLAN.md §4: the community
    -- supplies content, it doesn't gate it) — but it shouldn't fill the first
    -- screen either. Ranking costs exposure; a size floor would cost supply.
    --
    -- No save_count term on purpose: collection saves are a reader bookmark,
    -- not a popularity ranking signal. Keep exposure based on useful size and
    -- recency until a separate ranking decision is made.
    ORDER BY (cards.item_count >= ${ATLAS_COLLECTION_FEATURED_MIN_ITEMS}) DESC,
             cards.published_at DESC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;
}

/**
 * 物見 search over approved collections in one learning language: title,
 * description, or the author's public name.
 *
 * The author match is only on a *confirmed* identity (a username exists) —
 * the same rule `publicAuthor()` uses to decide whether a name is shown at
 * all, so a search can never reveal who wrote something the card itself
 * keeps anonymous. Title hits rank above description / author hits; the
 * feed's size-then-recency order breaks ties.
 */
export async function searchPublicAtlasCollections(
  query: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 20,
): Promise<AtlasPublicCollectionCardRow[]> {
  const sql = requireSql();
  const pattern = atlasContainsPattern(query.trim());
  return sql<AtlasPublicCollectionCardRow[]>`
    SELECT * FROM (
      SELECT ${collectionCardSelect(sql)},
             (c.title ILIKE ${pattern}) AS title_hit
      FROM atlas_collections c
      JOIN profiles pr ON pr.id = c.owner_user_id
      LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
      WHERE c.target_language = ${targetLanguage}
        AND c.review_status = 'approved'
        AND (
          c.title ILIKE ${pattern}
          OR c.description ILIKE ${pattern}
          OR (pr.username IS NOT NULL AND (
            pr.username ILIKE ${pattern} OR pr.nickname ILIKE ${pattern}
          ))
        )
    ) cards
    ORDER BY cards.title_hit DESC,
             (cards.item_count >= ${ATLAS_COLLECTION_FEATURED_MIN_ITEMS}) DESC,
             cards.published_at DESC
    LIMIT ${Math.min(50, Math.max(1, Math.floor(limit)))}
  `;
}

/**
 * 物見 search over approved public cards in one learning language: the word
 * itself (猫 / ねこ / kettle) or its 繁中 gloss (貓 / 水壺). Exact matches
 * first, then prefix, then anywhere; newest within each.
 */
export async function searchAtlasPublicItems(
  query: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 30,
): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  const trimmed = query.trim();
  const pattern = atlasContainsPattern(trimmed);
  // "%needle%" → "needle%": the same escaped needle, anchored at the start.
  const prefix = pattern.slice(1);
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.target_language = ${targetLanguage}
      AND pi.review_status = 'approved'
      AND (pi.lemma ILIKE ${pattern} OR pi.display_zh_hant ILIKE ${pattern})
    ORDER BY
      (lower(pi.lemma) = lower(${trimmed}) OR pi.display_zh_hant = ${trimmed}) DESC,
      (pi.lemma ILIKE ${prefix} OR pi.display_zh_hant ILIKE ${prefix}) DESC,
      pi.published_at DESC
    LIMIT ${Math.min(60, Math.max(1, Math.floor(limit)))}
  `;
}

/**
 * One author's approved collections, for their public profile. Newest first.
 *
 * NOT language-scoped, unlike the browse feed: that feed is study material and
 * follows the viewer's learning direction, but a profile is a body of work, and
 * "who is this person" should not be cropped by what the visitor happens to be
 * studying. The client separates the languages visually instead.
 *
 * The LIMIT is a real cap, not a formality. Items are bounded by the 自製圖鑑
 * capacity, but collections have no per-author quota at all — `createAtlasCollection`
 * checks nothing — so without this an author could grow this array without bound
 * inside a CDN-cached public payload. 50 approved collections is far past any
 * plausible use.
 */
export async function listAtlasAuthorCollections(
  ownerUserId: string,
  limit = 50,
): Promise<AtlasPublicCollectionCardRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicCollectionCardRow[]>`
    SELECT ${collectionCardSelect(sql)}
    FROM atlas_collections c
    JOIN profiles pr ON pr.id = c.owner_user_id
    LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
    WHERE c.owner_user_id = ${ownerUserId}::uuid
      AND c.review_status = 'approved'
    ORDER BY c.published_at DESC NULLS LAST
    LIMIT ${Math.min(50, Math.max(1, Math.floor(limit)))}
  `;
}

export async function getPublicAtlasCollection(
  slug: string,
): Promise<AtlasPublicCollectionDetail | null> {
  const sql = requireSql();
  const rows = await sql<AtlasPublicCollectionCardRow[]>`
    SELECT ${collectionCardSelect(sql)}
    FROM atlas_collections c
    JOIN profiles pr ON pr.id = c.owner_user_id
    LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
    WHERE c.slug = ${slug} AND c.review_status = 'approved'
    LIMIT 1
  `;
  const collection = rows[0];
  if (!collection) return null;
  const items = await sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_collection_items ci
    JOIN atlas_public_items pi ON pi.id = ci.public_item_id
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE ci.collection_id = ${collection.id}::uuid
      AND pi.review_status = 'approved'
    ORDER BY ci.position ASC, pi.published_at DESC
  `;
  return { collection, items };
}

// MARK: - Collections: reader bookmarks

/** Idempotently bookmark an approved public collection. */
export async function saveAtlasPublicCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO atlas_collection_saves (user_id, collection_id)
    VALUES (${userId}::uuid, ${collectionId}::uuid)
    ON CONFLICT (user_id, collection_id) DO NOTHING
  `;
}

export async function unsaveAtlasPublicCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    DELETE FROM atlas_collection_saves
    WHERE user_id = ${userId}::uuid
      AND collection_id = ${collectionId}::uuid
  `;
}

export async function isAtlasPublicCollectionSaved(
  userId: string,
  collectionId: string,
): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one
    FROM atlas_collection_saves
    WHERE user_id = ${userId}::uuid
      AND collection_id = ${collectionId}::uuid
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function countAtlasCollectionSaves(collectionId: string): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM atlas_collection_saves
    WHERE collection_id = ${collectionId}::uuid
  `;
  return rows[0]?.count ?? 0;
}

export interface AtlasCollectionLearningState {
  totalCount: number;
  learningCount: number;
}

/** How many live collection members this reader has already added to study. */
export async function getAtlasCollectionLearningState(
  userId: string,
  collectionId: string,
): Promise<AtlasCollectionLearningState> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionLearningState[]>`
    SELECT
      count(DISTINCT pi.id)::int AS "totalCount",
      count(DISTINCT s.public_item_id)::int AS "learningCount"
    FROM atlas_collection_items ci
    JOIN atlas_public_items pi
      ON pi.id = ci.public_item_id
     AND pi.review_status = 'approved'
    LEFT JOIN atlas_saves s
      ON s.public_item_id = pi.id
     AND s.user_id = ${userId}::uuid
    WHERE ci.collection_id = ${collectionId}::uuid
  `;
  return rows[0] ?? { totalCount: 0, learningCount: 0 };
}

/**
 * Atomically adds every not-yet-saved live member to the reader's study queue.
 *
 * The per-user advisory lock serializes collection batch-learning requests so
 * the saved-item capacity check and both writes observe one snapshot. The two
 * inserts remain idempotent: retrying also repairs card rows left by requests
 * from before this transaction existed.
 */
export async function learnAtlasPublicCollectionItemsAtomically(
  userId: string,
  collectionId: string,
  savedItemsLimit: number,
): Promise<
  | {
      ok: true;
      addedCount: number;
      learningCount: number;
      totalCount: number;
    }
  | {
      ok: false;
      error: "capacityExceeded";
      limit: number;
      usage: number;
    }
> {
  const sql = requireSql();
  const limit = Math.max(0, Math.floor(savedItemsLimit));
  return sql.begin(async (tx) => {
    await tx`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${userId}::text, 0::bigint)
      )
    `;

    const rows = await tx<{
      allowed: boolean;
      usage: number;
      total_count: number;
      added_count: number;
    }[]>`
      WITH eligible AS MATERIALIZED (
        SELECT pi.id
        FROM atlas_collection_items ci
        JOIN atlas_public_items pi
          ON pi.id = ci.public_item_id
         AND pi.review_status = 'approved'
        WHERE ci.collection_id = ${collectionId}::uuid
      ),
      current_state AS (
        SELECT
          count(e.id)::int AS total_count,
          count(s.public_item_id)::int AS learning_count
        FROM eligible e
        LEFT JOIN atlas_saves s
          ON s.public_item_id = e.id
         AND s.user_id = ${userId}::uuid
      ),
      current_usage AS (
        SELECT count(*)::int AS usage
        FROM atlas_saves
        WHERE user_id = ${userId}::uuid
      ),
      capacity_gate AS (
        SELECT
          state.total_count,
          usage.usage,
          (
            usage.usage
            + greatest(0, state.total_count - state.learning_count)
            <= ${limit}
          ) AS allowed
        FROM current_state state
        CROSS JOIN current_usage usage
      ),
      inserted_saves AS (
        INSERT INTO atlas_saves (user_id, public_item_id)
        SELECT ${userId}::uuid, eligible.id
        FROM eligible
        CROSS JOIN capacity_gate gate
        WHERE gate.allowed
        ON CONFLICT (user_id, public_item_id) DO NOTHING
        RETURNING public_item_id
      ),
      inserted_cards AS (
        INSERT INTO atlas_saved_cards (user_id, public_item_id, card_type)
        SELECT ${userId}::uuid, eligible.id, card_types.card_type
        FROM eligible
        CROSS JOIN capacity_gate gate
        CROSS JOIN (
          VALUES ('image_recall'::text), ('flashcard'::text)
        ) AS card_types(card_type)
        WHERE gate.allowed
        ON CONFLICT (user_id, public_item_id, card_type) DO NOTHING
        RETURNING public_item_id
      )
      SELECT
        gate.allowed,
        gate.usage,
        gate.total_count,
        (SELECT count(*)::int FROM inserted_saves) AS added_count,
        (SELECT count(*)::int FROM inserted_cards) AS inserted_card_count
      FROM capacity_gate gate
    `;
    const result = rows[0] ?? {
      allowed: true,
      usage: 0,
      total_count: 0,
      added_count: 0,
    };
    if (!result.allowed) {
      return {
        ok: false as const,
        error: "capacityExceeded" as const,
        limit,
        usage: result.usage,
      };
    }

    return {
      ok: true as const,
      addedCount: result.added_count,
      learningCount: result.total_count,
      totalCount: result.total_count,
    };
  });
}

/**
 * The reader's bookmarked collections in the current learning language.
 * The join makes a withdrawn/deleted/taken-down collection disappear
 * automatically while preserving a live link to an author's later edits.
 */
export async function listSavedAtlasCollections(
  userId: string,
  targetLanguage: AtlasTargetLanguage,
  limit = 100,
): Promise<AtlasPublicCollectionCardRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicCollectionCardRow[]>`
    SELECT ${collectionCardSelect(sql)}
    FROM atlas_collection_saves saved
    JOIN atlas_collections c ON c.id = saved.collection_id
    JOIN profiles pr ON pr.id = c.owner_user_id
    LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
    WHERE saved.user_id = ${userId}::uuid
      AND c.target_language = ${targetLanguage}
      AND c.review_status = 'approved'
    ORDER BY saved.created_at DESC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
  `;
}

// MARK: - Collections: admin review + moderation

export async function listAtlasCollectionReviewItems(
  status: AtlasCollectionReviewStatus | "" = "pending_review",
  limit = 120,
): Promise<
  (AtlasCollectionRow & {
    author_username: string | null;
    item_count: number;
    cover_image_path: string | null;
  })[]
> {
  const sql = requireSql();
  return sql`
    SELECT c.*,
      pr.username AS author_username,
      (SELECT count(*)::int FROM atlas_collection_items ci WHERE ci.collection_id = c.id) AS item_count,
      COALESCE(
        cover.image_public_path,
        (SELECT pi.image_public_path FROM atlas_collection_items ci
           JOIN atlas_public_items pi ON pi.id = ci.public_item_id
          WHERE ci.collection_id = c.id ORDER BY ci.position ASC LIMIT 1)
      ) AS cover_image_path
    FROM atlas_collections c
    LEFT JOIN profiles pr ON pr.id = c.owner_user_id
    LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
    WHERE (${status} = '' OR c.review_status = ${status})
      AND c.review_status <> 'draft'
    ORDER BY CASE c.review_status WHEN 'pending_review' THEN 0 ELSE 1 END, c.updated_at DESC
    LIMIT ${Math.min(200, Math.max(1, Math.floor(limit)))}
  `;
}

export async function setAtlasCollectionReviewStatus(
  id: string,
  status: AtlasCollectionReviewStatus,
): Promise<AtlasCollectionRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionRow[]>`
    UPDATE atlas_collections
    SET review_status = ${status},
        content_review_approved_at = CASE
          WHEN ${status} IN ('draft', 'rejected', 'takedown', 'withdrawn') THEN NULL
          ELSE content_review_approved_at
        END,
        updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function markAtlasCollectionContentApproved(
  id: string,
): Promise<AtlasCollectionRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionRow[]>`
    UPDATE atlas_collections
    SET content_review_approved_at = now(),
        review_status = 'pending_review',
        updated_at = now()
    WHERE id = ${id}::uuid
      AND review_status <> 'takedown'
    RETURNING *
  `;
  return rows[0] ?? null;
}

/** Audit trail for collection moderation (categories/scores only — no free text). */
export async function recordAtlasCollectionModerationEvent(input: {
  collectionId: string;
  phase: AtlasModerationPhase;
  verdict: AtlasModerationVerdict;
  categories: string[];
  scores: Record<string, number>;
  actor?: string | null;
}): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO atlas_collection_moderation_events
        (collection_id, phase, verdict, categories, scores, actor)
      VALUES (
        ${input.collectionId}::uuid,
        ${input.phase},
        ${input.verdict},
        ${JSON.stringify(input.categories)}::jsonb,
        ${JSON.stringify(input.scores)}::jsonb,
        ${input.actor ?? null}
      )
    `;
  } catch {
    // Audit logging must never break the submission path.
  }
}

/** Number of distinct saved community words currently due for review.
 * Uses the same approval, language and due predicates as the study queue. */
export async function savedCommunityDueCount(userId: string, targetLanguage: AtlasTargetLanguage): Promise<number> {
  const sql = requireSql();
  const rows = await sql<{ due: number }[]>`
    SELECT count(DISTINCT sc.public_item_id)::int AS due
    FROM atlas_saved_cards sc
    JOIN atlas_public_items p ON p.id = sc.public_item_id
    WHERE sc.user_id = ${userId}::uuid AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage}
      AND sc.status <> '新卡' AND sc.next_review_at <= now()
  `;
  return Number(rows[0]?.due ?? 0);
}

/** Distinct saved community words eligible for a new-card queue. */
export async function savedCommunityNewCount(userId: string, targetLanguage: AtlasTargetLanguage): Promise<number> {
  const sql = requireSql();
  const rows = await sql<{ total: number }[]>`
    SELECT count(DISTINCT sc.public_item_id)::int AS total
    FROM atlas_saved_cards sc
    JOIN atlas_public_items p ON p.id = sc.public_item_id
    WHERE sc.user_id = ${userId}::uuid AND p.review_status = 'approved'
      AND p.target_language = ${targetLanguage} AND sc.status = '新卡'
      AND NOT EXISTS (
        SELECT 1 FROM atlas_saved_cards sc2 WHERE sc2.user_id = sc.user_id
          AND sc2.public_item_id = sc.public_item_id AND sc2.status <> '新卡'
      )
  `;
  return Number(rows[0]?.total ?? 0);
}
