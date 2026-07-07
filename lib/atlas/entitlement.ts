// Atlas Free/Pro entitlement + usage + enforcement. Server is the authority:
// the client mirrors this for UI but every write path re-checks here.
// Model mirrors docs/ATLAS_PRICING_PLAN.md:
//   - atlasSlotsLimit:            capacity (Free 3, Pro 300) — enforced at confirm
//   - primaryAiSoftLimitMonthly:  ordinary AI / month (Free 30, Pro 500)
//   - precisionAiLimitMonthly:    高精度 / month (Free 0, Pro 30) — user-triggered
//   - adsRequiredForCardGeneration: always false — the rewarded-ad plan was
//                                  dropped; released clients decode this as a
//                                  required field, so it stays in the payload
// AI usage is counted per calendar month from user_atlas_ai_usage (operation
// 'primary' vs 'escalated'). Limits are env-tunable; see atlasLimitsForTier.
//
// Fails OPEN: any DB error resolves to free-tier limits but allows the action,
// so an entitlement outage never hard-blocks the product. The abuse backstops
// in lib/ratelimit.ts remain the runaway-cost guard.

import { getSql } from "@/lib/db";
import { checkAtlasAiBackstops } from "@/lib/ratelimit";

export type AtlasTier = "free" | "pro";

export interface AtlasLimits {
  atlasSlotsLimit: number;
  primaryAiSoftLimitMonthly: number;
  precisionAiLimitMonthly: number;
  /** Always false — ads were dropped; kept only so released clients still decode. */
  adsRequiredForCardGeneration: boolean;
}

export interface AtlasUsage {
  atlasSlots: number;
  primaryAiThisMonth: number;
  precisionAiThisMonth: number;
}

export interface AtlasEntitlementSnapshot {
  plan: AtlasTier;
  atlasSlotsLimit: number;
  primaryAiSoftLimitMonthly: number;
  precisionAiLimitMonthly: number;
  adsRequiredForCardGeneration: boolean;
  subscriptionExpiresAt: string | null;
  usage: AtlasUsage;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function atlasLimitsForTier(tier: AtlasTier): AtlasLimits {
  // Pro sells capacity, more ordinary AI (500 vs 30) and precision recognitions.
  if (tier === "pro") {
    return {
      atlasSlotsLimit: intEnv("ATLAS_PRO_SLOTS", 300),
      primaryAiSoftLimitMonthly: intEnv("ATLAS_PRO_PRIMARY_AI_MONTHLY", 500),
      precisionAiLimitMonthly: intEnv("ATLAS_PRO_PRECISION_MONTHLY", 30),
      adsRequiredForCardGeneration: false,
    };
  }
  return {
    atlasSlotsLimit: intEnv("ATLAS_FREE_SLOTS", 3),
    primaryAiSoftLimitMonthly: intEnv("ATLAS_FREE_PRIMARY_AI_MONTHLY", 30),
    precisionAiLimitMonthly: intEnv("ATLAS_FREE_PRECISION_MONTHLY", 0),
    adsRequiredForCardGeneration: false,
  };
}

/** Effective tier + expiry. An expired Pro row lapses back to free. */
async function getEntitlementRow(
  userId: string,
): Promise<{ tier: AtlasTier; expiresAt: string | null }> {
  const sql = getSql();
  if (!sql) return { tier: "free", expiresAt: null };
  try {
    const rows = await sql<{ tier: string; expires_at: string | null }[]>`
      SELECT tier, expires_at
      FROM user_entitlements
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || row.tier !== "pro") return { tier: "free", expiresAt: row?.expires_at ?? null };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { tier: "free", expiresAt: row.expires_at };
    }
    return { tier: "pro", expiresAt: row.expires_at };
  } catch (err) {
    console.warn("[entitlement] tier lookup failed, defaulting free", err);
    return { tier: "free", expiresAt: null };
  }
}

export async function getAtlasTier(userId: string): Promise<AtlasTier> {
  return (await getEntitlementRow(userId)).tier;
}

export async function getAtlasUsage(userId: string): Promise<AtlasUsage> {
  const sql = getSql();
  if (!sql) return { atlasSlots: 0, primaryAiThisMonth: 0, precisionAiThisMonth: 0 };
  try {
    const [slots, primary, precision] = await Promise.all([
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_items
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL
      `,
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_ai_usage
        WHERE user_id = ${userId}::uuid
          AND operation = 'primary'
          AND created_at >= date_trunc('month', now())
      `,
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_ai_usage
        WHERE user_id = ${userId}::uuid
          AND operation = 'escalated'
          AND created_at >= date_trunc('month', now())
      `,
    ]);
    return {
      atlasSlots: slots[0]?.count ?? 0,
      primaryAiThisMonth: primary[0]?.count ?? 0,
      precisionAiThisMonth: precision[0]?.count ?? 0,
    };
  } catch (err) {
    console.warn("[entitlement] usage lookup failed", err);
    return { atlasSlots: 0, primaryAiThisMonth: 0, precisionAiThisMonth: 0 };
  }
}

export async function getAtlasEntitlement(userId: string): Promise<AtlasEntitlementSnapshot> {
  const [row, usage] = await Promise.all([getEntitlementRow(userId), getAtlasUsage(userId)]);
  const limits = atlasLimitsForTier(row.tier);
  return {
    plan: row.tier,
    atlasSlotsLimit: limits.atlasSlotsLimit,
    primaryAiSoftLimitMonthly: limits.primaryAiSoftLimitMonthly,
    precisionAiLimitMonthly: limits.precisionAiLimitMonthly,
    adsRequiredForCardGeneration: limits.adsRequiredForCardGeneration,
    subscriptionExpiresAt: row.tier === "pro" ? row.expiresAt : null,
    usage,
  };
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
  /** true => upgrading raises the cap (route 402 / paywall); false => 429 / message. */
  upgradeable?: boolean;
  message?: string;
  limit?: number;
  usage?: number;
}

/** Guard 自製圖鑑 capacity before creating a new item (confirm). */
export async function checkAtlasCapacity(userId: string): Promise<AtlasCapacityGate> {
  const [tier, usage] = await Promise.all([getAtlasTier(userId), getAtlasUsage(userId)]);
  const limits = atlasLimitsForTier(tier);
  if (usage.atlasSlots < limits.atlasSlotsLimit) return { ok: true };
  const upgradeable = tier === "free"; // Pro slots (300) > Free (30)
  return {
    ok: false,
    upgradeable,
    message: upgradeable
      ? `自製圖鑑已達免費上限（${limits.atlasSlotsLimit}），升級 Pro 可擴充到 ${atlasLimitsForTier("pro").atlasSlotsLimit} 格。`
      : `自製圖鑑已達上限（${limits.atlasSlotsLimit}），刪除一些後再新增。`,
    limit: limits.atlasSlotsLimit,
    usage: usage.atlasSlots,
  };
}

export type AtlasAiOperation = "primary" | "precision";

export interface AtlasAiGate {
  ok: boolean;
  /** Resolved tier, so routes can pick a tier-specific provider without a second lookup. */
  tier: AtlasTier;
  /** true => route 402 (paywall); false => 429 (retry / message). */
  upgradeable?: boolean;
  scope?: "primary_ai" | "precision_ai" | "ip_burst" | "global";
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * Guard an atlas AI recognition: the tier quota for the operation (ordinary vs
 * precision), then the IP-burst + global abuse backstops. Returns the first
 * violation. `upgradeable` tells the route whether to 402 (Free, upgrade helps)
 * or 429 (already maxed for this tier).
 */
export async function enforceAtlasAiLimits(ctx: {
  userId: string;
  ipHash: string;
  operation: AtlasAiOperation;
}): Promise<AtlasAiGate> {
  const [tier, usage] = await Promise.all([getAtlasTier(ctx.userId), getAtlasUsage(ctx.userId)]);
  const limits = atlasLimitsForTier(tier);

  if (ctx.operation === "precision") {
    if (usage.precisionAiThisMonth >= limits.precisionAiLimitMonthly) {
      const upgradeable = tier === "free"; // Pro precision (30) > Free (0)
      return {
        ok: false,
        tier,
        upgradeable,
        scope: "precision_ai",
        message: upgradeable
          ? "高精度辨識是 Pro 功能，升級後即可使用。"
          : `本月高精度辨識已達上限（${limits.precisionAiLimitMonthly}），下月再試。`,
      };
    }
  } else if (usage.primaryAiThisMonth >= limits.primaryAiSoftLimitMonthly) {
    const upgradeable = tier === "free"; // Pro primary (500) > Free (30)
    return {
      ok: false,
      tier,
      upgradeable,
      scope: "primary_ai",
      message: upgradeable
        ? `本月 AI 辨識已達免費上限（${limits.primaryAiSoftLimitMonthly}），升級 Pro 提升至每月 ${atlasLimitsForTier("pro").primaryAiSoftLimitMonthly} 次。`
        : `本月 AI 辨識已達上限（${limits.primaryAiSoftLimitMonthly}），下月再試。`,
    };
  }

  const backstop = await checkAtlasAiBackstops({ ipHash: ctx.ipHash });
  if (!backstop.ok) {
    return {
      ok: false,
      tier,
      upgradeable: false,
      scope: backstop.scope,
      message: backstop.message,
      retryAfterSeconds: backstop.retryAfterSeconds,
    };
  }
  return { ok: true, tier };
}
