import { NextResponse } from "next/server";
import { listAtlasPublicItems } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 60)));
  const rows = await listAtlasPublicItems(limit);
  return NextResponse.json(
    {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.public_slug,
        lemma: row.lemma,
        displayZhHant: row.display_zh_hant,
        targetLanguage: row.target_language,
        category: row.category,
        imageUrl: atlasPublicImageUrl(row.image_public_path),
        attributionName: row.attribution_name,
        publishedAt: row.published_at,
      })),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
