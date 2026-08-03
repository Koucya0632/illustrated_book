// Submit → machine gate → auto-publish or human queue.
// (docs/COMMUNITY_ATLAS_PLAN.md §5, docs/COMMUNITY_ATLAS_DEV_PLAN.md Step 3)
//
// This is the piece that removes the per-item human bottleneck: a clean
// submission becomes publicly visible immediately, a risky one waits for a
// human, and the classifiers' reasoning is written to atlas_moderation_events
// so thresholds can be tuned from real data.
//
// Same publish mechanics as the admin approve action — copying the thumb into
// the public bucket and inserting into atlas_public_items — so both paths
// produce identical public rows.

import "server-only";
import {
  approveAtlasPublicItem,
  getAtlasImage,
  recordAtlasModerationEvent,
  setAtlasItemReviewStatus,
} from "../atlas-db";
import { downloadAtlasObject, publishAtlasShareImage } from "./storage";
import {
  runAtlasImageModeration,
  runAtlasTextModeration,
  decideAtlasModeration,
  type AtlasModerationHit,
} from "./moderation";
import type { AtlasItemRow } from "./types";

export interface AtlasSubmitOutcome {
  /** Final review status persisted for the item. */
  reviewStatus: "approved" | "pending_review" | "rejected";
  /** True when the item is publicly visible right now. */
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
 * Runs the machine gate for a freshly submitted item and applies the outcome.
 *
 * Never throws: any unexpected failure leaves the item in the human queue
 * (fail-closed), because the alternative — publishing unscreened content — is
 * irreversible once seen.
 */
export async function processAtlasSubmission(
  item: AtlasItemRow,
  options: { deferPublication?: boolean } = {},
): Promise<AtlasSubmitOutcome> {
  let hits: AtlasModerationHit[] = [];
  let degraded = false;
  let thumbPath: string | null = null;

  try {
    const image = await getAtlasImage(item.user_id, item.image_id);
    thumbPath = image?.thumb_path ?? null;
    if (!thumbPath) {
      degraded = true;
    } else {
      const bytes = await downloadAtlasObject(thumbPath);
      const imageOutcome = await runAtlasImageModeration(bytes);
      hits = imageOutcome.hits;
      degraded = imageOutcome.degraded;
    }
  } catch {
    degraded = true;
  }

  // Text fields ride along with the image; a clean photo with a spam caption
  // still needs a human. The author's name is not among them: it is screened
  // once at the 公開作者身分 step, not per submission.
  hits = hits.concat(
    runAtlasTextModeration([item.lemma, item.display_zh_hant, item.note_zh_hant]),
  );

  const decision = decideAtlasModeration(hits, { degraded });
  const categories = [...new Set(decision.hits.map((h) => h.category))];

  await recordAtlasModerationEvent({
    itemId: item.id,
    phase: "auto",
    verdict: decision.verdict,
    categories,
    scores: toScores(decision.hits),
    actor: degraded ? "auto:degraded" : "auto",
  });

  if (decision.reviewStatus !== "approved") {
    await setAtlasItemReviewStatus(item.id, decision.reviewStatus);
    return { reviewStatus: decision.reviewStatus, published: false, categories };
  }

  // A collection batch first reviews every member. Do not copy any image into
  // public storage until all member decisions are clean.
  if (options.deferPublication) {
    await setAtlasItemReviewStatus(item.id, "approved");
    return { reviewStatus: "approved", published: false, categories };
  }

  // Clean → publish now. thumbPath is guaranteed non-null here: a missing thumb
  // sets degraded, which never reaches an approved verdict.
  try {
    if (!thumbPath) throw new Error("missing thumb");

    const published = await publishAtlasShareImage({
      publicItemId: item.public_slug ?? item.id,
      privateThumbPath: thumbPath,
    });
    await approveAtlasPublicItem({ itemId: item.id, imagePublicPath: published.path });
    return { reviewStatus: "approved", published: true, categories };
  } catch {
    // Publishing failed after a clean verdict — park it for a human rather
    // than leaving the item in limbo.
    await setAtlasItemReviewStatus(item.id, "pending_review");
    return { reviewStatus: "pending_review", published: false, categories };
  }
}
