import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { refuseLegacyAtlasWrite } from "@/lib/credits/legacy-server";
import { listAtlasImages } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";
import type { AtlasImageRow } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serializeImage(row: AtlasImageRow) {
  const urls = await createAtlasImageSignedUrls({
    imagePath: row.original_path,
    thumbPath: row.thumb_path,
  });
  return {
    id: row.id,
    status: row.status,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageUrl: urls.imageUrl,
    thumbUrl: urls.thumbUrl,
  };
}

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 30)));
  const rows = await listAtlasImages(userId, limit);
  const images = await Promise.all(rows.map(serializeImage));
  return NextResponse.json(
    { images },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// Retired: a photo is uploaded through POST /api/ai/images and recognised as a
// credit operation. See refuseLegacyAtlasWrite for what a released app receives.
export async function POST() {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return refuseLegacyAtlasWrite(userId);
}
