import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { listAtlasFriendVisibleItems } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 60)));
  const rows = await listAtlasFriendVisibleItems(userId, limit);
  const items = await Promise.all(
    rows.map(async (row) => {
      let thumbUrl: string | null = null;
      if (row.thumb_path) {
        try {
          thumbUrl = (
            await createAtlasImageSignedUrls({
              imagePath: row.thumb_path,
              thumbPath: row.thumb_path,
            })
          ).thumbUrl;
        } catch {
          thumbUrl = null;
        }
      }
      return {
        id: row.id,
        ownerUserId: row.user_id,
        ownerUsername: row.owner_username,
        lemma: row.lemma,
        displayZhHant: row.display_zh_hant,
        targetLanguage: row.target_language,
        category: row.category,
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
