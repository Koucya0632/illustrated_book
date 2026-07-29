import type { Rating, Status } from "@/lib/srs";
import type { PublicAuthorColumns } from "@/lib/public-author";

export type AtlasTargetLanguage = "en" | "ja";
export type AtlasImageStatus =
  | "uploaded"
  | "processing"
  | "needs_review"
  | "confirmed"
  | "cards_ready"
  | "failed"
  | "deleted";
export type AtlasJobStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "succeeded"
  | "failed"
  | "cancelled";
export type AtlasRecognitionStage = "primary" | "fine" | "escalated" | "manual";
export type AtlasVisibility = "private" | "friends" | "public" | "unlisted";
/**
 * `pending` is the legacy single review queue. The moderation pipeline
 * (docs/COMMUNITY_ATLAS_PLAN.md §5) splits it: `pending_auto` is awaiting the
 * classifiers, `pending_review` means a classifier flagged it for a human.
 */
export type AtlasReviewStatus =
  | "draft"
  | "pending"
  | "pending_auto"
  | "pending_review"
  | "approved"
  | "rejected"
  /** Moderation removed it. Final — the item may not be submitted again. */
  | "takedown"
  /** The author took it down. Reversible — they may publish it again. */
  | "withdrawn";

/** Which stage produced a moderation event (atlas_moderation_events.phase). */
export type AtlasModerationPhase = "auto" | "report" | "heat" | "admin";

/** Outcome recorded for a moderation event (atlas_moderation_events.verdict). */
export type AtlasModerationVerdict =
  | "approved"
  | "flagged"
  | "rejected"
  | "takedown"
  | "cleared";
export type AtlasCardType = "image_recall" | "word_recall" | "spelling" | "flashcard";
export type AtlasDeckKey = "atlas-image-en" | "atlas-image-ja";

export interface AtlasImageRow {
  id: string;
  user_id: string;
  status: AtlasImageStatus;
  bucket: string;
  original_path: string;
  thumb_path: string;
  recognition_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  sha256: string;
  perceptual_hash: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AtlasRecognitionJobRow {
  id: string;
  user_id: string;
  image_id: string;
  status: AtlasJobStatus;
  strategy: string;
  stage: AtlasRecognitionStage;
  provider: string | null;
  model: string | null;
  detail_level: string | null;
  primary_confidence: number | null;
  fine_confidence: number | null;
  uncertainty_reason: string | null;
  escalated: boolean;
  raw_response: unknown;
  normalized_response: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasCandidateRow {
  id: string;
  user_id: string;
  job_id: string;
  image_id: string;
  level: "primary" | "fine" | "attribute";
  parent_candidate_id: string | null;
  label: string;
  normalized_label: string;
  zh_hant: string | null;
  /// Gloss in the capturing user's UI language (ja/en UIs only).
  gloss: string | null;
  target_term: string | null;
  target_language: AtlasTargetLanguage;
  taxonomy_node_id: string | null;
  confidence: number;
  rank: number;
  source: string;
  bounding_box: unknown;
  metadata: unknown;
  created_at: string;
}

export interface AtlasCandidate {
  label: string;
  normalizedLabel: string;
  zhHant: string | null;
  /// Gloss in the capturing user's UI language; null for Chinese UIs (zhHant
  /// is the gloss there) and when the UI language equals the target language.
  gloss: string | null;
  confidence: number;
  taxonomyNodeId: string | null;
}

export interface AtlasEnrichment {
  synonyms?: string[];
  antonyms?: string[];
  related?: string[];
  forms?: { label: string; value: string }[];
  mnemonic?: string | null;
  etymology?: string | null;
  /// Per-UI-language mnemonic/etymology for ja/en interfaces (zh stays the
  /// top-level fields; zh-Hans is OpenCC-derived). Written by the gloss-pack
  /// step of enrichAtlasItem / the backfill script.
  glossI18n?: Partial<Record<"ja" | "en", { mnemonic?: string | null; etymology?: string | null }>>;
  /// Which language definition_target holds. Absent on rows enriched before JA
  /// target definitions existed (their definition_target is stale English, so
  /// atlasItemToWord suppresses it until a re-enrich stamps this).
  targetDefinitionLang?: AtlasTargetLanguage | null;
  /// enrichAtlasItem output-schema version (see ATLAS_ENRICH_VERSION). Rows
  /// below the current version are re-enriched once on next open.
  enrichVersion?: number;
}

export interface AtlasItemRow {
  id: string;
  user_id: string;
  image_id: string;
  selected_candidate_id: string | null;
  target_language: AtlasTargetLanguage;
  canonical_word_id: string | null;
  primary_label: string;
  fine_label: string | null;
  lemma: string;
  display_zh_hant: string;
  /// Gloss-language variants of display/definition for ja/en interfaces.
  display_ja: string | null;
  display_en: string | null;
  definition_ja: string | null;
  definition_en: string | null;
  part_of_speech: string | null;
  cefr_level: string | null;
  pronunciation: string | null;
  reading: string | null;
  category: string | null;
  taxonomy_path: string[];
  definition_zh_hant: string | null;
  definition_target: string | null;
  example_target: string | null;
  example_zh_hant: string | null;
  note_zh_hant: string | null;
  correction_source: "candidate" | "manual" | "dictionary_match" | "ai_backfill";
  backfill_status: "pending" | "filled" | "failed" | "skipped";
  backfill_error: string | null;
  // Present on full-row reads (SELECT *); omitted by aliased study/sync mappers.
  enrichment?: AtlasEnrichment;
  visibility: AtlasVisibility;
  review_status: AtlasReviewStatus;
  published_at: string | null;
  public_slug: string | null;
  share_image_path: string | null;
  cdn_cache_key: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AtlasCardRow {
  id: string;
  user_id: string;
  item_id: string;
  image_id: string;
  deck_key: AtlasDeckKey;
  card_type: AtlasCardType;
  front_text: string | null;
  front_image_path: string | null;
  back: string;
  explanation: string | null;
  tags: string[];
  metadata: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AtlasCardStateRow {
  user_id: string;
  card_id: string;
  status: Status;
  interval_days: number;
  next_review_at: string;
  review_count: number;
  mistake_count: number;
  last_rating: Rating | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasMasteryRow {
  user_id: string;
  item_id: string;
  target_language: AtlasTargetLanguage;
  mastery: number;
  last_reviewed_at: string | null;
  review_count: number;
  updated_at: string;
}

export interface AtlasPublicItemRow {
  id: string;
  source_item_id: string;
  owner_user_id: string;
  public_slug: string;
  lemma: string;
  display_zh_hant: string;
  target_language: AtlasTargetLanguage;
  category: string | null;
  image_public_path: string | null;
  /**
   * @deprecated Dead column. Author identity is resolved by joining `profiles`
   * (see AtlasPublicItemAuthorColumns) so a rename updates every past item at
   * once; a snapshot would split one author into several names. Kept only
   * because dropping a column is not worth a migration on unshipped data.
   */
  attribution_name: string | null;
  review_status: "approved" | "takedown" | "withdrawn";
  published_at: string;
  updated_at: string;
}

/**
 * A public item carrying its author — the only shape the public API
 * serializes. `owner_user_id` was always the real link; the joined columns are
 * what `publicAuthor()` is allowed to show, and only once the user confirmed.
 */
export type AtlasPublicItemWithAuthorRow = AtlasPublicItemRow & PublicAuthorColumns;

export interface AtlasImageWithUrls {
  id: string;
  status: AtlasImageStatus;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  thumbUrl: string;
  imageUrl: string;
}

export interface AtlasCardState {
  status: Status;
  intervalDays: number;
  nextReviewAt: string;
  reviewCount: number;
  mistakeCount: number;
}

export interface AtlasDueCard {
  card: AtlasCardRow;
  state: AtlasCardStateRow | null;
  item: AtlasItemRow;
  image: AtlasImageRow;
  mastery: number;
}

// Community collections (合集): a user-authored, named grouping over their own
// approved public items. See scripts/migrate.ts (atlas_collections).
export type AtlasCollectionReviewStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  /** Moderation removed it. Final. */
  | "takedown"
  /** The author took it down. Reversible. */
  | "withdrawn";

export interface AtlasCollectionRow {
  id: string;
  owner_user_id: string;
  slug: string;
  title: string;
  description: string | null;
  target_language: AtlasTargetLanguage;
  cover_public_item_id: string | null;
  review_status: AtlasCollectionReviewStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}
