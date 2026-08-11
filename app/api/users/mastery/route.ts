import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAllMasteryWithSchedule, getSettings } from "@/lib/users-db";
import { getAllAtlasMasteryWithSchedule, getSavedCommunityMastery } from "@/lib/atlas-db";
import { applyDecay } from "@/lib/mastery";
import { targetLanguageFor } from "@/lib/settings";
import { readLearningDirection } from "@/lib/cache-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-user mastery map for the whole dictionary — feeds the iOS 圖鑑 grid and
// word detail level badges. Per-user, so it can't ride the public, CDN-cached
// /api/words endpoints; this stays uncached.
//
// Decay is applied at read (same as the web word page), so the score reflects
// the forgetting curve as of now rather than the last-write value. Guests get
// an empty map → every word renders as 未學 client-side.
export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ items: [] });

  const settings = await getSettings(userId);
  // Direction follows the caller when it states one: mastery lives in a
  // per-direction namespace, and the client re-fetches this the instant the
  // user switches 學習語言 — ahead of the debounced settings POST. Reading only
  // the stored setting handed back the old language's scores, and the client
  // caches them for 30s, so 圖鑑 badges stayed on the deck you just left.
  // Same rule as ?lang= on /api/study/queue.
  const direction = readLearningDirection(req, settings.learningDirection);
  const targetLanguage = targetLanguageFor(direction);
  const [rows, atlasRows, savedRows] = await Promise.all([
    getAllMasteryWithSchedule(userId, targetLanguage),
    getAllAtlasMasteryWithSchedule(userId, targetLanguage),
    getSavedCommunityMastery(userId, targetLanguage),
  ]);
  const now = new Date();
  const decayedAt = (mastery: number, lastReviewedAt: string | null) =>
    Math.round(applyDecay(mastery, lastReviewedAt ? new Date(lastReviewedAt) : null, now));
  // Strict ISO (driver may hand back a non-strict timestamp string); null
  // when the word has no scheduled cards. iOS humanizes client-side.
  const isoOrNull = (value: string | null) => (value ? new Date(value).toISOString() : null);
  const items = [
    ...rows.map((r) => ({
      wordId: r.word_id,
      mastery: decayedAt(r.mastery, r.last_reviewed_at),
      nextReviewAt: isoOrNull(r.next_review_at),
    })),
    // Custom 自制圖鑑 words show in the 圖鑑 grid + detail as `atlas:<itemId>`,
    // but their mastery lives in user_atlas_item_mastery (not user_words). Fold
    // it in under the same id the client looks up, else custom cards always
    // render 未學 and studying them never moves the badge.
    ...atlasRows.map((r) => ({
      wordId: `atlas:${r.item_id}`,
      mastery: decayedAt(r.mastery, r.last_reviewed_at),
      nextReviewAt: isoOrNull(r.next_review_at),
    })),
    // Saved 社群圖鑑 items show as `saved:<slug>` and their mastery lives per
    // CARD in atlas_saved_cards — a third namespace. Without this the community
    // theme renders a grid of 0% over words the user has been reviewing all
    // week, which reads as "studying this does nothing".
    //
    // The schedule comes from the same rows. It used to be hard-coded null,
    // which meant a saved word could be due tomorrow and still show no
    // countdown anywhere in the app — the one namespace of the three that
    // silently had none.
    ...savedRows.map((r) => ({
      wordId: `saved:${r.slug}`,
      mastery: decayedAt(r.mastery, r.last_reviewed_at),
      nextReviewAt: isoOrNull(r.next_review_at),
    })),
  ];

  return NextResponse.json({ items });
}
