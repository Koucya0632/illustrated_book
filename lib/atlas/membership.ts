// Three-tier membership: free (非會員) / lifetime (永久會員) / pro.
// Design: docs/MEMBERSHIP_SERVER_DESIGN.md (tuji monorepo root).
//
// Two independent sources, never merged into one stored value:
//   - Pro      — the existing subscription ∪ grant union (resolveEntitlement).
//   - lifetime — user_lifetime_entitlements, one live row at most.
// Pro wins while live; when it ends the account simply falls back to lifetime
// (or free) with nothing written. Kept free of server-only imports so the rule
// is testable.

export type MembershipTier = "free" | "lifetime" | "pro";
export type MembershipPolicy = "v1" | "v2";
export type LifetimeSource = "appstore" | "legacy_pro" | "grant";

/** Grace after Pro ends naturally (was 30 days; shortened to 7 on 2026-09-27). */
export const PRO_GRACE_DAYS = 7;

export interface LifetimeHolding {
  source: LifetimeSource;
  acquiredAt: string;
}

export interface MembershipSources {
  proLive: boolean;
  /** Effective Pro expiry while live (null = no expiry, or not Pro). */
  proExpiresAt: string | null;
  /**
   * When Pro last ended NATURALLY — the later of a lapsed subscription's and a
   * lapsed grant's expiry. The query leaves out refunded subscriptions and
   * revoked grants, which is how "no grace for refunds" is enforced.
   */
  lastNaturalProEndAt: string | null;
  lifetime: LifetimeHolding | null;
}

export interface Membership {
  tier: MembershipTier;
  lifetime: LifetimeHolding | null;
  proExpiresAt: string | null;
  /** Only for lifetime members inside the PRO_GRACE_DAYS after Pro naturally ended. */
  graceEndsAt: string | null;
  canPurchaseLifetime: boolean;
  canPurchasePro: boolean;
}

/**
 * Which limits table is in force. v1 = the current Free/Pro limits; v2 = the
 * three-tier limits. Flipping MEMBERSHIP_POLICY to v2 IS the cutover.
 */
export function membershipPolicy(): MembershipPolicy {
  return process.env.MEMBERSHIP_POLICY === "v2" ? "v2" : "v1";
}

export function resolveMembership(s: MembershipSources, now: Date = new Date()): Membership {
  const tier: MembershipTier = s.proLive ? "pro" : s.lifetime ? "lifetime" : "free";

  let graceEndsAt: string | null = null;
  if (tier === "lifetime" && s.lastNaturalProEndAt) {
    const end = new Date(s.lastNaturalProEndAt).getTime() + PRO_GRACE_DAYS * 86_400_000;
    if (now.getTime() < end) graceEndsAt = new Date(end).toISOString();
  }

  return {
    tier,
    lifetime: s.lifetime,
    proExpiresAt: s.proLive ? s.proExpiresAt : null,
    graceEndsAt,
    canPurchaseLifetime: s.lifetime === null,
    canPurchasePro: !s.proLive,
  };
}

/** Credit enrollment replaces active Pro without rewriting its historical sources. */
export function membershipTierForBilling(tier: MembershipTier, billingMode: "legacy" | "credits"): MembershipTier {
  return billingMode === "credits" && tier === "pro" ? "lifetime" : tier;
}

export function membershipForBilling(membership: Membership, billingMode: "legacy" | "credits"): Membership {
  if (billingMode !== "credits") return membership;
  return { ...membership, tier: membership.lifetime ? "lifetime" : "free", proExpiresAt: null, graceEndsAt: null,
    canPurchaseLifetime: membership.lifetime === null, canPurchasePro: false };
}

/** One row of the membership query in lib/atlas/entitlement.ts. */
export interface MembershipSourceRow {
  sub_tier: string | null;
  sub_expires_at: string | Date | null;
  /** Set by the purchase path on refund / revocation. */
  sub_revoked_at: string | Date | null;
  /** Latest expiry among un-revoked grants that have already lapsed. */
  grant_ended_at: string | Date | null;
  lifetime_source: string | null;
  lifetime_acquired_at: string | Date | null;
}

function isLifetimeSource(v: string | null): v is LifetimeSource {
  return v === "appstore" || v === "legacy_pro" || v === "grant";
}

function iso(v: string | Date | null): string | null {
  return v == null ? null : new Date(v).toISOString();
}

/**
 * Turn the query row into resolver input. `pro` is the existing
 * resolveEntitlement result — Pro liveness is decided there and only there.
 *
 * This is where refunds lose the grace: a subscription with sub_revoked_at did
 * not end naturally, whenever its expiry date falls. (Revoked grants are
 * already excluded by the query.)
 */
export function membershipSourcesFromRow(
  row: MembershipSourceRow,
  pro: { tier: "free" | "pro"; expiresAt: string | null },
  now: Date = new Date(),
): MembershipSources {
  const subEnd = iso(row.sub_expires_at);
  const subEndedNaturally =
    subEnd !== null && row.sub_revoked_at == null && new Date(subEnd).getTime() <= now.getTime();
  const grantEnd = iso(row.grant_ended_at);
  const candidates = [subEndedNaturally ? subEnd : null, grantEnd].filter(
    (v): v is string => v !== null,
  );
  const lastNaturalProEndAt =
    candidates.length === 0
      ? null
      : candidates.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));

  const source = row.lifetime_source;
  const lifetime: LifetimeHolding | null =
    isLifetimeSource(source) && row.lifetime_acquired_at
      ? { source, acquiredAt: iso(row.lifetime_acquired_at)! }
      : null;

  return {
    proLive: pro.tier === "pro",
    proExpiresAt: pro.tier === "pro" ? iso(pro.expiresAt) : null,
    lastNaturalProEndAt,
    lifetime,
  };
}
