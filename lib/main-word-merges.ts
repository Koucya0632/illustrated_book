import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type MainWordMerge = Readonly<{
  sourceId: string;
  targetId: string;
  reason: string;
}>;

/**
 * Curated duplicate concepts that must collapse to one public main-word row.
 *
 * The source row is archived instead of deleted so its old metadata remains
 * available for rollback and historical inspection. User-owned progress is
 * moved to the target before the source cards are removed.
 */
export const MAIN_WORD_MERGES: readonly MainWordMerge[] = [
  {
    sourceId: "frying-pan",
    targetId: "pan",
    reason: "Both rows display as フライパン / 平底鍋 in the Japanese atlas.",
  },
];

/**
 * Applies curated main-word merges transactionally and idempotently.
 * Already archived or absent source rows are left untouched.
 */
export async function applyMainWordMerges(sql: Sql): Promise<number> {
  let merged = 0;

  await sql.begin(async (tx) => {
    for (const entry of MAIN_WORD_MERGES) {
      const sourceRows = await tx<{ id: string }[]>`
        SELECT id
        FROM words
        WHERE id = ${entry.sourceId}
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (sourceRows.length === 0) continue;

      const targetRows = await tx<{ id: string }[]>`
        SELECT id
        FROM words
        WHERE id = ${entry.targetId}
          AND status = 'published'
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (targetRows.length === 0) {
        throw new Error(
          `Cannot merge main word ${entry.sourceId}: target ${entry.targetId} is not published`,
        );
      }

      const missingTargetCards = await tx<{ deckKey: string }[]>`
        SELECT source_card.deck_key AS "deckKey"
        FROM cards source_card
        LEFT JOIN cards target_card
          ON target_card.word_id = ${entry.targetId}
         AND target_card.deck_key = source_card.deck_key
        WHERE source_card.word_id = ${entry.sourceId}
          AND target_card.id IS NULL
      `;
      if (missingTargetCards.length > 0) {
        throw new Error(
          `Cannot merge main word ${entry.sourceId}: target ${entry.targetId} lacks card deck(s) ${missingTargetCards
            .map((row) => row.deckKey)
            .join(", ")}`,
        );
      }

      // Preserve SRS state. If the learner studied both duplicate entries,
      // keep the schedule from the most recently updated state while adding
      // the counters from both histories.
      await tx`
        INSERT INTO user_cards (
          user_id,
          card_id,
          status,
          interval_days,
          next_review_at,
          review_count,
          mistake_count,
          last_rating,
          last_reviewed_at,
          updated_at,
          created_at
        )
        SELECT
          source_state.user_id,
          target_card.id,
          source_state.status,
          source_state.interval_days,
          source_state.next_review_at,
          source_state.review_count,
          source_state.mistake_count,
          source_state.last_rating,
          source_state.last_reviewed_at,
          source_state.updated_at,
          source_state.created_at
        FROM user_cards source_state
        JOIN cards source_card
          ON source_card.id = source_state.card_id
         AND source_card.word_id = ${entry.sourceId}
        JOIN cards target_card
          ON target_card.word_id = ${entry.targetId}
         AND target_card.deck_key = source_card.deck_key
        ON CONFLICT (user_id, card_id) DO UPDATE SET
          status = CASE
            WHEN EXCLUDED.updated_at >= user_cards.updated_at THEN EXCLUDED.status
            ELSE user_cards.status
          END,
          interval_days = CASE
            WHEN EXCLUDED.updated_at >= user_cards.updated_at THEN EXCLUDED.interval_days
            ELSE user_cards.interval_days
          END,
          next_review_at = CASE
            WHEN EXCLUDED.updated_at >= user_cards.updated_at THEN EXCLUDED.next_review_at
            ELSE user_cards.next_review_at
          END,
          review_count = user_cards.review_count + EXCLUDED.review_count,
          mistake_count = user_cards.mistake_count + EXCLUDED.mistake_count,
          last_rating = CASE
            WHEN EXCLUDED.updated_at >= user_cards.updated_at THEN EXCLUDED.last_rating
            ELSE user_cards.last_rating
          END,
          last_reviewed_at = CASE
            WHEN user_cards.last_reviewed_at IS NULL THEN EXCLUDED.last_reviewed_at
            WHEN EXCLUDED.last_reviewed_at IS NULL THEN user_cards.last_reviewed_at
            ELSE GREATEST(user_cards.last_reviewed_at, EXCLUDED.last_reviewed_at)
          END,
          updated_at = GREATEST(user_cards.updated_at, EXCLUDED.updated_at),
          created_at = LEAST(user_cards.created_at, EXCLUDED.created_at)
      `;

      await tx`
        INSERT INTO user_words (
          user_id,
          word_id,
          mastery,
          last_reviewed_at,
          review_count,
          updated_at,
          target_language
        )
        SELECT
          user_id,
          ${entry.targetId},
          mastery,
          last_reviewed_at,
          review_count,
          updated_at,
          target_language
        FROM user_words
        WHERE word_id = ${entry.sourceId}
        ON CONFLICT (user_id, word_id, target_language) DO UPDATE SET
          mastery = GREATEST(user_words.mastery, EXCLUDED.mastery),
          last_reviewed_at = CASE
            WHEN user_words.last_reviewed_at IS NULL THEN EXCLUDED.last_reviewed_at
            WHEN EXCLUDED.last_reviewed_at IS NULL THEN user_words.last_reviewed_at
            ELSE GREATEST(user_words.last_reviewed_at, EXCLUDED.last_reviewed_at)
          END,
          review_count = user_words.review_count + EXCLUDED.review_count,
          updated_at = GREATEST(user_words.updated_at, EXCLUDED.updated_at)
      `;
      await tx`DELETE FROM user_words WHERE word_id = ${entry.sourceId}`;

      await tx`
        INSERT INTO user_favorites (user_id, word_id, created_at)
        SELECT user_id, ${entry.targetId}, created_at
        FROM user_favorites
        WHERE word_id = ${entry.sourceId}
        ON CONFLICT (user_id, word_id) DO UPDATE SET
          created_at = LEAST(user_favorites.created_at, EXCLUDED.created_at)
      `;
      await tx`DELETE FROM user_favorites WHERE word_id = ${entry.sourceId}`;

      await tx`
        INSERT INTO user_learned (user_id, word_id, learned_at, target_language)
        SELECT user_id, ${entry.targetId}, learned_at, target_language
        FROM user_learned
        WHERE word_id = ${entry.sourceId}
        ON CONFLICT (user_id, word_id, target_language) DO UPDATE SET
          learned_at = LEAST(user_learned.learned_at, EXCLUDED.learned_at)
      `;
      await tx`DELETE FROM user_learned WHERE word_id = ${entry.sourceId}`;

      await tx`
        UPDATE study_reports report
        SET
          word_id = ${entry.targetId},
          card_id = target_card.id,
          updated_at = now()
        FROM cards source_card
        JOIN cards target_card
          ON target_card.word_id = ${entry.targetId}
         AND target_card.deck_key = source_card.deck_key
        WHERE report.card_id = source_card.id
          AND source_card.word_id = ${entry.sourceId}
      `;
      await tx`
        UPDATE study_reports
        SET word_id = ${entry.targetId}, updated_at = now()
        WHERE word_id = ${entry.sourceId}
      `;

      await tx`UPDATE events SET word_id = ${entry.targetId} WHERE word_id = ${entry.sourceId}`;
      await tx`
        UPDATE study_logs
        SET word_id = ${entry.targetId}
        WHERE word_id = ${entry.sourceId}
      `;
      await tx`
        UPDATE user_atlas_items
        SET canonical_word_id = ${entry.targetId}, updated_at = now()
        WHERE canonical_word_id = ${entry.sourceId}
      `;

      // Rebuild inbound and outbound concept links with the canonical id.
      // Self-links created by the collapse are intentionally discarded.
      await tx`
        INSERT INTO word_relations (
          source_word_id,
          target_word_id,
          relation_type,
          note,
          created_at
        )
        SELECT
          CASE
            WHEN source_word_id = ${entry.sourceId} THEN ${entry.targetId}
            ELSE source_word_id
          END,
          CASE
            WHEN target_word_id = ${entry.sourceId} THEN ${entry.targetId}
            ELSE target_word_id
          END,
          relation_type,
          note,
          created_at
        FROM word_relations
        WHERE (source_word_id = ${entry.sourceId} OR target_word_id = ${entry.sourceId})
          AND CASE
            WHEN source_word_id = ${entry.sourceId} THEN ${entry.targetId}
            ELSE source_word_id
          END <> CASE
            WHEN target_word_id = ${entry.sourceId} THEN ${entry.targetId}
            ELSE target_word_id
          END
        ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING
      `;
      await tx`
        DELETE FROM word_relations
        WHERE source_word_id = ${entry.sourceId}
           OR target_word_id = ${entry.sourceId}
      `;

      // Cascading user-card deletion is safe now that the states and report
      // references point at the canonical cards.
      await tx`DELETE FROM cards WHERE word_id = ${entry.sourceId}`;
      await tx`
        UPDATE words
        SET status = 'archived', deleted_at = now(), updated_at = now()
        WHERE id = ${entry.sourceId}
      `;

      merged += 1;
    }
  });

  return merged;
}
