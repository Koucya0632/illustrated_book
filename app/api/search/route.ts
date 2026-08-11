// Word search. The result set is scoped to a learning direction — the SQL
// resolves ids, then filters them against `getAllCardWords(lang, direction)` —
// so 搜尋日文 and 搜尋英文 return different rows for the same query.
//
// That scope comes from `?lang=` / `?learning=` when the caller sends them, and
// from the caller's stored settings when it does not. Reading only the stored
// settings, as this route used to, had two consequences: a client that had just
// switched 學習語言 kept getting the old direction's rows until its debounced
// settings POST landed, and the response varied per user while the handler
// asked for `Cache-Control: public` — an invitation for a shared cache to hand
// one user's language slice to another. Next strips the directives off a
// searchParam-reading handler but kept the bare `public`, so the grant was live
// in production and the s-maxage that was supposed to bound it was not.
//
// Cache headers now live in next.config.js, split on whether `learning` is
// present: with it the URL is the whole identity and the edge may cache; without
// it the response is per-user and only the requesting device may.

import { searchCardWordsAsync } from "@/lib/data";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  hasExplicitLanguageScope,
  readLang,
  readLearningDirection,
} from "@/lib/cache-headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Per-user settings can still influence the payload (a caller that sends no
// `learning`), so the route must run dynamically rather than be prerendered.
export const dynamic = "force-dynamic";

async function readCallerSettings() {
  const userId = await getCurrentUserId();
  return userId ? await getSettings(userId) : DEFAULT_SETTINGS;
}

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
    // Only look the user up when the request did not say. Shipped iOS builds
    // (≤1.0.4) and any old link send neither param and must keep working.
    const settings = hasExplicitLanguageScope(req)
      ? DEFAULT_SETTINGS
      : await readCallerSettings();

    const results = await searchCardWordsAsync(
      q,
      { limit },
      readLang(req, settings.uiLang),
      readLearningDirection(req, settings.learningDirection),
    );
    return NextResponse.json({ results, query: q, limit });
  } catch (err) {
    console.warn("[api/search] failed", err);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
