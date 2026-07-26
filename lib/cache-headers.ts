// ETag + 304 helpers for public GET endpoints.
//
// `Cache-Control` / `Vercel-CDN-Cache-Control` for these paths is set in
// `next.config.js` — Next.js strips handler-set cache headers when the
// handler reads dynamic input like searchParams.
//
// Per-user endpoints must NOT use these — use `Cache-Control: private,
// no-store` instead.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeUiLang, type UiLang } from "./settings";

export function publicJson(payload: unknown, req: Request): Response {
  const body = JSON.stringify(payload);
  const etag = `"${createHash("sha1").update(body).digest("base64").slice(0, 22)}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ETag: etag,
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
