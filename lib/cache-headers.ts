// ETag + 304 helpers for public GET endpoints.
//
// Most static public routes use `next.config.js`. Catalogue routes pass
// `cacheCatalogue` so only successes and 304s are cacheable; a fixed config
// header would also overwrite no-store on an error response.
//
// Per-user endpoints must NOT use these — use `Cache-Control: private,
// no-store` instead.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeUiLang, type UiLang } from "./settings";

export const CATALOGUE_CLIENT_CACHE = "public, max-age=60";
export const CATALOGUE_EDGE_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

export function publicJson(payload: unknown, req: Request, cacheCatalogue = false, noStore = false): Response {
  const body = JSON.stringify(payload);
  const etag = `"${createHash("sha1").update(body).digest("base64").slice(0, 22)}"`;
  const cacheHeaders: Record<string, string> = noStore ? {
    "Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  } : cacheCatalogue ? {
    "Cache-Control": CATALOGUE_CLIENT_CACHE,
    "Vercel-CDN-Cache-Control": CATALOGUE_EDGE_CACHE,
  } : {};

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, ...cacheHeaders } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
      ...cacheHeaders,
    },
  });
}

export function readLang(req: Request, fallback: UiLang = "zh-Hant"): UiLang {
  const raw = new URL(req.url).searchParams.get("lang");
  return raw == null ? fallback : normalizeUiLang(raw);
}

export function readLearningDirection(
  req: Request,
  fallback: "zh-en" | "zh-ja" = "zh-en",
): "zh-en" | "zh-ja" {
  const raw = new URL(req.url).searchParams.get("learning");
  return raw === "zh-en" || raw === "zh-ja" ? raw : fallback;
}

/**
 * Whether the request states its own language scope, so no fallback to the
 * caller's stored settings is needed.
 *
 * Presence, not validity: a bad `learning=klingon` still says the caller
 * intended to scope itself, and `readLearningDirection` clamps it. The
 * distinction decides two things at once — whether the route pays for a user
 * lookup, and whether the URL is a complete cache key. Anything reading this
 * for the second reason must agree with the response's caching decision.
 */
export function hasExplicitLanguageScope(req: Request): boolean {
  const params = new URL(req.url).searchParams;
  return params.has("lang") && params.has("learning");
}
