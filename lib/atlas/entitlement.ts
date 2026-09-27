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
// 'primary' vs 'escalated'). Limits: lib/atlas/membership-limits.ts (limitsFor).
//
// TWO SOURCES, ONE TIER. Pro can come from either of two independent places
// and the effective tier is their UNION (later expiry wins):
//   - user_entitlements       — the App Store subscription. Apple owns it;
//                               only verify / the notifications webhook write it.
//   - user_entitlement_grants — manual grants (comps, apology credit). Only an
//                               operator writes them.
// They are separate tables because they used to be one row, and one row meant
// compensating a paying subscriber overwrote their real expiry — then Apple's
// next renewal silently erased the compensation. See docs/adr/0004 in tuji-ios.
//
// Every transition is appended to user_entitlement_events. That ledger is the
// only history that exists (both tables above are mutated in place) and it
// cannot be backfilled, so writers must not skip it.
//
// Fails OPEN: any DB error resolves to free-tier limits but allows the action,
// so an entitlement outage never hard-blocks the product. The abuse backstops
// in lib/ratelimit.ts remain the runaway-cost guard.

import { getSql } from "@/lib/db";
import { checkAtlasAiBackstops } from "@/lib/ratelimit";
import {
  decideStoreKitBinding,
  decideStoreKitState,
} from "@/lib/billing/storekit-state";
import { limitsFor, upgradeTarget, type AtlasLimits } from "@/lib/atlas/membership-limits";
import {
  membershipPolicy,
  membershipSourcesFromRow,
  resolveMembership,
  type Membership,
  type MembershipPolicy,
  type MembershipSourceRow,
  type MembershipTier,
} from "@/lib/atlas/membership";

export type { AtlasLimits };

// postgres-js types the pool handle (Sql) and a transaction handle
// (TransactionSql) as mutually unassignable, so helpers that must run in both
// take this alias. Same convention as lib/words-db.ts.
type SqlExecutor = any;

export type AtlasTier = "free" | "pro";

export interface AtlasUsage {
  /** CREATION usage: the user's own captured items. Drives the paywall. */
  atlasSlots: number;
  primaryAiThisMonth: number;
  precisionAiThisMonth: number;
  /**
   * CONSUMPTION usage: community items saved. Counted from atlas_saves, which
   * is a different table from user_atlas_items — so this can never inflate
   * atlasSlots (docs/COMMUNITY_ATLAS_PLAN.md §4.1).
   */
  savedItems: number;
}

export interface AtlasEntitlementSnapshot {
  plan: AtlasTier;
  atlasSlotsLimit: number;
  primaryAiSoftLimitMonthly: number;
  precisionAiLimitMonthly: number;
  savedItemsLimit: number;
  adsRequiredForCardGeneration: boolean;
  subscriptionExpiresAt: string | null;
  usage: AtlasUsage;
  /**
   * Three-tier view (docs/MEMBERSHIP_SERVER_DESIGN.md §6). `plan` above keeps
   * its old meaning — "pro" only while Pro is live — so released clients see
   * exactly what they saw before.
   */
  membership: Membership & { policy: MembershipPolicy };
}

/**
 * Limits for a Pro-or-not tier under the policy in force. Kept for callers that
 * only know Free/Pro; a lifetime holder must go through limitsFor with their
 * MembershipTier (see membershipTierOf) or they would be treated as Free.
 */
export function atlasLimitsForTier(tier: AtlasTier): AtlasLimits {
  return limitsFor(tier, membershipPolicy());
}

export interface EffectiveEntitlement {
  tier: AtlasTier;
  /**
   * When Pro lapses. null while Pro means "no expiry", which is only reachable
   * via a subscription row Apple gave no expiresDate for.
   */
  expiresAt: string | null;
  /** The subscription's own expiry, whether or not it is the winning source. */
  subscriptionExpiresAt: string | null;
  /** The latest live grant's expiry, whether or not it is the winning source. */
  grantExpiresAt: string | null;
  /** A live 永久權益 row exists. Independent of Pro; see membershipTierOf. */
  hasLifetime: boolean;
}

/** Shape returned by the union query; also the input to the pure resolver. */
interface EntitlementSourceRow {
  sub_tier: string | null;
  sub_expires_at: string | null;
  grant_expires_at: string | null;
  has_lifetime?: boolean | null;
}

const FREE_ENTITLEMENT: EffectiveEntitlement = {
  tier: "free",
  expiresAt: null,
  subscriptionExpiresAt: null,
  grantExpiresAt: null,
  hasLifetime: false,
};

/** The three-tier tier the gates enforce: Pro while live, else lifetime, else free. */
export function membershipTierOf(e: EffectiveEntitlement): MembershipTier {
  return e.tier === "pro" ? "pro" : e.hasLifetime ? "lifetime" : "free";
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * The union rule: Pro if EITHER source is live, and the later expiry wins.
 *
 * Pure and exported so the rule can be tested without a database — it is the
 * one piece of logic that decides whether a paying customer keeps their access.
 */
export function resolveEntitlement(row: EntitlementSourceRow | null): EffectiveEntitlement {
  const subscriptionExpiresAt = row?.sub_expires_at ?? null;
  // Already filtered to un-revoked, unexpired rows by the query, so non-null
  // here means "there is a live grant".
  const grantExpiresAt = row?.grant_expires_at ?? null;

  const subscriptionLive =
    row?.sub_tier === "pro" &&
    (subscriptionExpiresAt === null ||
      new Date(subscriptionExpiresAt).getTime() > Date.now());
  const grantLive = grantExpiresAt !== null;
  const hasLifetime = row?.has_lifetime === true;

  if (!subscriptionLive && !grantLive) {
    return { tier: "free", expiresAt: null, subscriptionExpiresAt, grantExpiresAt, hasLifetime };
  }
  // An unbounded subscription outlasts any dated grant.
  const expiresAt =
    subscriptionLive && subscriptionExpiresAt === null
      ? null
      : laterOf(subscriptionLive ? subscriptionExpiresAt : null, grantExpiresAt);
  return { tier: "pro", expiresAt, subscriptionExpiresAt, grantExpiresAt, hasLifetime };
}

/**
 * The union query. Deliberately ONE round trip: this sits on the hot path
 * (every AI recognition and every capacity check calls it), so the union
 * happens in SQL rather than as a second query. Takes an executor so callers
 * inside a transaction can reuse it.
 */
async function readEntitlementSources(
  exec: SqlExecutor,
  userId: string,
): Promise<EffectiveEntitlement> {
  const rows = (await exec`
    SELECT e.tier       AS sub_tier,
           e.expires_at AS sub_expires_at,
           g.expires_at AS grant_expires_at,
           EXISTS (
             SELECT 1 FROM user_lifetime_entitlements l
              WHERE l.user_id = u.uid AND l.revoked_at IS NULL
           ) AS has_lifetime
      FROM (SELECT ${userId}::uuid AS uid) u
      LEFT JOIN user_entitlements e ON e.user_id = u.uid
      LEFT JOIN LATERAL (
        SELECT max(expires_at) AS expires_at
          FROM user_entitlement_grants
         WHERE user_id = u.uid AND revoked_at IS NULL AND expires_at > now()
      ) g ON TRUE
  `) as EntitlementSourceRow[];
  return resolveEntitlement(rows[0] ?? null);
}

/**
 * Effective three-tier tier inside a transaction, for ledger rows. Pro comes
 * from the same union query as every gate; lifetime is just "a live row".
 */
export async function readEffectiveMembershipTier(
  exec: SqlExecutor,
  userId: string,
): Promise<MembershipTier> {
  return membershipTierOf(await readEntitlementSources(exec, userId));
}

async function getEntitlementRow(userId: string): Promise<EffectiveEntitlement> {
  const sql = getSql();
  if (!sql) return FREE_ENTITLEMENT;
  try {
    return await readEntitlementSources(sql, userId);
  } catch (err) {
    console.warn("[entitlement] tier lookup failed, defaulting free", err);
    return FREE_ENTITLEMENT;
  }
}

/** Effective entitlement without the fail-open swallow — for admin reads. */
export async function getEffectiveEntitlement(userId: string): Promise<EffectiveEntitlement> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  return readEntitlementSources(sql, userId);
}

/**
 * What every gate needs, in the one hot-path query: the tier to enforce, its
 * limits under the policy in force, and plain Pro-ness (routes still pick a
 * vision provider by it).
 */
export async function getAtlasGateContext(userId: string): Promise<{
  tier: MembershipTier;
  pro: AtlasTier;
  policy: ReturnType<typeof membershipPolicy>;
  limits: AtlasLimits;
}> {
  const row = await getEntitlementRow(userId);
  const tier = membershipTierOf(row);
  const policy = membershipPolicy();
  return { tier, pro: row.tier, policy, limits: limitsFor(tier, policy) };
}

/**
 * Tier + policy for the membership gates that only exist under v2 (study,
 * 補充, upload). Under v1 they are all no-ops, so the lookup is skipped
 * entirely — hot paths pay nothing until the cutover.
 */
export async function getMembershipAccess(
  userId: string,
): Promise<{ tier: MembershipTier; policy: ReturnType<typeof membershipPolicy> }> {
  const policy = membershipPolicy();
  if (policy === "v1") return { tier: "free", policy };
  return { tier: (await getAtlasGateContext(userId)).tier, policy };
}

export async function getAtlasTier(userId: string): Promise<AtlasTier> {
  return (await getEntitlementRow(userId)).tier;
}

export async function getAtlasUsage(userId: string): Promise<AtlasUsage> {
  const sql = getSql();
  if (!sql) {
    return { atlasSlots: 0, primaryAiThisMonth: 0, precisionAiThisMonth: 0, savedItems: 0 };
  }
  try {
    const [slots, primary, precision, saved] = await Promise.all([
      // CREATION count. Reads user_atlas_items only — saved community items
      // live in atlas_saves and must never appear here, or collecting other
      // people's photos would consume the free tier's 3 creation slots.
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_items
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL
      `,
      // AI quota counts only successful rows: an errored or empty recognition
      // is free (see recognitionFoundSomething). Such calls are bounded only by
      // the ratelimit backstops (per-IP per-minute + global daily) — there is no
      // per-user daily cap on them.
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_ai_usage
        WHERE user_id = ${userId}::uuid
          AND operation = 'primary'
          AND success
          AND created_at >= date_trunc('month', now())
      `,
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM user_atlas_ai_usage
        WHERE user_id = ${userId}::uuid
          AND operation = 'escalated'
          AND success
          AND created_at >= date_trunc('month', now())
      `,
      // CONSUMPTION count — separate table, separate limit.
      sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM atlas_saves
        WHERE user_id = ${userId}::uuid
      `,
    ]);
    return {
      atlasSlots: slots[0]?.count ?? 0,
      primaryAiThisMonth: primary[0]?.count ?? 0,
      precisionAiThisMonth: precision[0]?.count ?? 0,
      savedItems: saved[0]?.count ?? 0,
    };
  } catch (err) {
    console.warn("[entitlement] usage lookup failed", err);
    return { atlasSlots: 0, primaryAiThisMonth: 0, precisionAiThisMonth: 0, savedItems: 0 };
  }
}

/**
 * Sources for the three-tier view, in one round trip. Separate from
 * readEntitlementSources on purpose: that one sits on every gate's hot path and
 * answers only "is Pro live"; this one is read by the entitlement endpoint.
 */
async function readMembership(userId: string, pro: EffectiveEntitlement): Promise<Membership> {
  const sql = getSql();
  const fallback = () =>
    resolveMembership(
      membershipSourcesFromRow(
        {
          sub_tier: null,
          sub_expires_at: null,
          sub_revoked_at: null,
          grant_ended_at: null,
          lifetime_source: null,
          lifetime_acquired_at: null,
        },
        pro,
      ),
    );
  if (!sql) return fallback();
  try {
    const rows = (await sql`
      SELECT e.tier                AS sub_tier,
             e.expires_at          AS sub_expires_at,
             e.storekit_revoked_at AS sub_revoked_at,
             g.ended_at            AS grant_ended_at,
             l.source              AS lifetime_source,
             l.acquired_at         AS lifetime_acquired_at
        FROM (SELECT ${userId}::uuid AS uid) u
        LEFT JOIN user_entitlements e ON e.user_id = u.uid
        LEFT JOIN LATERAL (
          SELECT max(expires_at) AS ended_at
            FROM user_entitlement_grants
           WHERE user_id = u.uid AND revoked_at IS NULL AND expires_at <= now()
        ) g ON TRUE
        LEFT JOIN LATERAL (
          SELECT source, acquired_at
            FROM user_lifetime_entitlements
           WHERE user_id = u.uid AND revoked_at IS NULL
           LIMIT 1
        ) l ON TRUE
    `) as MembershipSourceRow[];
    return resolveMembership(membershipSourcesFromRow(rows[0], pro));
  } catch (err) {
    // Fail open like the rest of this module: fall back to what the Pro union
    // alone says, so the endpoint still answers.
    console.warn("[entitlement] membership lookup failed", err);
    return fallback();
  }
}

export async function getAtlasEntitlement(userId: string): Promise<AtlasEntitlementSnapshot> {
  const [row, usage] = await Promise.all([getEntitlementRow(userId), getAtlasUsage(userId)]);
  const membership = await readMembership(userId, row);
  const limits = limitsFor(membershipTierOf(row), membershipPolicy());
  return {
    plan: row.tier,
    atlasSlotsLimit: limits.atlasSlotsLimit,
    primaryAiSoftLimitMonthly: limits.primaryAiSoftLimitMonthly,
    precisionAiLimitMonthly: limits.precisionAiLimitMonthly,
    savedItemsLimit: limits.savedItemsLimit,
    adsRequiredForCardGeneration: limits.adsRequiredForCardGeneration,
    // Wire name kept for released clients, but the value is the EFFECTIVE
    // expiry — the later of the subscription and any live grant. A comped user
    // with no subscription gets their grant's date here, which is the date
    // their Pro actually ends and therefore the only honest answer.
    subscriptionExpiresAt: row.expiresAt,
    usage,
    membership: { ...membership, policy: membershipPolicy() },
  };
}

/**
 * Write the authoritative SUBSCRIPTION entitlement (StoreKit verify / App Store
 * notifications). Manual grants do NOT come through here — see grantProAccess.
 *
 * Does three things atomically:
 *  1. Enforces the immutable legacy binding or Apple's signed appAccountToken.
 *     Only a token-proven destination may move an existing subscription.
 *  2. Upserts the subscription row.
 *  3. Appends to the ledger, but only when the tier or expiry actually moved —
 *     background renewals fire this constantly and an unchanged row is not an
 *     event worth recording.
 */
export interface StoreKitEntitlementWriteResult {
  status:
    | "applied"
    | "duplicate"
    | "stale"
    | "account_mismatch"
    | "already_bound"
    | "unbound_legacy";
  tier: AtlasTier;
  expiresAt: Date | null;
}

export async function upsertAtlasEntitlement(input: {
  userId: string;
  tier: AtlasTier;
  source: string | null;
  expiresAt: Date | null;
  originalTransactionId: string;
  transactionId: string;
  signedAt: Date;
  appAccountToken: string | null;
  /** Refund / revocation time from Apple; null for anything else. */
  revokedAt?: Date | null;
}): Promise<StoreKitEntitlementWriteResult> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const txnId = input.originalTransactionId;

  return sql.begin(async (tx) => {
    // Serialize both existing and first-time claims of this subscription. A
    // SELECT ... FOR UPDATE cannot lock an absent row, so the advisory lock is
    // what keeps two concurrent first claims from racing the UNIQUE index.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${txnId}, 0))`;

    const owners = await tx<
      {
        user_id: string;
        tier: AtlasTier;
        expires_at: string | null;
        storekit_transaction_id: string | null;
        storekit_signed_at: string | null;
      }[]
    >`
      SELECT user_id, tier, expires_at, storekit_transaction_id, storekit_signed_at
        FROM user_entitlements
       WHERE original_transaction_id = ${txnId}
       FOR UPDATE
    `;
    const owner = owners[0] ?? null;

    const stateDecision = decideStoreKitState(
      owner
        ? {
            tier: owner.tier,
            transactionId: owner.storekit_transaction_id,
            signedAt: owner.storekit_signed_at ? new Date(owner.storekit_signed_at) : null,
          }
        : null,
      { tier: input.tier, transactionId: input.transactionId, signedAt: input.signedAt },
    );
    if (stateDecision === "stale" || (stateDecision === "duplicate" && owner?.user_id === input.userId)) {
      return {
        status: stateDecision,
        tier: owner?.tier ?? "free",
        expiresAt: owner?.expires_at ? new Date(owner.expires_at) : null,
      };
    }

    const bindingDecision = decideStoreKitBinding({
      authenticatedUserId: input.userId,
      appAccountToken: input.appAccountToken,
      existingUserId: owner?.user_id ?? null,
    });
    if (bindingDecision !== "allow") {
      return {
        status: bindingDecision,
        tier: owner?.tier ?? "free",
        expiresAt: owner?.expires_at ? new Date(owner.expires_at) : null,
      };
    }

    // A different current owner can be released only when Apple's signed
    // appAccountToken proves the destination account. Untokened legacy JWSes
    // can never trigger this branch.
    if (owner && owner.user_id !== input.userId) {
      const released = await tx<{ user_id: string; tier: string }[]>`
        UPDATE user_entitlements
           SET tier = 'free',
               source = 'transferred',
               original_transaction_id = NULL,
               updated_at = now()
         WHERE original_transaction_id = ${txnId}
           AND user_id = ${owner.user_id}::uuid
        RETURNING user_id, tier
      `;
      for (const prior of released) {
        console.warn("[entitlement] subscription transferred away from", prior.user_id);
        await tx`
          INSERT INTO user_entitlement_events
            (user_id, from_tier, to_tier, channel, reason, actor, original_transaction_id)
          VALUES (${prior.user_id}::uuid, ${prior.tier}, 'free', 'transfer',
                  'subscription re-bound to another account', 'system', ${txnId})
        `;
      }
    }

    const prior = await tx<{ tier: string; expires_at: string | null }[]>`
      SELECT tier, expires_at FROM user_entitlements
       WHERE user_id = ${input.userId}::uuid
       FOR UPDATE
    `;

    await tx`
      INSERT INTO user_entitlements (
        user_id, tier, source, expires_at, original_transaction_id,
        storekit_transaction_id, storekit_signed_at, storekit_app_account_token,
        storekit_revoked_at, updated_at
      )
      VALUES (
        ${input.userId}::uuid, ${input.tier}, ${input.source}, ${input.expiresAt},
        ${txnId}, ${input.transactionId}, ${input.signedAt},
        ${input.appAccountToken}::uuid, ${input.revokedAt ?? null}, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        tier = EXCLUDED.tier,
        source = EXCLUDED.source,
        expires_at = EXCLUDED.expires_at,
        original_transaction_id =
          COALESCE(EXCLUDED.original_transaction_id, user_entitlements.original_transaction_id),
        storekit_transaction_id = EXCLUDED.storekit_transaction_id,
        storekit_signed_at = EXCLUDED.storekit_signed_at,
        -- Follows the latest signed payload: set by a refund, cleared if a
        -- later payload shows the subscription live again.
        storekit_revoked_at = EXCLUDED.storekit_revoked_at,
        storekit_app_account_token = COALESCE(
          EXCLUDED.storekit_app_account_token,
          user_entitlements.storekit_app_account_token
        ),
        updated_at = now()
    `;

    const before = prior[0] ?? null;
    const expiryMoved =
      (before?.expires_at ?? null) === null
        ? input.expiresAt !== null
        : input.expiresAt === null ||
          new Date(before!.expires_at!).getTime() !== input.expiresAt.getTime();
    if (before?.tier === input.tier && !expiryMoved) {
      return { status: "applied", tier: input.tier, expiresAt: input.expiresAt };
    }

    await tx`
      INSERT INTO user_entitlement_events
        (user_id, from_tier, to_tier, from_expires_at, to_expires_at,
         channel, reason, actor, original_transaction_id)
      VALUES (
        ${input.userId}::uuid, ${before?.tier ?? null}, ${input.tier},
        ${before?.expires_at ?? null}, ${input.expiresAt},
        'appstore', ${input.source}, 'appstore', ${txnId}
      )
    `;
    return { status: "applied", tier: input.tier, expiresAt: input.expiresAt };
  });
}

export const MAX_GRANT_DAYS = 3650;

/**
 * Give a user Pro for N days, independently of any App Store subscription.
 *
 * A grant NEVER touches user_entitlements, so it cannot overwrite a paying
 * subscriber's real expiry and Apple's next renewal cannot erase it — that
 * mutual clobbering is exactly why the two live in separate tables.
 *
 * `reason` is mandatory: a year from now the only way to answer "why is this
 * person Pro" is what gets written here.
 */
export async function grantProAccess(input: {
  userId: string;
  days: number;
  reason: string;
  grantedBy: string;
}): Promise<{ expiresAt: string }> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");

  const days = Math.floor(input.days);
  if (!Number.isFinite(days) || days < 1 || days > MAX_GRANT_DAYS) {
    throw new Error("invalid days");
  }
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error("reason required");

  return sql.begin(async (tx) => {
    const before = await readEntitlementSources(tx, input.userId);
    const rows = await tx<{ expires_at: string }[]>`
      INSERT INTO user_entitlement_grants (user_id, expires_at, reason, granted_by)
      VALUES (
        ${input.userId}::uuid, now() + make_interval(days => ${days}),
        ${reason}, ${input.grantedBy}
      )
      RETURNING expires_at
    `;
    const after = await readEntitlementSources(tx, input.userId);
    // Recorded even when the effective tier does not move (compensating an
    // existing subscriber) — that case is precisely what the ledger is for.
    await tx`
      INSERT INTO user_entitlement_events
        (user_id, from_tier, to_tier, from_expires_at, to_expires_at, channel, reason, actor)
      VALUES (
        ${input.userId}::uuid, ${before.tier}, ${after.tier},
        ${before.expiresAt}, ${after.expiresAt}, 'grant', ${reason}, ${input.grantedBy}
      )
    `;
    return { expiresAt: rows[0].expires_at };
  });
}

/**
 * Revoke every live grant for a user. Does not touch their subscription — a
 * paying subscriber stays Pro, which is the correct outcome: revoking a comp
 * should never cancel someone's purchase.
 */
export async function revokeProGrants(input: {
  userId: string;
  reason: string;
  revokedBy: string;
}): Promise<{ revoked: number }> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error("reason required");

  return sql.begin(async (tx) => {
    const before = await readEntitlementSources(tx, input.userId);
    const revoked = await tx<{ id: string }[]>`
      UPDATE user_entitlement_grants
         SET revoked_at = now(), revoke_reason = ${reason}
       WHERE user_id = ${input.userId}::uuid
         AND revoked_at IS NULL
         AND expires_at > now()
      RETURNING id
    `;
    if (revoked.length === 0) return { revoked: 0 };

    const after = await readEntitlementSources(tx, input.userId);
    await tx`
      INSERT INTO user_entitlement_events
        (user_id, from_tier, to_tier, from_expires_at, to_expires_at, channel, reason, actor)
      VALUES (
        ${input.userId}::uuid, ${before.tier}, ${after.tier},
        ${before.expiresAt}, ${after.expiresAt}, 'grant_revoke', ${reason}, ${input.revokedBy}
      )
    `;
    return { revoked: revoked.length };
  });
}

/**
 * Reverse-map an App Store subscription to its user (webhook path).
 *
 * Exactly one row can hold a given original_transaction_id — enforced by a
 * UNIQUE index and by the transfer in upsertAtlasEntitlement — so this lookup
 * is deterministic. It was not always: before that invariant, two accounts
 * could hold the same subscription and a refund could land on the wrong one.
 */
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
/**
 * Gate for SAVING a community item. Separate from checkAtlasCapacity on
 * purpose: this consults savedItemsLimit, never atlasSlotsLimit, so a Free user
 * who has used all 3 creation slots can still save community content.
 *
 * This is an abuse rail, not a paywall — hitting it is not upgradeable and the
 * message must not push Pro.
 */
export async function checkAtlasSaveCapacity(
  userId: string,
  additionalItems = 1,
): Promise<AtlasCapacityGate> {
  const [ctx, usage] = await Promise.all([getAtlasGateContext(userId), getAtlasUsage(userId)]);
  const { limits } = ctx;
  const requested = Math.max(0, Math.floor(additionalItems));
  if (usage.savedItems + requested <= limits.savedItemsLimit) return { ok: true };
  // v2 non-members have 0: 物見 is read-only for them, and that IS upgradeable.
  if (ctx.policy === "v2" && ctx.tier === "free") {
    return {
      ok: false,
      upgradeable: true,
      message: "收藏物見內容是會員功能，成為永久會員即可收藏與加入學習。",
      limit: limits.savedItemsLimit,
      usage: usage.savedItems,
    };
  }
  return {
    ok: false,
    upgradeable: false,
    message: `學習項目已達上限（${limits.savedItemsLimit}），移除一些後再加入。`,
    limit: limits.savedItemsLimit,
    usage: usage.savedItems,
  };
}

/**
 * Gate the capture upload BEFORE the image is stored or any AI runs
 * (checklist §4). v2 only — under v1 uploads are unchanged: the capacity check
 * still happens at confirm, and an over-cap upload is simply kept for naming.
 */
export async function checkAtlasUploadAllowed(userId: string): Promise<AtlasCapacityGate> {
  if (membershipPolicy() === "v1") return { ok: true };
  return checkAtlasCapacity(userId);
}

export async function checkAtlasCapacity(userId: string): Promise<AtlasCapacityGate> {
  const [ctx, usage] = await Promise.all([getAtlasGateContext(userId), getAtlasUsage(userId)]);
  const { limits, tier, policy } = ctx;
  if (usage.atlasSlots < limits.atlasSlotsLimit) return { ok: true };
  const target = upgradeTarget(tier, policy);
  const targetSlots = target ? limitsFor(target, policy).atlasSlotsLimit : 0;
  return {
    ok: false,
    upgradeable: target !== null,
    message:
      target === null
        ? `自製圖鑑已達上限（${limits.atlasSlotsLimit}），刪除一些後再新增。`
        : policy === "v1"
          ? `自製圖鑑已達免費上限（${limits.atlasSlotsLimit}），升級 Pro 可擴充到 ${targetSlots} 格。`
          : target === "lifetime"
            ? `自製圖鑑是會員功能，成為永久會員可建立 ${targetSlots} 格。`
            : `自製圖鑑已達上限（${limits.atlasSlotsLimit}），升級 Pro 可擴充到 ${targetSlots} 格。`,
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
  const [gate, usage] = await Promise.all([getAtlasGateContext(ctx.userId), getAtlasUsage(ctx.userId)]);
  const { limits, policy } = gate;
  const tier = gate.pro;

  if (ctx.operation === "precision") {
    if (usage.precisionAiThisMonth >= limits.precisionAiLimitMonthly) {
      // Only Pro has precision in either policy.
      const upgradeable = gate.tier !== "pro";
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
    const target = upgradeTarget(gate.tier, policy);
    const targetMonthly = target ? limitsFor(target, policy).primaryAiSoftLimitMonthly : 0;
    return {
      ok: false,
      tier,
      upgradeable: target !== null,
      scope: "primary_ai",
      message:
        target === null
          ? `本月 AI 辨識已達上限（${limits.primaryAiSoftLimitMonthly}），下月再試。`
          : policy === "v1"
            ? `本月 AI 辨識已達免費上限（${limits.primaryAiSoftLimitMonthly}），升級 Pro 提升至每月 ${targetMonthly} 次。`
            : target === "lifetime"
              ? `AI 辨識是會員功能，成為永久會員每月可用 ${targetMonthly} 次。`
              : `本月 AI 辨識已達上限（${limits.primaryAiSoftLimitMonthly}），升級 Pro 提升至每月 ${targetMonthly} 次。`,
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
