// 物見 search: one query, two shelves — 合集 (title / description / author) and
// the public cards themselves (word or 繁中 gloss). Scoped to the learner's
// direction like the browse feed. Public and CDN-cacheable, same contract as
// /api/atlas/public: no user data in the payload.

import { NextResponse } from "next/server";
import { searchAtlasPublicItems, searchPublicAtlasCollections } from "@/lib/atlas-db";
import {
  serializeAtlasPublicCollectionCard,
  serializeAtlasPublicItem,
} from "@/lib/atlas/public-serialize";
import { parseAtlasSearchQuery } from "@/lib/atlas/public-query";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const parsed = parseAtlasSearchQuery(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { q, lang } = parsed.query;

  const [collections, items] = await Promise.all([
    searchPublicAtlasCollections(q, lang),
    searchAtlasPublicItems(q, lang),
  ]);

  return NextResponse.json(
    {
      query: q,
      collections: collections.map(serializeAtlasPublicCollectionCard),
      items: items.map(serializeAtlasPublicItem),
    },
    {
      // Same short edge TTL as the collections feed: a just-published 合集
      // should be findable within a minute.
      headers: { "Cache-Control": "public, s-maxage=60" },
    },
  );
}
