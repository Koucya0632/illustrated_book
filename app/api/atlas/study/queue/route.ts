import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { fetchAtlasDue } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
  const modeParam = (searchParams.get("mode") ?? "both").trim();
  const mode = modeParam === "new" || modeParam === "review" ? modeParam : "both";

  // null: the dedicated atlas study page reviews every capture regardless of
  // the current learning direction — each row carries its own target_language.
  const due = await fetchAtlasDue(userId, limit, mode, null);
  const queue = await Promise.all(
    due.map(async (row) => {
      const urls = await createAtlasImageSignedUrls({
        imagePath: row.image.original_path,
        thumbPath: row.image.thumb_path,
      });
      return {
        source: "atlas" as const,
        card: {
          id: row.card.id,
          card_type: row.card.card_type,
          front: row.card.front_text ?? "",
          back: row.card.back,
          explanation: row.card.explanation,
          deck_key: row.card.deck_key,
        },
        state: row.state
          ? {
              status: row.state.status,
              interval_days: row.state.interval_days,
              next_review_at: row.state.next_review_at,
              review_count: row.state.review_count,
              mistake_count: row.state.mistake_count,
            }
          : null,
        item: {
          id: row.item.id,
          lemma: row.item.lemma,
          display_zh_hant: row.item.display_zh_hant,
          target_language: row.item.target_language,
          image_url: urls.imageUrl,
          thumb_url: urls.thumbUrl,
        },
        mastery: Math.round(row.mastery),
      };
    }),
  );

  return NextResponse.json(
    {
      queue,
      stats: {
        returned: queue.length,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
