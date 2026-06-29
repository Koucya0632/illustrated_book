import { NextResponse } from "next/server";
import { getAtlasPublicItem } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const row = await getAtlasPublicItem(slug);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    {
      item: {
        id: row.id,
        slug: row.public_slug,
        lemma: row.lemma,
        displayZhHant: row.display_zh_hant,
        targetLanguage: row.target_language,
        category: row.category,
        imageUrl: atlasPublicImageUrl(row.image_public_path),
        attributionName: row.attribution_name,
        publishedAt: row.published_at,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
