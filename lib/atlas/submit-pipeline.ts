// The machine gate for one submitted item (docs/COMMUNITY_ATLAS_PLAN.md §5):
// image classifiers on its thumbnail plus the text gate on its names.
//
// Only the screening lives here. What the verdict does — publish now, wait for
// a human, approve for a 合集 — is the publication lifecycle's
// (lib/atlas/publication.ts), which receives this as its `screen` port.
//
// Fails closed: an unreadable thumbnail or a classifier failure is `degraded`,
// which never reaches an approved verdict.

import "server-only";
import { getAtlasImage } from "../atlas-db";
import { downloadAtlasObject } from "./storage";
import {
  runAtlasImageModeration,
  runAtlasTextModeration,
  decideAtlasModeration,
  type AtlasModerationHit,
} from "./moderation";
import type { ScreenDecision } from "./publication";
import type { AtlasItemRow } from "./types";

function toScores(hits: AtlasModerationHit[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const hit of hits) {
    out[hit.category] = Math.max(out[hit.category] ?? 0, hit.score);
  }
  return out;
}

export async function screenAtlasItem(item: AtlasItemRow): Promise<ScreenDecision> {
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
  hits = hits.concat(runAtlasTextModeration([item.lemma, item.display_zh_hant, item.note_zh_hant]));

  const decision = decideAtlasModeration(hits, { degraded });
  return {
    reviewStatus: decision.reviewStatus,
    verdict: decision.verdict,
    categories: [...new Set(decision.hits.map((h) => h.category))],
    scores: toScores(decision.hits),
    degraded,
    thumbPath,
  };
}
