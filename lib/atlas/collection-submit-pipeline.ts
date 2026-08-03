// Collection submit → text gate → auto-publish or human queue.
//
// Member images cross the item gate first. This module reviews the collection's
// title/description, then asks the atomic publication gate to expose the set
// only when every member is ready.
//
// Mirrors lib/atlas/submit-pipeline.ts for items. Never throws: any unexpected
// failure leaves the collection in the human queue (fail-closed).

import "server-only";
import {
  publishAtlasCollectionAtomically,
  markAtlasCollectionContentApproved,
  recordAtlasCollectionModerationEvent,
  setAtlasCollectionReviewStatus,
} from "../atlas-db";
import { decideAtlasModeration, runAtlasTextModeration, type AtlasModerationHit } from "./moderation";
import type { AtlasCollectionRow } from "./types";

export interface AtlasCollectionSubmitOutcome {
  /** Final review status persisted for the collection. */
  reviewStatus: "approved" | "pending_review" | "rejected";
  /** True when the collection is publicly visible right now. */
  published: boolean;
  categories: string[];
}

function toScores(hits: AtlasModerationHit[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const hit of hits) {
    out[hit.category] = Math.max(out[hit.category] ?? 0, hit.score);
  }
  return out;
}

/**
 * Runs the text gate for a freshly submitted collection and applies the outcome.
 * A clean title/description auto-publishes; a spam/PII hit waits for a human.
 */
export async function processAtlasCollectionSubmission(
  collection: AtlasCollectionRow,
): Promise<AtlasCollectionSubmitOutcome> {
  let outcome: AtlasCollectionSubmitOutcome;
  try {
    const hits = runAtlasTextModeration([collection.title, collection.description]);
    const decision = decideAtlasModeration(hits);
    const categories = [...new Set(decision.hits.map((h) => h.category))];

    await recordAtlasCollectionModerationEvent({
      collectionId: collection.id,
      phase: "auto",
      verdict: decision.verdict,
      categories,
      scores: toScores(decision.hits),
      actor: "auto",
    });

    if (decision.reviewStatus !== "approved") {
      await setAtlasCollectionReviewStatus(collection.id, decision.reviewStatus);
      return { reviewStatus: decision.reviewStatus, published: false, categories };
    }

    await markAtlasCollectionContentApproved(collection.id);
    const published = await publishAtlasCollectionAtomically(collection.id);
    if (!published) {
      await setAtlasCollectionReviewStatus(collection.id, "pending_review");
      return { reviewStatus: "pending_review", published: false, categories };
    }
    outcome = { reviewStatus: "approved", published: true, categories };
  } catch {
    // Fail closed: park it for a human rather than publishing unscreened text.
    await setAtlasCollectionReviewStatus(collection.id, "pending_review");
    outcome = { reviewStatus: "pending_review", published: false, categories: [] };
  }
  return outcome;
}
