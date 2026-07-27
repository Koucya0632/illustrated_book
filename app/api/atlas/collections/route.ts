// Author-side collection endpoints: list the current user's collections (GET)
// and create a draft (POST). Owner-gated by the authenticated user id; RLS on
// atlas_collections is the backstop.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { createAtlasCollection, listMyAtlasCollections, type AtlasMyCollectionRow } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import type { AtlasTargetLanguage } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function targetLanguage(v: unknown): AtlasTargetLanguage | null {
  return v === "en" || v === "ja" ? v : null;
}

function serializeMine(row: AtlasMyCollectionRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    targetLanguage: row.target_language,
    reviewStatus: row.review_status,
    itemCount: row.item_count,
    coverImageUrl: atlasPublicImageUrl(row.cover_image_path),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const rows = await listMyAtlasCollections(userId);
  return NextResponse.json(
    { collections: rows.map(serializeMine) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  let body: { title?: unknown; description?: unknown; targetLanguage?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 60) {
    return NextResponse.json({ error: "invalid title" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
  const lang = targetLanguage(body.targetLanguage);
  if (!lang) return NextResponse.json({ error: "invalid targetLanguage" }, { status: 400 });

  const row = await createAtlasCollection({
    ownerUserId: userId,
    title,
    description,
    targetLanguage: lang,
  });
  return NextResponse.json(
    { collection: serializeMine({ ...row, item_count: 0, cover_image_path: null }) },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
