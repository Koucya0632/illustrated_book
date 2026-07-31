// Public collection detail: collection meta + author + ordered member items
// (approved members only). Powers the MOJi-style 目錄/簡介 detail page.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { livePublicCollectionModule } from "@/lib/atlas/public-collection-live";
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
  const userId = await getCurrentUserId();
  const result = await livePublicCollectionModule.detail({ slug, userId });
  if (!result.ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    {
      collection: serializeAtlasPublicCollectionCard(result.value.collection),
      items: result.value.items.map(serializeAtlasPublicItem),
      access: result.value.access,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
