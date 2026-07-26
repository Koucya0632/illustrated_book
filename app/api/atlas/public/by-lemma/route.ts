// Community aggregation feed for a single word (docs/COMMUNITY_ATLAS_PLAN.md §1).
//
// The word detail page asks "who else published this lemma?" — this returns the
// approved public items teaching that lemma in that target language. Public and
// CDN-cacheable, same contract as /api/atlas/public: no user data in the payload.

import { NextResponse } from "next/server";
import { listAtlasPublicItemsByLemma } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import { parseAtlasByLemmaQuery } from "@/lib/atlas/public-query";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const parsed = parseAtlasByLemmaQuery(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { lemma, lang, limit } = parsed.query;

  const rows = await listAtlasPublicItemsByLemma(lemma, lang, limit);

  return NextResponse.json(
    {
      lemma,
      targetLanguage: lang,
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
