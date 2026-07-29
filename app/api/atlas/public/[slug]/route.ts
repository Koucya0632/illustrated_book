import { NextResponse } from "next/server";
import { getAtlasPublicItem } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const row = await getAtlasPublicItem(slug);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    { item: serializeAtlasPublicItem(row) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
