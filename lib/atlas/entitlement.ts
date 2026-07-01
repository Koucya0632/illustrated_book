// Atlas Free/Pro entitlement + usage + enforcement. Server is the authority:
// the client mirrors this for UI but every write path re-checks here.
//
// Two limits per tier:
//   - maxItems:            capacity of the 自製圖鑑 (enforced at confirm)
//   - dailyAiRecognitions: AI recognitions per UTC day (enforced at upload /
//                          recognize; counted from user_atlas_ai_usage)
// null limit = unlimited (Pro). Limits are env-tunable; see atlasLimitsForTier.
//
// Fails OPEN: any DB error resolves to free-tier limits but allows the action,
// so an entitlement outage never hard-blocks the product. The abuse backstops
// in lib/ratelimit.ts remain the runaway-cost guard.

import { getSql } from "@/lib/db";
import { checkAtlasAiBackstops } from "@/lib/ratelimit";

export type AtlasTier = "free" | "pro";

export interface AtlasLimits {
  /** null = unlimited. */
  maxItems: number | null;
  /** null = unlimited. */
  dailyAiRecognitions: number | null;
}

export interface AtlasUsage {
  itemCount: number;
  aiRecognitionsToday: number;
}

export interface AtlasEntitlementSnapshot {
  tier: AtlasTier;
  limits: AtlasLimits;
  usage: AtlasUsage;
}

/** Env override where a non-positive value means "unlimited" (null). */
function limitEnv(name: string, fallback: number): number | null {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(n)) return fallback <= 0 ? null : fallback;
  return n <= 0 ? null : n;
}

export function atlasLimitsForTier(tier: AtlasTier): AtlasLimits {
  if (tier === "pro") {
    return {
      maxItems: limitEnv("ATLAS_PRO_MAX_ITEMS", 0), // 0 => unlimited
      dailyAiRecognitions: limitEnv("ATLAS_PRO_DAILY_AI", 100),
    };
  }
  return {
    maxItems: limitEnv("ATLAS_FREE_MAX_ITEMS", 30),
    dailyAiRecognitions: limitEnv("ATLAS_FREE_DAILY_AI", 10),
  };
}

/** Effective tier: an expired Pro row lapses back to free. */
export async function getAtlasTier(userId: string): Promise<AtlasTier> {
  const sql = getSql();
  if (!sql) return "free";
  try {
    const rows = await sql<{ tier: string; expires_at: string | null }[]>`
      SELECT tier, expires_at
      FROM user_entitlements
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || row.tier !== "pro") return "free";
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return "free";
    return "pro";
  } catch (err) {
    console.warn("[entitlement] tier lookup failed, defaulting free", err);
    return "free";
  }
}

export async function getAtlasUsage(userId: string): Promise<AtlasUsage> {
  const sql = getSql();
  if (!sql) return { itemCount: 0, aiRecognitionsToday: 0 };
  try {
    const [items, ai] = await Promise.all([
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_items
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL
      `,
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_ai_usage
        WHERE user_id = ${userId}::uuid AND created_at >= date_trunc('day', now())
      `,
    ]);
    return {
      itemCount: items[0]?.count ?? 0,
      aiRecognitionsToday: ai[0]?.count ?? 0,
    };
  } catch (err) {
    console.warn("[entitlement] usage lookup failed", err);
    return { itemCount: 0, aiRecognitionsToday: 0 };
  }
}

export async function getAtlasEntitlement(userId: string): Promise<AtlasEntitlementSnapshot> {
  const [tier, usage] = await Promise.all([getAtlasTier(userId), getAtlasUsage(userId)]);
  return { tier, limits: atlasLimitsForTier(tier), usage };
}

/** Write the authoritative entitlement (StoreKit verify / App Store notifications). */
export async function upsertAtlasEntitlement(input: {
  userId: string;
  tier: AtlasTier;
  source: string | null;
  expiresAt: Date | null;
  originalTransactionId?: string | null;
}): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`
    INSERT INTO user_entitlements (user_id, tier, source, expires_at, original_transaction_id, updated_at)
    VALUES (
      ${input.userId}::uuid, ${input.tier}, ${input.source}, ${input.expiresAt},
      ${input.originalTransactionId ?? null}, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      source = EXCLUDED.source,
      expires_at = EXCLUDED.expires_at,
      original_transaction_id =
        COALESCE(EXCLUDED.original_transaction_id, user_entitlements.original_transaction_id),
      updated_at = now()
  `;
}

/** Reverse-map an App Store subscription to its user (webhook path). */
export async function getUserIdByOriginalTransaction(
  originalTransactionId: string,
): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM user_entitlements
      WHERE original_transaction_id = ${originalTransactionId}
      LIMIT 1
    `;
    return rows[0]?.user_id ?? null;
  } catch (err) {
    console.warn("[entitlement] txn->user lookup failed", err);
    return null;
  }
}

export interface AtlasCapacityGate {
  ok: boolean;
  message?: string;
  limit?: number;
  usage?: number;
}

/** Guard 自製圖鑑 capacity before creating a new item (confirm). */
export async function checkAtlasCapacity(userId: string): Promise<AtlasCapacityGate> {
  const [tier, usage] = await Promise.all([getAtlasTier(userId), getAtlasUsage(userId)]);
  const limits = atlasLimitsForTier(tier);
  if (limits.maxItems === null || usage.itemCount < limits.maxItems) return { ok: true };
  return {
    ok: false,
    message: `自製圖鑑已達上限（${limits.maxItems}），刪除一些或升級後再新增。`,
    limit: limits.maxItems,
    usage: usage.itemCount,
  };
}

export type AtlasAiGateKind = "quota" | "throttle";

export interface AtlasAiGate {
  ok: boolean;
  /** quota => the caller should 402 (upgrade); throttle => 429 (retry). */
  kind?: AtlasAiGateKind;
  scope?: "daily_ai" | "ip_burst" | "global";
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * Guard an atlas AI recognition: first the tier-based per-user daily quota,
 * then the IP-burst + global abuse backstops. Returns the first violation.
 */
export async function enforceAtlasAiLimits(ctx: {
  userId: string;
  ipHash: string;
}): Promise<AtlasAiGate> {
  const [tier, usage] = await Promise.all([getAtlasTier(ctx.userId), getAtlasUsage(ctx.userId)]);
  const limits = atlasLimitsForTier(tier);
  if (
    limits.dailyAiRecognitions !== null &&
    usage.aiRecognitionsToday >= limits.dailyAiRecognitions
  ) {
    return {
      ok: false,
      kind: "quota",
      scope: "daily_ai",
      message: `今日 AI 辨識次數已達上限（${limits.dailyAiRecognitions}），明天再試或升級。`,
    };
  }

  const backstop = await checkAtlasAiBackstops({ ipHash: ctx.ipHash });
  if (!backstop.ok) {
    return {
      ok: false,
      kind: "throttle",
      scope: backstop.scope,
      message: backstop.message,
      retryAfterSeconds: backstop.retryAfterSeconds,
    };
  }
  return { ok: true };
}
