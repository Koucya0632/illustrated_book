import "server-only";
import { randomUUID } from "node:crypto";
import { getSql } from "./db";
import type { Rating, Status } from "./srs";
import type {
  AtlasCandidate,
  AtlasCandidateRow,
  AtlasCardRow,
  AtlasCardStateRow,
  AtlasCollectionReviewStatus,
  AtlasCollectionRow,
  AtlasDeckKey,
  AtlasDueCard,
  AtlasEnrichment,
  AtlasImageRow,
  AtlasItemRow,
  AtlasMasteryRow,
  AtlasModerationPhase,
  AtlasModerationVerdict,
  AtlasPublicItemRow,
  AtlasPublicItemWithAuthorRow,
  AtlasRecognitionJobRow,
  AtlasRecognitionStage,
  AtlasReviewStatus,
  AtlasTargetLanguage,
} from "./atlas/types";
import type { AtlasRecognitionResult } from "./atlas/vision-provider";

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

export interface CreateAtlasImageInput {
  id: string;
  userId: string;
  bucket: string;
  originalPath: string;
  thumbPath: string;
  recognitionPath: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
}

export async function findAtlasImageByHash(
  userId: string,
  sha256: string,
): Promise<AtlasImageRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasImageRow[]>`
    SELECT *
    FROM user_atlas_images
    WHERE user_id = ${userId}::uuid
      AND sha256 = ${sha256}
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createAtlasImage(input: CreateAtlasImageInput): Promise<AtlasImageRow> {
  const sql = requireSql();
  const rows = await sql<AtlasImageRow[]>`
    INSERT INTO user_atlas_images (
      id, user_id, bucket, original_path, thumb_path, recognition_path,
      mime_type, byte_size, width, height, sha256, updated_at
    )
    VALUES (
      ${input.id}::uuid,
      ${input.userId}::uuid,
      ${input.bucket},
      ${input.originalPath},
      ${input.thumbPath},
      ${input.recognitionPath},
      ${input.mimeType},
      ${input.byteSize},
      ${input.width},
      ${input.height},
      ${input.sha256},
      now()
    )
    RETURNING *
  `;
  return rows[0];
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

export async function createAtlasRecognitionJob(
  userId: string,
  imageId: string,
  stage: AtlasRecognitionStage = "primary",
): Promise<AtlasRecognitionJobRow> {
  const sql = requireSql();
  const rows = await sql<AtlasRecognitionJobRow[]>`
    INSERT INTO user_atlas_recognition_jobs (
      user_id, image_id, status, stage, strategy, updated_at
    )
    VALUES (
      ${userId}::uuid,
      ${imageId}::uuid,
      'queued',
      ${stage},
      'cost_first',
      now()
    )
    RETURNING *
  `;
  return rows[0];
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

export async function updateAtlasImageStatus(
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

export async function markAtlasRecognitionRunning(
  userId: string,
  jobId: string,
  provider: string,
  stage: AtlasRecognitionStage,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE user_atlas_recognition_jobs
    SET status = 'running',
        provider = ${provider},
        stage = ${stage},
        started_at = now(),
        updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND id = ${jobId}::uuid
  `;
}

export async function completeAtlasRecognitionJob(
  userId: string,
  jobId: string,
  result: AtlasRecognitionResult,
): Promise<AtlasRecognitionJobRow | null> {
  const sql = requireSql();
  const topPrimary = result.primary[0]?.confidence ?? null;
  const topFine = result.fine[0]?.confidence ?? null;
  const rows = await sql<AtlasRecognitionJobRow[]>`
    UPDATE user_atlas_recognition_jobs
    SET status = 'needs_review',
        provider = ${result.provider},
        model = ${result.model},
        stage = ${result.stage},
        primary_confidence = ${topPrimary},
        fine_confidence = ${topFine},
        uncertainty_reason = ${result.uncertainty.reason},
        normalized_response = ${sql.json(JSON.parse(JSON.stringify(result)))},
        raw_response = ${result.raw == null ? null : sql.json(JSON.parse(JSON.stringify(result.raw)))},
        finished_at = now(),
        updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND id = ${jobId}::uuid
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function failAtlasRecognitionJob(
  userId: string,
  jobId: string,
  error: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE user_atlas_recognition_jobs
    SET status = 'failed',
        error = ${error},
        finished_at = now(),
        updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND id = ${jobId}::uuid
  `;
}

export async function replaceAtlasCandidates(
  userId: string,
  imageId: string,
  jobId: string,
  targetLanguage: AtlasTargetLanguage,
  result: AtlasRecognitionResult,
): Promise<AtlasCandidateRow[]> {
  const sql = requireSql();
  await sql`
    DELETE FROM user_atlas_candidates
    WHERE user_id = ${userId}::uuid
      AND job_id = ${jobId}::uuid
  `;

  const rows: AtlasCandidateRow[] = [];
  async function insertCandidate(
    level: "primary" | "fine",
    candidate: AtlasCandidate,
    rank: number,
  ) {
    const inserted = await sql<AtlasCandidateRow[]>`
      INSERT INTO user_atlas_candidates (
        user_id, job_id, image_id, level, label, normalized_label,
        zh_hant, gloss, target_term, target_language, taxonomy_node_id,
        confidence, rank, source, metadata
      )
      VALUES (
        ${userId}::uuid,
        ${jobId}::uuid,
        ${imageId}::uuid,
        ${level},
        ${candidate.label},
        ${candidate.normalizedLabel},
        ${candidate.zhHant},
        ${candidate.gloss},
        ${candidate.label},
        ${targetLanguage},
        ${candidate.taxonomyNodeId},
        ${candidate.confidence},
        ${rank},
        ${result.provider},
        ${sql.json({ stage: result.stage })}
      )
      RETURNING *
    `;
    rows.push(inserted[0]);
  }

  for (let i = 0; i < result.primary.length; i++) {
    await insertCandidate("primary", result.primary[i], i + 1);
  }
  for (let i = 0; i < result.fine.length; i++) {
    await insertCandidate("fine", result.fine[i], i + 1);
  }
  return rows;
}

export async function listAtlasCandidates(
  userId: string,
  imageId: string,
): Promise<AtlasCandidateRow[]> {
  const sql = requireSql();
  return sql<AtlasCandidateRow[]>`
    SELECT *
    FROM user_atlas_candidates
    WHERE user_id = ${userId}::uuid
      AND image_id = ${imageId}::uuid
    ORDER BY job_id, level, rank
  `;
}

export interface ConfirmAtlasItemInput {
  userId: string;
  imageId: string;
  selectedCandidateId: string | null;
  targetLanguage: AtlasTargetLanguage;
  primaryLabel: string;
  fineLabel: string | null;
  lemma: string;
  displayZhHant: string;
  /// Gloss in the capturing user's UI language, written into display_ja /
  /// display_en; both null for Chinese UIs (displayZhHant is the gloss there).
  displayJa: string | null;
  displayEn: string | null;
  partOfSpeech: string | null;
  category: string | null;
}

export async function confirmAtlasItem(input: ConfirmAtlasItemInput): Promise<AtlasItemRow> {
  const sql = requireSql();
  const selectedCandidateId = input.selectedCandidateId;
  const correctionSource = input.selectedCandidateId ? "candidate" : "manual";

  // Idempotent: if this image already has a (non-deleted) item, update it in
  // place rather than inserting a duplicate. This makes AtlasCaptureQueue resume
  // safe — a job re-run after an app kill hits the same row instead of creating
  // a second item — and also turns a re-confirm into an edit.
  const existing = await sql<AtlasItemRow[]>`
    SELECT * FROM user_atlas_items
    WHERE user_id = ${input.userId}::uuid
      AND image_id = ${input.imageId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;

  const rows = existing[0]
    ? await sql<AtlasItemRow[]>`
        UPDATE user_atlas_items SET
          selected_candidate_id = ${selectedCandidateId}::uuid,
          target_language = ${input.targetLanguage},
          primary_label = ${input.primaryLabel},
          fine_label = ${input.fineLabel},
          lemma = ${input.lemma},
          display_zh_hant = ${input.displayZhHant},
          display_ja = ${input.displayJa},
          display_en = ${input.displayEn},
          part_of_speech = ${input.partOfSpeech},
          category = ${input.category},
          correction_source = ${correctionSource},
          updated_at = now()
        WHERE id = ${existing[0].id}::uuid
        RETURNING *
      `
    : await sql<AtlasItemRow[]>`
        INSERT INTO user_atlas_items (
          user_id, image_id, selected_candidate_id, target_language,
          primary_label, fine_label, lemma, display_zh_hant,
          display_ja, display_en,
          part_of_speech, category, correction_source, updated_at
        )
        VALUES (
          ${input.userId}::uuid,
          ${input.imageId}::uuid,
          ${selectedCandidateId}::uuid,
          ${input.targetLanguage},
          ${input.primaryLabel},
          ${input.fineLabel},
          ${input.lemma},
          ${input.displayZhHant},
          ${input.displayJa},
          ${input.displayEn},
          ${input.partOfSpeech},
          ${input.category},
          ${correctionSource},
          now()
        )
        RETURNING *
      `;
  await updateAtlasImageStatus(input.userId, input.imageId, "confirmed");
  return rows[0];
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

export interface AtlasItemEnrichmentUpdate {
  pronunciation: string | null;
  reading: string | null;
  definitionTarget: string | null;
  definitionZh: string | null;
  definitionJa: string | null;
  definitionEn: string | null;
  displayJa: string | null;
  displayEn: string | null;
  enrichment: AtlasEnrichment;
}

/** Persist AI enrichment onto an item and flip backfill_status to 'filled'.
 *  Gloss columns use COALESCE so a confirm-time user edit (display_ja/en from
 *  the capture sheet) isn't clobbered by the generated value. */
export async function updateAtlasItemEnrichment(
  userId: string,
  itemId: string,
  fields: AtlasItemEnrichmentUpdate,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE user_atlas_items SET
      pronunciation      = ${fields.pronunciation},
      reading            = ${fields.reading},
      definition_target  = ${fields.definitionTarget},
      definition_zh_hant = ${fields.definitionZh},
      definition_ja      = ${fields.definitionJa},
      definition_en      = ${fields.definitionEn},
      display_ja         = COALESCE(display_ja, ${fields.displayJa}),
      display_en         = COALESCE(display_en, ${fields.displayEn}),
      enrichment         = ${sql.json(fields.enrichment as never)},
      backfill_status    = 'filled',
      backfill_error     = NULL,
      updated_at         = now()
    WHERE user_id = ${userId}::uuid AND id = ${itemId}::uuid
  `;
}

export async function markAtlasItemBackfillFailed(
  userId: string,
  itemId: string,
  error: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE user_atlas_items SET
      backfill_status = 'failed',
      backfill_error  = ${error.slice(0, 500)},
      updated_at      = now()
    WHERE user_id = ${userId}::uuid AND id = ${itemId}::uuid
  `;
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
): Promise<AtlasDueCard[]> {
  const sql = requireSql();
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
): Promise<{
  total: number;
  seen: number;
  due: number;
  new: number;
  todayNew: number;
  byStatus: Array<{ status: Status; c: number }>;
}> {
  const sql = requireSql();
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
        AND s.last_reviewed_at IS NOT NULL
        AND (s.last_reviewed_at AT TIME ZONE 'Asia/Taipei')::date
          = (now() AT TIME ZONE 'Asia/Taipei')::date
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
): Promise<{ category: "custom"; total: number; seen: number } | null> {
  const stats = await atlasStudyStats(userId, targetLanguage);
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

export async function insertAtlasAiUsage(input: {
  userId: string;
  jobId: string;
  imageId: string;
  provider: string;
  model: string | null;
  operation: string;
  detailLevel: string | null;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  success: boolean;
}): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO user_atlas_ai_usage (
      user_id, job_id, image_id, provider, model, operation, detail_level,
      input_tokens, output_tokens, image_count, estimated_cost_usd,
      latency_ms, success
    )
    VALUES (
      ${input.userId}::uuid,
      ${input.jobId}::uuid,
      ${input.imageId}::uuid,
      ${input.provider},
      ${input.model},
      ${input.operation},
      ${input.detailLevel},
      ${input.inputTokens ?? null},
      ${input.outputTokens ?? null},
      ${input.imageCount ?? 1},
      ${input.estimatedCostUsd ?? null},
      ${input.latencyMs ?? null},
      ${input.success}
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
  return {
    privatePaths: privateRows.flatMap((row) => [
      row.original_path,
      row.thumb_path,
      row.recognition_path,
    ]),
    publicPaths: publicRows
      .map((row) => row.image_public_path)
      .filter((path): path is string => Boolean(path)),
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

function slugifyAtlas(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "atlas";
}

export async function submitAtlasItemForReview(
  userId: string,
  itemId: string,
): Promise<AtlasItemRow | null> {
  const sql = requireSql();
  const item = await getAtlasItem(userId, itemId);
  if (!item) return null;
  const slugBase = slugifyAtlas(item.lemma);
  const publicSlug = `${slugBase}-${item.id.slice(0, 8)}`;
  const rows = await sql<AtlasItemRow[]>`
    UPDATE user_atlas_items
    SET visibility = 'public',
        -- 'pending_auto' = handed to the machine gate; processAtlasSubmission
        -- immediately moves it to approved / pending_review / rejected.
        review_status = 'pending_auto',
        public_slug = COALESCE(public_slug, ${publicSlug}),
        updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND id = ${itemId}::uuid
      AND deleted_at IS NULL
    RETURNING *
  `;
  return rows[0] ?? null;
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

export async function listAtlasFriendVisibleItems(
  viewerUserId: string,
  limit = 60,
): Promise<(AtlasItemRow & { owner_username: string | null; thumb_path: string | null })[]> {
  const sql = requireSql();
  return sql<(AtlasItemRow & { owner_username: string | null; thumb_path: string | null })[]>`
    SELECT i.*, p.username AS owner_username, img.thumb_path
    FROM user_atlas_items i
    JOIN user_atlas_images img
      ON img.id = i.image_id
     AND img.user_id = i.user_id
     AND img.deleted_at IS NULL
    LEFT JOIN profiles p ON p.id = i.user_id
    WHERE i.deleted_at IS NULL
      AND i.user_id <> ${viewerUserId}::uuid
      AND i.review_status <> 'takedown'
      AND (
        (
          i.visibility = 'friends'
          AND EXISTS (
            SELECT 1
            FROM user_friendships f
            WHERE f.user_id = ${viewerUserId}::uuid
              AND f.friend_user_id = i.user_id
              AND f.status = 'accepted'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM atlas_item_grants g
          WHERE g.viewer_user_id = ${viewerUserId}::uuid
            AND g.owner_user_id = i.user_id
            AND g.item_id = i.id
            AND g.scope = 'view'
        )
      )
    ORDER BY i.updated_at DESC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
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

/**
 * Publish (or re-publish) the public row for an approved item.
 *
 * Deliberately writes no author name: identity is joined live from `profiles`
 * at read time, so a rename updates everything the author ever published
 * instead of leaving old rows under an old name.
 */
export async function approveAtlasPublicItem(input: {
  itemId: string;
  imagePublicPath: string | null;
}): Promise<AtlasPublicItemRow | null> {
  const sql = requireSql();
  const item = await getAtlasReviewItem(input.itemId);
  if (!item) return null;
  const slug = item.public_slug ?? `${slugifyAtlas(item.lemma)}-${item.id.slice(0, 8)}`;
  const rows = await sql<AtlasPublicItemRow[]>`
    INSERT INTO atlas_public_items (
      source_item_id, owner_user_id, public_slug, lemma, display_zh_hant,
      target_language, category, image_public_path,
      review_status, published_at, updated_at
    )
    VALUES (
      ${item.id}::uuid,
      ${item.user_id}::uuid,
      ${slug},
      ${item.lemma},
      ${item.display_zh_hant},
      ${item.target_language},
      ${item.category},
      ${input.imagePublicPath},
      'approved',
      now(),
      now()
    )
    ON CONFLICT (public_slug) DO UPDATE SET
      lemma = EXCLUDED.lemma,
      display_zh_hant = EXCLUDED.display_zh_hant,
      target_language = EXCLUDED.target_language,
      category = EXCLUDED.category,
      image_public_path = EXCLUDED.image_public_path,
      review_status = 'approved',
      updated_at = now()
    RETURNING *
  `;
  await sql`
    UPDATE user_atlas_items
    SET visibility = 'public',
        review_status = 'approved',
        published_at = COALESCE(published_at, now()),
        public_slug = ${slug},
        share_image_path = ${input.imagePublicPath},
        cdn_cache_key = ${slug},
        updated_at = now()
    WHERE id = ${item.id}::uuid
  `;
  return rows[0] ?? null;
}

/**
 * Moves an item into a review state without touching visibility. Used by the
 * machine gate (docs/COMMUNITY_ATLAS_PLAN.md §5): a flagged item stays
 * visibility='public' but is not in atlas_public_items, so it is not reachable
 * publicly until a human approves it.
 */
export async function setAtlasItemReviewStatus(
  itemId: string,
  status: AtlasReviewStatus,
): Promise<AtlasItemRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasItemRow[]>`
    UPDATE user_atlas_items
    SET review_status = ${status},
        updated_at = now()
    WHERE id = ${itemId}::uuid
      AND deleted_at IS NULL
    RETURNING *
  `;
  return rows[0] ?? null;
}

/**
 * Audit trail for moderation decisions (machine + human). Used to tune
 * thresholds and to show admins why an item was flagged.
 *
 * Privacy: categories/scores only — never raw image URLs or free-text payloads
 * (same rule as the events table).
 */
export async function recordAtlasModerationEvent(input: {
  itemId: string;
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
      INSERT INTO atlas_moderation_events
        (item_id, phase, verdict, categories, scores, actor)
      VALUES (
        ${input.itemId}::uuid,
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

export async function rejectAtlasReviewItem(itemId: string): Promise<AtlasItemRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasItemRow[]>`
    UPDATE user_atlas_items
    SET review_status = 'rejected',
        visibility = 'private',
        updated_at = now()
    WHERE id = ${itemId}::uuid
      AND deleted_at IS NULL
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function takedownAtlasPublicItem(itemId: string): Promise<void> {
  const sql = requireSql();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE user_atlas_items
      SET review_status = 'takedown',
          visibility = 'private',
          updated_at = now()
      WHERE id = ${itemId}::uuid
    `;
    await tx`
      UPDATE atlas_public_items
      SET review_status = 'takedown',
          updated_at = now()
      WHERE source_item_id = ${itemId}::uuid
    `;
  });
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
  pr.avatar                     AS author_avatar,
  pr.public_author_confirmed_at AS author_confirmed_at
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

// MARK: - Report escalation (docs/COMMUNITY_ATLAS_PLAN.md §5.5)

/** High-risk reasons escalate on the first report; the rest need a threshold. */
const ATLAS_HIGH_RISK_REASONS = new Set(["inappropriate", "copyright"]);

function reportEscalationThreshold(): number {
  const raw = process.env.ATLAS_REPORT_ESCALATE_AT;
  const n = raw === undefined || raw === "" ? 3 : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
}

/**
 * Pulls a reported item back for human review once it crosses the escalation
 * bar. Harm scales with reach, so this deliberately errs toward re-reviewing:
 * the cost is a queue entry, the cost of not doing it is public bad content.
 *
 * Returns true when the item was escalated.
 */
export async function maybeEscalateAtlasReport(input: {
  publicItemId: string;
  sourceItemId: string | null;
  reason: string;
}): Promise<boolean> {
  const sql = getSql();
  if (!sql || !input.sourceItemId) return false;

  try {
    const highRisk = ATLAS_HIGH_RISK_REASONS.has(input.reason);
    let escalate = highRisk;

    if (!escalate) {
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM atlas_reports
        WHERE public_item_id = ${input.publicItemId}::uuid
      `;
      escalate = (rows[0]?.count ?? 0) >= reportEscalationThreshold();
    }
    if (!escalate) return false;

    // Only pull back items that are currently live; don't resurrect a
    // takedown or re-queue something already awaiting review.
    const updated = await sql<{ id: string }[]>`
      UPDATE user_atlas_items
      SET review_status = 'pending_review',
          updated_at = now()
      WHERE id = ${input.sourceItemId}::uuid
        AND review_status = 'approved'
        AND deleted_at IS NULL
      RETURNING id
    `;
    if (updated.length === 0) return false;

    // Hide it from the public feed while it waits for a human.
    await sql`
      UPDATE atlas_public_items
      SET review_status = 'takedown', updated_at = now()
      WHERE source_item_id = ${input.sourceItemId}::uuid
    `;

    await recordAtlasModerationEvent({
      itemId: input.sourceItemId,
      phase: "report",
      verdict: "flagged",
      categories: [input.reason],
      scores: {},
      actor: highRisk ? "report:high-risk" : "report:threshold",
    });
    return true;
  } catch {
    // Escalation is best-effort; a failure must not break the report path.
    return false;
  }
}

/**
 * Author standing. Absence of a row means good standing, so this only has to
 * answer "is this user restricted or banned from publishing?".
 */
export async function isAtlasAuthorBlocked(userId: string): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  try {
    const rows = await sql<{ state: string }[]>`
      SELECT state FROM user_moderation_state
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const state = rows[0]?.state;
    return state === "restricted" || state === "banned";
  } catch {
    return false;
  }
}

// MARK: - Author profiles (community identity)

export interface AtlasAuthorRow {
  user_id: string;
  username: string;
  nickname: string | null;
  avatar: string;
  joined_at: string;
  published_count: number;
  /** Total times this author's public items have been saved by others. */
  save_count: number;
}

/**
 * Public author profile: identity plus the aggregate feedback signals
 * (docs/COMMUNITY_ATLAS_PLAN.md §3C). Counts only approved items — a takedown
 * must not keep inflating an author's numbers.
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
      pr.created_at                      AS joined_at,
      count(DISTINCT p.id)::int          AS published_count,
      count(s.public_item_id)::int       AS save_count
    FROM profiles pr
    JOIN atlas_public_items p
      ON p.owner_user_id = pr.id
     AND p.review_status = 'approved'
    LEFT JOIN atlas_saves s ON s.public_item_id = p.id
    WHERE lower(pr.username) = lower(${username})
      AND pr.public_author_confirmed_at IS NOT NULL
    GROUP BY pr.id, pr.username, pr.nickname, pr.avatar, pr.created_at
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** An author's approved public items, newest first. */
export async function listAtlasAuthorItems(
  userId: string,
  limit = 60,
): Promise<AtlasPublicItemWithAuthorRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicItemWithAuthorRow[]>`
    SELECT ${publicItemWithAuthorSelect(sql)}
    FROM atlas_public_items pi
    LEFT JOIN profiles pr ON pr.id = pi.owner_user_id
    WHERE pi.owner_user_id = ${userId}::uuid
      AND pi.review_status = 'approved'
    ORDER BY pi.published_at DESC
    LIMIT ${Math.min(200, Math.max(1, Math.floor(limit)))}
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
  attribution_name: string | null;
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
      p.attribution_name,
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
      p.image_public_path, p.attribution_name,
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

/** The user's saved community items, newest first. */
export async function listAtlasSavedItems(
  userId: string,
  limit = 60,
): Promise<AtlasPublicItemRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicItemRow[]>`
    SELECT p.*
    FROM atlas_saves s
    JOIN atlas_public_items p ON p.id = s.public_item_id
    WHERE s.user_id = ${userId}::uuid
      AND p.review_status = 'approved'
    ORDER BY s.created_at DESC
    LIMIT ${Math.min(200, Math.max(1, Math.floor(limit)))}
  `;
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

export type AtlasReportReason =
  | "spam"
  | "inappropriate"
  | "copyright"
  | "wrong"
  | "other";
export type AtlasReportStatus = "open" | "reviewed" | "dismissed";

/**
 * Record a user's report on a public 圖鑑 item. One report per (item, reporter):
 * a repeat is a no-op (returns already=true) so the button can't be spammed into
 * duplicate rows.
 */
export async function createAtlasReport(input: {
  publicItemId: string;
  sourceItemId: string | null;
  slug: string;
  reporterUserId: string;
  reason: AtlasReportReason;
  detail: string | null;
}): Promise<{ id: string; already: boolean }> {
  const sql = requireSql();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO atlas_reports (
      public_item_id, source_item_id, slug, reporter_user_id, reason, detail
    )
    VALUES (
      ${input.publicItemId}::uuid, ${input.sourceItemId}, ${input.slug},
      ${input.reporterUserId}::uuid, ${input.reason}, ${input.detail}
    )
    ON CONFLICT (public_item_id, reporter_user_id) DO NOTHING
    RETURNING id
  `;
  if (rows[0]) return { id: rows[0].id, already: false };
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM atlas_reports
    WHERE public_item_id = ${input.publicItemId}::uuid
      AND reporter_user_id = ${input.reporterUserId}::uuid
    LIMIT 1
  `;
  return { id: existing[0]?.id ?? "", already: true };
}

export interface AtlasReportRow {
  id: string;
  public_item_id: string;
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
}

/** Admin: list reports, newest first, optionally filtered by status. */
export async function listAtlasReports(
  status: AtlasReportStatus | "",
  limit = 200,
): Promise<AtlasReportRow[]> {
  const sql = requireSql();
  const capped = Math.min(500, Math.max(1, Math.floor(limit)));
  if (status) {
    return sql<AtlasReportRow[]>`
      SELECT r.*, p.lemma, p.display_zh_hant, p.review_status AS public_review_status
      FROM atlas_reports r
      LEFT JOIN atlas_public_items p ON p.id = r.public_item_id
      WHERE r.status = ${status}
      ORDER BY r.created_at DESC
      LIMIT ${capped}
    `;
  }
  return sql<AtlasReportRow[]>`
    SELECT r.*, p.lemma, p.display_zh_hant, p.review_status AS public_review_status
    FROM atlas_reports r
    LEFT JOIN atlas_public_items p ON p.id = r.public_item_id
    ORDER BY r.created_at DESC
    LIMIT ${capped}
  `;
}

/** Admin: resolve a report (reviewed / dismissed). */
export async function updateAtlasReportStatus(
  id: string,
  status: AtlasReportStatus,
): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE atlas_reports SET status = ${status} WHERE id = ${id}::bigint
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
    avgLatencyMs: number | null;
    byOperation: { operation: string; calls: number; costUsd: number; successRate: number }[];
  };
  topUsersByCost: { userId: string; costUsd: number; calls: number }[];
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

  const [uploads, recognized, confirmed, carded, totals, byOp, topUsers] =
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
      sql<{ calls: number; success_rate: number; total_cost: number; avg_latency: number | null }[]>`
        SELECT
          count(*)::int AS calls,
          coalesce(avg(success::int), 0)::float8 AS success_rate,
          coalesce(sum(estimated_cost_usd), 0)::float8 AS total_cost,
          avg(latency_ms)::float8 AS avg_latency
        FROM user_atlas_ai_usage WHERE created_at >= ${since}
      `,
      sql<{ operation: string; calls: number; cost: number; success_rate: number }[]>`
        SELECT
          operation,
          count(*)::int AS calls,
          coalesce(sum(estimated_cost_usd), 0)::float8 AS cost,
          coalesce(avg(success::int), 0)::float8 AS success_rate
        FROM user_atlas_ai_usage WHERE created_at >= ${since}
        GROUP BY operation ORDER BY calls DESC
      `,
      sql<{ user_id: string; cost: number; calls: number }[]>`
        SELECT user_id, coalesce(sum(estimated_cost_usd), 0)::float8 AS cost, count(*)::int AS calls
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
      avgLatencyMs: t?.avg_latency ?? null,
      byOperation: byOp.map((r) => ({
        operation: r.operation,
        calls: r.calls,
        costUsd: r.cost,
        successRate: r.success_rate,
      })),
    },
    topUsersByCost: topUsers.map((r) => ({
      userId: r.user_id,
      costUsd: r.cost,
      calls: r.calls,
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
  slug: string;
  title: string;
  description: string | null;
  target_language: AtlasTargetLanguage;
  author_username: string;
  author_nickname: string | null;
  author_avatar: string | null;
  author_confirmed_at: string | null;
  item_count: number;
  save_count: number;
  cover_image_path: string | null;
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
  c.id, c.slug, c.title, c.description, c.target_language, c.published_at,
  pr.username                   AS author_username,
  pr.nickname                   AS author_nickname,
  pr.avatar                     AS author_avatar,
  pr.public_author_confirmed_at AS author_confirmed_at,
  (SELECT count(*)::int FROM atlas_collection_items ci
    WHERE ci.collection_id = c.id) AS item_count,
  (SELECT count(*)::int FROM atlas_collection_items ci
    JOIN atlas_saves s ON s.public_item_id = ci.public_item_id
    WHERE ci.collection_id = c.id) AS save_count,
  COALESCE(
    cover.image_public_path,
    (SELECT pi.image_public_path FROM atlas_collection_items ci
       JOIN atlas_public_items pi ON pi.id = ci.public_item_id
      WHERE ci.collection_id = c.id ORDER BY ci.position ASC LIMIT 1)
  ) AS cover_image_path
`;

// MARK: - Collections: author-side CRUD

/** Create a draft collection. Slug = slug(title)-<8 hex>, unique per collection. */
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

export async function deleteAtlasCollection(id: string, ownerUserId: string): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql<{ id: string }[]>`
    DELETE FROM atlas_collections
    WHERE id = ${id}::uuid AND owner_user_id = ${ownerUserId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

/** Add a member. Guarded insert: the collection must belong to the user AND the
 *  public item must be the user's own approved item in the collection's language. */
export async function addAtlasCollectionItem(input: {
  collectionId: string;
  ownerUserId: string;
  publicItemId: string;
}): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql<{ collection_id: string }[]>`
    INSERT INTO atlas_collection_items (collection_id, public_item_id, position)
    SELECT c.id, pi.id,
           COALESCE((SELECT max(position) + 1 FROM atlas_collection_items
                     WHERE collection_id = c.id), 0)
    FROM atlas_collections c
    JOIN atlas_public_items pi
      ON pi.id = ${input.publicItemId}::uuid
     AND pi.owner_user_id = c.owner_user_id
     AND pi.review_status = 'approved'
     AND pi.target_language = c.target_language
    WHERE c.id = ${input.collectionId}::uuid
      AND c.owner_user_id = ${input.ownerUserId}::uuid
      AND c.review_status <> 'takedown'
    ON CONFLICT (collection_id, public_item_id) DO NOTHING
    RETURNING collection_id
  `;
  return rows.length > 0;
}

export async function removeAtlasCollectionItem(input: {
  collectionId: string;
  ownerUserId: string;
  publicItemId: string;
}): Promise<boolean> {
  const sql = requireSql();
  const rows = await sql<{ public_item_id: string }[]>`
    DELETE FROM atlas_collection_items ci
    USING atlas_collections c
    WHERE ci.collection_id = c.id
      AND c.id = ${input.collectionId}::uuid
      AND c.owner_user_id = ${input.ownerUserId}::uuid
      AND ci.public_item_id = ${input.publicItemId}::uuid
    RETURNING ci.public_item_id
  `;
  return rows.length > 0;
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
): Promise<{ collection: AtlasCollectionRow; items: AtlasPublicItemWithAuthorRow[] } | null> {
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
  return { collection, items };
}

// MARK: - Collections: public reads (CDN-cached routes)

export async function listPublicAtlasCollections(
  targetLanguage: AtlasTargetLanguage,
  limit = 60,
): Promise<AtlasPublicCollectionCardRow[]> {
  const sql = requireSql();
  return sql<AtlasPublicCollectionCardRow[]>`
    SELECT ${collectionCardSelect(sql)}
    FROM atlas_collections c
    JOIN profiles pr ON pr.id = c.owner_user_id
    LEFT JOIN atlas_public_items cover ON cover.id = c.cover_public_item_id
    WHERE c.target_language = ${targetLanguage}
      AND c.review_status = 'approved'
    ORDER BY c.published_at DESC
    LIMIT ${Math.min(100, Math.max(1, Math.floor(limit)))}
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
    SET review_status = ${status}, updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function approveAtlasCollection(id: string): Promise<AtlasCollectionRow | null> {
  const sql = requireSql();
  const rows = await sql<AtlasCollectionRow[]>`
    UPDATE atlas_collections
    SET review_status = 'approved',
        published_at = COALESCE(published_at, now()),
        updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  return rows[0] ?? null;
}

export function rejectAtlasCollection(id: string): Promise<AtlasCollectionRow | null> {
  return setAtlasCollectionReviewStatus(id, "rejected");
}

export function takedownAtlasCollection(id: string): Promise<AtlasCollectionRow | null> {
  return setAtlasCollectionReviewStatus(id, "takedown");
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
