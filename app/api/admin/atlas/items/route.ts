import { NextResponse } from "next/server";
import { listAtlasReviewItems } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get("status") ?? "pending";
  const status =
    rawStatus === "approved" ||
    rawStatus === "rejected" ||
    rawStatus === "takedown" ||
    rawStatus === "pending"
      ? rawStatus
      : "";
  const rows = await listAtlasReviewItems(status);
  const items = await Promise.all(
    rows.map(async (row) => {
      let thumbUrl: string | null = null;
      if (row.thumb_path) {
        try {
          thumbUrl = (await createAtlasImageSignedUrls({
            imagePath: row.thumb_path,
            thumbPath: row.thumb_path,
          })).thumbUrl;
        } catch {
          thumbUrl = null;
        }
      }
      return {
        id: row.id,
        ownerUserId: row.user_id,
        username: row.username,
        lemma: row.lemma,
        displayZhHant: row.display_zh_hant,
        targetLanguage: row.target_language,
        category: row.category,
        reviewStatus: row.review_status,
        visibility: row.visibility,
        thumbUrl,
        updatedAt: row.updated_at,
      };
    }),
  );
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
