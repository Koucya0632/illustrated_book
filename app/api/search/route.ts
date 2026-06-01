import { NextResponse } from "next/server";
import { searchCardWordsAsync } from "@/lib/data";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export const runtime = "nodejs";
// Per-user UI language now influences the response payload, so the route
// must run dynamically rather than be edge-cached blindly.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  // Ceiling matches DAILY_GOAL_MAX-style upper bound: SearchClient's "顯示
  // 更多" path may bump limit by 50 each click up to 200.
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(limitRaw, 200))
    : 50;

  if (!q) {
    return NextResponse.json({ results: [], query: "", limit });
  }

  try {
    const userId = await getCurrentUserId();
    const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
    const results = await searchCardWordsAsync(q, { limit }, lang);
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
