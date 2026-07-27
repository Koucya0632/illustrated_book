// Public collection detail: collection meta + author + ordered member items
// (approved members only). Powers the MOJi-style 目錄/簡介 detail page.

import { NextResponse } from "next/server";
import { getPublicAtlasCollection } from "@/lib/atlas-db";
import {
  serializeAtlasPublicCollectionCard,
  serializeAtlasPublicItem,
} from "@/lib/atlas/public-serialize";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const detail = await getPublicAtlasCollection(slug);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    {
      collection: serializeAtlasPublicCollectionCard(detail.collection),
      items: detail.items.map(serializeAtlasPublicItem),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60",
      },
    },
  );
}
