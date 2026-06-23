import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAllMasteryWithSchedule, getSettings } from "@/lib/users-db";
import { applyDecay } from "@/lib/mastery";
import { targetLanguageFor } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-user mastery map for the whole dictionary — feeds the iOS 圖鑑 grid and
// word detail level badges. Per-user, so it can't ride the public, CDN-cached
// /api/words endpoints; this stays uncached.
//
// Decay is applied at read (same as the web word page), so the score reflects
// the forgetting curve as of now rather than the last-write value. Guests get
// an empty map → every word renders as 未學 client-side.
export async function GET() {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ items: [] });

  const settings = await getSettings(userId);
  const rows = await getAllMasteryWithSchedule(
    userId,
    targetLanguageFor(settings.learningDirection),
  );
  const now = new Date();
  const items = rows.map((r) => ({
    wordId: r.word_id,
    mastery: Math.round(
      applyDecay(r.mastery, r.last_reviewed_at ? new Date(r.last_reviewed_at) : null, now),
    ),
    // Strict ISO (driver may hand back a non-strict timestamp string); null
    // when the word has no scheduled cards. iOS humanizes client-side.
    nextReviewAt: r.next_review_at ? new Date(r.next_review_at).toISOString() : null,
  }));

  return NextResponse.json({ items });
}
