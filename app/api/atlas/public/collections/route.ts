// Public collection browse feed, scoped to one learning language. The iOS
// community tab passes the user's current learning direction as `lang`, so the
// list only ever shows collections in the language they're studying.

import { NextResponse } from "next/server";
import { listPublicAtlasCollections } from "@/lib/atlas-db";
import { serializeAtlasPublicCollectionCard } from "@/lib/atlas/public-serialize";
import type { AtlasTargetLanguage } from "@/lib/atlas/types";

export const runtime = "nodejs";

function targetLanguage(v: string | null): AtlasTargetLanguage | null {
  return v === "en" || v === "ja" ? v : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lang = targetLanguage(searchParams.get("lang"));
  if (!lang) return NextResponse.json({ error: "invalid lang" }, { status: 400 });

  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 60)));
  const rows = await listPublicAtlasCollections(lang, limit);
  return NextResponse.json(
    { collections: rows.map(serializeAtlasPublicCollectionCard) },
    {
      // Short edge TTL: this feed changes as authors publish, so a freshly
      // approved collection must surface quickly. Vercel maps s-maxage onto the
      // edge cache; keep it small (no long stale-while-revalidate window that
      // would keep serving a pre-publish empty list). ~30s is plenty for scale.
      headers: {
        "Cache-Control": "public, s-maxage=30",
      },
    },
  );
}
