// What a capture writes onto a 自製圖鑑 item, and the rules that decide it.
//
// These statements used to sit inline in the credit-operation service, next to
// the wallet and the lease fencing. They are not accounting: which columns a
// re-confirm resets, which name lands in which column, what "補充 is done"
// writes and what "we have given up" writes are facts about the item. Every
// function takes the caller's transaction, because the operation's single
// transaction is what makes a debit and its card land together.
//
// No "server-only" and no AI SDK import: the Postgres tests reach this through
// the operation service, and the pure rules below are asked directly.

import type postgres from "postgres";
import { confirmedChineseName } from "./gloss";
import type { AtlasEnrichment, AtlasItemRow, AtlasTargetLanguage } from "./types";
import type { FuriganaSegment } from "../kana";

type Tx = postgres.Sql | postgres.TransactionSql;

/** The names a confirm stores, from the chosen candidate and what the user corrected. */
export interface ConfirmedNames {
  lemma: string;
  displayZhHant: string;
  displayJa: string | null;
  displayEn: string | null;
  /** `candidate` when the user changed nothing the run produced. */
  source: "candidate" | "manual";
}

/**
 * Which name lands in which column.
 *
 * `glossLanguage` is the run's own answer to "does this user read a gloss in
 * ja/en" (see `glossLanguageFor`). When it is null no gloss is stored at all,
 * whatever the client sent — a gloss the run did not ask for is not one the
 * model produced for this user.
 */
export function confirmedNames(input: {
  candidate: { label: string; zh_hant: string; gloss: string | null };
  correction: { lemma?: string; displayZhHant?: string; displayGloss?: string | null };
  glossLanguage: "ja" | "en" | null;
  /** True when the capturing interface is known not to show the Chinese field. */
  chineseFieldHidden: boolean;
}): ConfirmedNames {
  const { candidate, correction, glossLanguage } = input;
  const lemma = correction.lemma ?? candidate.label;
  const displayZhHant = confirmedChineseName({
    lemma, submitted: correction.displayZhHant, candidate, chineseFieldHidden: input.chineseFieldHidden,
  });
  const offered = glossLanguage ? candidate.gloss : null;
  const gloss = glossLanguage ? (correction.displayGloss === undefined ? candidate.gloss : correction.displayGloss) : null;
  return {
    lemma,
    displayZhHant,
    displayJa: glossLanguage === "ja" ? gloss : null,
    displayEn: glossLanguage === "en" ? gloss : null,
    source: lemma === candidate.label && displayZhHant === candidate.zh_hant && gloss === offered ? "candidate" : "manual",
  };
}

/**
 * Create the item for a photo, or re-point the one it already has.
 *
 * A re-confirm is a different card: everything 補充 wrote for the previous
 * name is cleared and its budget restarts, so definitions of the old word can
 * never sit under the new one.
 */
export async function saveConfirmedItem(tx: Tx, input: {
  itemId: string;
  exists: boolean;
  userId: string;
  imageId: string;
  candidateId: string;
  targetLanguage: AtlasTargetLanguage;
  primaryLabel: string;
  names: ConfirmedNames;
  now: Date;
}): Promise<AtlasItemRow> {
  const { names: n } = input;
  const [item] = input.exists
    ? await tx`UPDATE user_atlas_items SET selected_candidate_id = ${input.candidateId},
        target_language = ${input.targetLanguage}, primary_label = ${input.primaryLabel}, lemma = ${n.lemma},
        display_zh_hant = ${n.displayZhHant}, display_ja = ${n.displayJa}, display_en = ${n.displayEn},
        fine_label = NULL, part_of_speech = NULL, cefr_level = NULL, pronunciation = NULL,
        reading = NULL, reading_segments = NULL, category = NULL, taxonomy_path = '{}',
        definition_target = NULL, definition_zh_hant = NULL, definition_ja = NULL, definition_en = NULL,
        example_target = NULL, example_zh_hant = NULL, note_zh_hant = NULL,
        enrichment = '{}'::jsonb, backfill_status = 'pending', backfill_error = NULL,
        backfill_attempts = 0, backfill_attempts_version = 0,
        correction_source = ${n.source}, updated_at = ${input.now}
        WHERE id = ${input.itemId} AND user_id = ${input.userId} RETURNING *`
    : await tx`INSERT INTO user_atlas_items (id, user_id, image_id, selected_candidate_id, target_language,
        primary_label, lemma, display_zh_hant, display_ja, display_en, correction_source)
        VALUES (${input.itemId}, ${input.userId}, ${input.imageId}, ${input.candidateId}, ${input.targetLanguage},
          ${input.primaryLabel}, ${n.lemma}, ${n.displayZhHant}, ${n.displayJa}, ${n.displayEn}, ${n.source})
        RETURNING *`;
  await tx`UPDATE user_atlas_images SET status = 'confirmed', updated_at = ${input.now} WHERE id = ${input.imageId}`;
  return item as AtlasItemRow;
}

/** What one finished 補充 pass produced. `displayZhHant` is set only when the item had no Chinese name. */
export interface EnrichmentFields {
  pronunciation: string | null;
  reading: string | null;
  readingSegments: FuriganaSegment[] | null;
  definitionTarget: string | null;
  definitionZh: string | null;
  definitionJa: string | null;
  definitionEn: string | null;
  displayZhHant?: string | null;
  displayJa: string | null;
  displayEn: string | null;
  enrichment: AtlasEnrichment;
}

/**
 * 補充 is done. Names the user typed at confirm win over generated ones
 * (COALESCE on display_ja / display_en); a generated Chinese name is written
 * only where the pass was asked for one.
 */
export async function writeEnrichment(tx: Tx, input: {
  userId: string; itemId: string; fields: EnrichmentFields; attempt: number; now: Date;
}): Promise<void> {
  const v = input.fields;
  await tx`UPDATE user_atlas_items SET pronunciation = ${v.pronunciation}, reading = ${v.reading},
    reading_segments = ${v.readingSegments ? tx.json(v.readingSegments as never) : null},
    definition_target = ${v.definitionTarget}, definition_zh_hant = ${v.definitionZh},
    definition_ja = ${v.definitionJa}, definition_en = ${v.definitionEn},
    display_zh_hant = COALESCE(${v.displayZhHant || null}, display_zh_hant),
    display_ja = COALESCE(display_ja, ${v.displayJa}), display_en = COALESCE(display_en, ${v.displayEn}),
    enrichment = ${tx.json(v.enrichment as never)}, backfill_status = 'filled', backfill_error = NULL,
    backfill_attempts = ${input.attempt}, backfill_attempts_version = ${v.enrichment.enrichVersion ?? 0},
    updated_at = ${input.now}
    WHERE id = ${input.itemId} AND user_id = ${input.userId}`;
}

/**
 * 補充 will not be tried again for this card: `skipped`, the terminal state
 * (CONTEXT.md — "we have given up on this one"). The card stays whole as
 * name-and-photo. Scoped to the candidate so a card the user has since
 * re-confirmed is left alone.
 */
export async function giveUpEnrichment(tx: Tx, input: {
  itemId: string; candidateId: string; reason: string; attempts: number; version: number; now: Date;
}): Promise<void> {
  await tx`UPDATE user_atlas_items SET backfill_status = 'skipped', backfill_error = ${input.reason},
    backfill_attempts = ${input.attempts}, backfill_attempts_version = ${input.version}, updated_at = ${input.now}
    WHERE id = ${input.itemId} AND selected_candidate_id = ${input.candidateId} AND deleted_at IS NULL`;
}

/**
 * One row per paid model pass that delivered. `imageCount` is explicit because
 * the column defaults to 1: a 補充 pass sends no image, and was being counted
 * as one.
 */
export async function recordAiUsage(tx: Tx, input: {
  userId: string; imageId: string; jobId?: string | null;
  operation: "primary" | "escalated" | "enrich";
  provider: string; model: string | null; imageCount: number;
  usage?: { inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; latencyMs?: number };
}): Promise<void> {
  const u = input.usage;
  await tx`INSERT INTO user_atlas_ai_usage (user_id, job_id, image_id, provider, model, operation,
    input_tokens, output_tokens, image_count, estimated_cost_usd, latency_ms, success)
    VALUES (${input.userId}, ${input.jobId ?? null}, ${input.imageId}, ${input.provider}, ${input.model}, ${input.operation},
      ${u?.inputTokens ?? null}, ${u?.outputTokens ?? null}, ${input.imageCount},
      ${u?.estimatedCostUsd ?? null}, ${u?.latencyMs ?? null}, true)`;
}
