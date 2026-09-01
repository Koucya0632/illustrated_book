import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  ANALYTICS_EVENT_MAX_BODY_BYTES,
  parseAnalyticsEvent,
} from "@/lib/analytics-event";
import { clientIpHash, hitRateLimit } from "@/lib/ratelimit";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/request-body";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ ok: true }); // silently no-op without DB

  const hash = clientIpHash(req);
  for (const rule of [
    { bucket: `events:ip:${hash}`, windowSeconds: 60, limit: 120, failClosed: true },
    { bucket: "events:global", windowSeconds: 86_400, limit: 10_000, failClosed: true },
  ]) {
    const rate = await hitRateLimit(rule);
    if (!rate.available) {
      return NextResponse.json({ error: "rate limiter unavailable" }, { status: 503 });
    }
    if (!rate.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }
  }

  let raw: unknown;
  try {
    raw = await readLimitedJson(req, ANALYTICS_EVENT_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "body too large" }, { status: 413 });
    }
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const parsed = parseAnalyticsEvent(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  try {
    await sql`
      INSERT INTO events (type, word_id, category, session_id, ip_hash, platform)
      VALUES (
        ${body.type},
        ${body.wordId},
        ${body.category},
        ${body.sessionId},
        ${hash},
        ${body.platform}
      )
    `;
  } catch (e) {
    // Don't break the user experience on logging failure.
    console.warn("event insert failed", e);
  }

  return NextResponse.json({ ok: true });
}
