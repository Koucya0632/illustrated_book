// The signed-in reader's bookmarked collection shelf, scoped to the current
// learning language and sorted by bookmark time (newest first).

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { listSavedAtlasCollections } from "@/lib/atlas-db";
import { serializeAtlasPublicCollectionCard } from "@/lib/atlas/public-serialize";
import type { AtlasTargetLanguage } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function targetLanguage(v: string | null): AtlasTargetLanguage | null {
  return v === "en" || v === "ja" ? v : null;
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const lang = targetLanguage(searchParams.get("lang"));
  if (!lang) return NextResponse.json({ error: "invalid lang" }, { status: 400 });
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 100)));
  const rows = await listSavedAtlasCollections(userId, lang, limit);
  return NextResponse.json(
    { collections: rows.map(serializeAtlasPublicCollectionCard) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
