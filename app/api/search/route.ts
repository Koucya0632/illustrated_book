import { NextResponse } from "next/server";
import { searchWordsAsync } from "@/lib/data";

export const runtime = "nodejs";

// Cache search responses at the edge for 60s, allowing 5min stale-while-revalidate.
// Search results follow the same data freshness contract as getAllWords() (60s tag).
export const revalidate = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(limitRaw, 100))
    : 50;

  if (!q) {
    return NextResponse.json({ results: [], query: "", limit });
  }

  try {
    const results = await searchWordsAsync(q, { limit });
    return NextResponse.json(
      { results, query: q, limit },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.warn("[api/search] failed", err);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
