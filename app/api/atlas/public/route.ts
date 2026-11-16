import { NextResponse } from "next/server";
import { listAtlasPublicItems } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";
import { parseIntParam } from "@/lib/http/int-param";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseIntParam(searchParams.get("limit"), 60);
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
