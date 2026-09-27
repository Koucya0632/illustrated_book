// The one limits table (docs/MEMBERSHIP_SERVER_DESIGN.md §4). Every gate reads
// limitsFor(tier, policy); nothing else states a number.
//
//              slots  ordinary/mo  precision/mo
//   v1 free       3        30           0        ← pre-membership (current)
//   v1 pro      300       500          30        ← pre-membership (current)
//   v2 free       0         0           0
//   v2 lifetime  20        10           0
//   v2 pro      300       200          30
//
// v1 has no lifetime tier: a holding is recorded and reported but limits stay
// Free, so the purchase path can ship and be tested before the cutover.
// The ATLAS_* env overrides apply to v1 only; v2 is the published promise.

import type { MembershipPolicy, MembershipTier } from "@/lib/atlas/membership";

export interface AtlasLimits {
  atlasSlotsLimit: number;
  primaryAiSoftLimitMonthly: number;
  precisionAiLimitMonthly: number;
  /**
   * CONSUMPTION quota: how many community items the user may save into their
   * own review queue (docs/COMMUNITY_ATLAS_PLAN.md §4.1). Tracked separately
   * from atlasSlotsLimit — saving other people's photos never eats creation
   * slots. In v2 non-members get 0: 物見 is read-only for them.
   */
  savedItemsLimit: number;
  /** Always false — ads were dropped; kept only so released clients still decode. */
  adsRequiredForCardGeneration: boolean;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function v1(tier: MembershipTier): AtlasLimits {
  if (tier === "pro") {
    return {
      atlasSlotsLimit: intEnv("ATLAS_PRO_SLOTS", 300),
      primaryAiSoftLimitMonthly: intEnv("ATLAS_PRO_PRIMARY_AI_MONTHLY", 500),
      precisionAiLimitMonthly: intEnv("ATLAS_PRO_PRECISION_MONTHLY", 30),
      savedItemsLimit: intEnv("ATLAS_PRO_SAVED_ITEMS", 5000),
      adsRequiredForCardGeneration: false,
    };
  }
  return {
    atlasSlotsLimit: intEnv("ATLAS_FREE_SLOTS", 3),
    primaryAiSoftLimitMonthly: intEnv("ATLAS_FREE_PRIMARY_AI_MONTHLY", 30),
    precisionAiLimitMonthly: intEnv("ATLAS_FREE_PRECISION_MONTHLY", 0),
    savedItemsLimit: intEnv("ATLAS_FREE_SAVED_ITEMS", 1000),
    adsRequiredForCardGeneration: false,
  };
}

const V2: Record<MembershipTier, AtlasLimits> = {
  free: {
    atlasSlotsLimit: 0,
    primaryAiSoftLimitMonthly: 0,
    precisionAiLimitMonthly: 0,
    savedItemsLimit: 0,
    adsRequiredForCardGeneration: false,
  },
  lifetime: {
    atlasSlotsLimit: 20,
    primaryAiSoftLimitMonthly: 10,
    precisionAiLimitMonthly: 0,
    savedItemsLimit: 1000,
    adsRequiredForCardGeneration: false,
  },
  pro: {
    atlasSlotsLimit: 300,
    primaryAiSoftLimitMonthly: 200,
    precisionAiLimitMonthly: 30,
    savedItemsLimit: 5000,
    adsRequiredForCardGeneration: false,
  },
};

export function limitsFor(tier: MembershipTier, policy: MembershipPolicy): AtlasLimits {
  return policy === "v2" ? { ...V2[tier] } : v1(tier);
}

/** The tier whose purchase would raise this user's limits, or null at the top. */
export function upgradeTarget(tier: MembershipTier, policy: MembershipPolicy): MembershipTier | null {
  if (tier === "pro") return null;
  if (policy === "v1") return "pro";
  return tier === "free" ? "lifetime" : "pro";
}
