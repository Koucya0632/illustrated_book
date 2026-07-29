import { NextResponse } from "next/server";
import { listAtlasPublicItems } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 60)));
  const rows = await listAtlasPublicItems(limit);
  return NextResponse.json(
    { items: rows.map(serializeAtlasPublicItem) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
