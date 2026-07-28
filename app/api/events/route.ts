import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

// Raw values are the API contract — the iOS side pins them in
// tuji-ios Tuji/Core/Analytics/AnalyticsService.swift (AnalyticsEvent).
const VALID_TYPES = new Set([
  // web (original)
  "view", "favorite", "pronounce",
  // ios (kept small & stable — server-derived metrics live in study_logs etc.)
  "app_open", "study_start", "study_complete",
  "paywall_view", "share_app", "atlas_capture_open",
  // community 圖鑑 funnel (docs/COMMUNITY_ATLAS_PLAN.md §6). These exist to
  // answer one question: do publishers convert to Pro better than
  // non-publishers? Counts only — no ids, no text, no image URLs.
  "atlas_publish_submitted", "atlas_publish_withdrawn",
  "atlas_public_item_viewed", "atlas_public_saved",
  "author_profile_viewed",
]);
const VALID_PLATFORMS = new Set(["web", "ios"]);

async function ipHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "::eepd");
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: true }); // silently no-op without DB

  let body: {
    type?: string;
    wordId?: string;
    category?: string;
    sessionId?: string;
    platform?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const hash = await ipHash(ip);

  // Default (not 400) so pre-platform clients keep working.
  const platform =
    body.platform && VALID_PLATFORMS.has(body.platform) ? body.platform : "web";

  try {
    await sql`
      INSERT INTO events (type, word_id, category, session_id, ip_hash, platform)
      VALUES (
        ${body.type},
        ${body.wordId ?? null},
        ${body.category ?? null},
        ${body.sessionId ?? null},
        ${hash},
        ${platform}
      )
    `;
  } catch (e) {
    // Don't break the user experience on logging failure.
    console.warn("event insert failed", e);
  }

  return NextResponse.json({ ok: true });
}
