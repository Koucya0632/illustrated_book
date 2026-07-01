// Postgres fixed-window rate limiter. One row per (bucket, window) in
// ratelimit_hits; each hit atomically increments the counter and reports
// whether the caller is still within limit. No Redis — the atlas AI cost
// guards run at low volume, so a single upsert per call is plenty.
//
// Fails OPEN: if the DB is unavailable or the query errors, callers are allowed
// through. A limiter outage must never take the product down; the global daily
// cap is the backstop for runaway cost.

import { createHash } from "crypto";
import { getSql } from "@/lib/db";

export interface RateRule {
  /** Stable key, e.g. `atlas-ai:user:<uuid>`. */
  bucket: string;
  windowSeconds: number;
  limit: number;
}

export interface RateResult {
  ok: boolean;
  bucket: string;
  count: number;
  limit: number;
  /** Seconds until the current window rolls over. */
  retryAfterSeconds: number;
}

/** Start of the fixed window containing `nowMs`. */
function windowStart(nowMs: number, windowSeconds: number): Date {
  const w = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / w) * w);
}

/**
 * Atomically increment the counter for `rule`'s current window and report
 * whether the caller is still within limit. Counts attempts (increment-before),
 * which is the correct semantics for a cost guard — a blocked or failed call
 * still consumes its slot.
 */
export async function hitRateLimit(rule: RateRule): Promise<RateResult> {
  const now = Date.now();
  const start = windowStart(now, rule.windowSeconds);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((start.getTime() + rule.windowSeconds * 1000 - now) / 1000),
  );
  const base: RateResult = {
    ok: true,
    bucket: rule.bucket,
    count: 0,
    limit: rule.limit,
    retryAfterSeconds,
  };

  const sql = getSql();
  if (!sql) return base; // fail open without a DB

  try {
    const rows = await sql<{ count: number }[]>`
      INSERT INTO ratelimit_hits (bucket, window_start, count)
      VALUES (${rule.bucket}, ${start}, 1)
      ON CONFLICT (bucket, window_start)
      DO UPDATE SET count = ratelimit_hits.count + 1
      RETURNING count
    `;
    const count = rows[0]?.count ?? 1;
    return { ...base, ok: count <= rule.limit, count };
  } catch (err) {
    console.warn("[ratelimit] hit failed, allowing through", err);
    return base; // fail open on error
  }
}

/** Short, non-reversible hash of the client IP for per-IP buckets. */
export function clientIpHash(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function intEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const DAY_SECONDS = 86_400;

export type AtlasAiLimitScope = "daily_user" | "ip_burst" | "global";

export interface AtlasAiLimitDecision {
  ok: boolean;
  scope?: AtlasAiLimitScope;
  /** User-facing (zh-Hant) copy the client can show verbatim. */
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * Guard an atlas AI recognition call against three windows: per-user daily,
 * per-IP per-minute, and a global daily backstop. Returns the first violation
 * (or ok) so the route can 429 / soft-skip. Limits are env-tunable:
 *   ATLAS_AI_DAILY_PER_USER, ATLAS_AI_PER_MINUTE_PER_IP, ATLAS_AI_DAILY_GLOBAL.
 */
export async function checkAtlasAiRateLimit(ctx: {
  userId: string;
  ipHash: string;
}): Promise<AtlasAiLimitDecision> {
  const rules: { scope: AtlasAiLimitScope; message: string; rule: RateRule }[] = [
    {
      scope: "daily_user",
      message: "今日 AI 辨識次數已達上限，請明天再試。",
      rule: {
        bucket: `atlas-ai:user:${ctx.userId}`,
        windowSeconds: DAY_SECONDS,
        limit: intEnv("ATLAS_AI_DAILY_PER_USER", 40),
      },
    },
    {
      scope: "ip_burst",
      message: "操作太頻繁，請稍後再試。",
      rule: {
        bucket: `atlas-ai:ip:${ctx.ipHash}`,
        windowSeconds: 60,
        limit: intEnv("ATLAS_AI_PER_MINUTE_PER_IP", 12),
      },
    },
    {
      scope: "global",
      message: "系統忙碌中，請稍後再試。",
      rule: {
        bucket: "atlas-ai:global",
        windowSeconds: DAY_SECONDS,
        limit: intEnv("ATLAS_AI_DAILY_GLOBAL", 5000),
      },
    },
  ];

  for (const entry of rules) {
    const res = await hitRateLimit(entry.rule);
    if (!res.ok) {
      return {
        ok: false,
        scope: entry.scope,
        message: entry.message,
        retryAfterSeconds: res.retryAfterSeconds,
      };
    }
  }
  return { ok: true };
}

/** Drop counter rows for windows that have long since rolled over. */
export async function cleanupOldRateLimitHits(olderThanDays = 2): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const res = await sql`
    DELETE FROM ratelimit_hits
    WHERE window_start < now() - make_interval(days => ${olderThanDays})
  `;
  return res.count ?? 0;
}
