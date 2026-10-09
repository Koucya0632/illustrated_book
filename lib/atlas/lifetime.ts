// Writes store-bought lifetime (永久會員) holdings — App Store, and Google Play
// through the same rules (lib/billing/play-purchase.ts maps a Play order into a
// LifetimeFromTransaction; the storekit_* columns then hold Play's order id,
// purchase time and obfuscated account id). The decision of WHAT to do is
// lib/atlas/lifetime-decision.ts (pure, tested); this file only carries it out
// inside one transaction and appends the ledger row.
//
// Serialised per original_transaction_id with the same advisory lock the
// subscription path uses, so two concurrent first claims can't race the UNIQUE
// index.

import { getSql } from "@/lib/db";
import { readEffectiveMembershipTier } from "@/lib/atlas/entitlement";
import { decideLifetimeWrite, type LifetimeWriteDecision } from "@/lib/atlas/lifetime-decision";
import type { LifetimeFromTransaction } from "@/lib/billing/appstore";
import type { LifetimeSource } from "@/lib/atlas/membership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlExecutor = any;

export type LifetimeWriteStatus = LifetimeWriteDecision["action"];

export type LifetimeStore = "appstore" | "play";
const STORE_NAME: Record<LifetimeStore, string> = { appstore: "App Store", play: "Google Play" };

export async function applyLifetimeTransaction(
  userId: string,
  holding: LifetimeFromTransaction,
  store: LifetimeStore = "appstore",
): Promise<{ status: LifetimeWriteStatus }> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const txnId = holding.originalTransactionId;

  return sql.begin(async (tx: SqlExecutor) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${txnId}, 0))`;

    const txnRows = (await tx`
      SELECT user_id, revoked_at, storekit_transaction_id, storekit_signed_at
        FROM user_lifetime_entitlements
       WHERE original_transaction_id = ${txnId}
       FOR UPDATE
    `) as {
      user_id: string;
      revoked_at: string | null;
      storekit_transaction_id: string | null;
      storekit_signed_at: string | null;
    }[];
    const txnRow = txnRows[0] ?? null;

    const liveRows = (await tx`
      SELECT id, source FROM user_lifetime_entitlements
       WHERE user_id = ${userId}::uuid AND revoked_at IS NULL
       FOR UPDATE
    `) as { id: string; source: LifetimeSource }[];
    const userLive = liveRows[0] ?? null;

    const decision = decideLifetimeWrite({
      userId,
      incoming: {
        transactionId: holding.transactionId,
        signedAt: holding.signedAt,
        appAccountToken: holding.appAccountToken,
        revoked: holding.revoked,
      },
      txnRow: txnRow
        ? {
            userId: txnRow.user_id,
            revoked: txnRow.revoked_at !== null,
            transactionId: txnRow.storekit_transaction_id,
            signedAt: txnRow.storekit_signed_at ? new Date(txnRow.storekit_signed_at) : null,
          }
        : null,
      userLive: userLive ? { source: userLive.source } : null,
    });

    const writes = new Set(["insert", "transfer", "refresh", "reinstate", "revoke"]);
    if (!writes.has(decision.action)) return { status: decision.action };

    // Everyone whose effective tier this can move: this account, and on a
    // transfer the account it moves away from.
    const affected = [userId, ...(decision.action === "transfer" && txnRow ? [txnRow.user_id] : [])];
    const before = new Map<string, string>();
    for (const u of affected) before.set(u, await readEffectiveMembershipTier(tx, u));

    const supersede = "supersede" in decision && decision.supersede && userLive;
    if (supersede) {
      await tx`
        UPDATE user_lifetime_entitlements
           SET revoked_at = now(), revoke_reason = ${`superseded by ${STORE_NAME[store]} purchase`}, updated_at = now()
         WHERE id = ${userLive.id}
      `;
    }

    const signed = {
      tid: holding.transactionId,
      at: holding.signedAt,
      token: holding.appAccountToken,
    };
    switch (decision.action) {
      case "insert":
        await tx`
          INSERT INTO user_lifetime_entitlements (
            user_id, source, product_id, original_transaction_id,
            storekit_transaction_id, storekit_signed_at, storekit_app_account_token, granted_by
          ) VALUES (
            ${userId}::uuid, ${store}, ${holding.productId}, ${txnId},
            ${signed.tid}, ${signed.at}, ${signed.token}::uuid, ${store}
          )
        `;
        break;
      case "transfer":
        await tx`
          UPDATE user_lifetime_entitlements
             SET user_id = ${userId}::uuid, revoked_at = NULL, revoke_reason = NULL,
                 storekit_transaction_id = ${signed.tid}, storekit_signed_at = ${signed.at},
                 storekit_app_account_token = ${signed.token}::uuid, updated_at = now()
           WHERE original_transaction_id = ${txnId}
        `;
        break;
      case "reinstate":
      case "refresh":
        await tx`
          UPDATE user_lifetime_entitlements
             SET revoked_at = NULL, revoke_reason = NULL,
                 storekit_transaction_id = ${signed.tid}, storekit_signed_at = ${signed.at},
                 storekit_app_account_token = COALESCE(${signed.token}::uuid, storekit_app_account_token),
                 updated_at = now()
           WHERE original_transaction_id = ${txnId}
        `;
        break;
      case "revoke":
        await tx`
          UPDATE user_lifetime_entitlements
             SET revoked_at = now(), revoke_reason = ${`${STORE_NAME[store]} refund / revocation`},
                 storekit_transaction_id = ${signed.tid}, storekit_signed_at = ${signed.at},
                 updated_at = now()
           WHERE original_transaction_id = ${txnId}
        `;
        break;
    }

    const channel =
      decision.action === "revoke"
        ? "lifetime_revoke"
        : decision.action === "transfer"
          ? "transfer"
          : "lifetime_purchase";
    for (const u of affected) {
      const after = await readEffectiveMembershipTier(tx, u);
      // Like the subscription path: an unchanged tier (a background refresh)
      // is not an event worth recording.
      if (before.get(u) === after && decision.action === "refresh") continue;
      await tx`
        INSERT INTO user_entitlement_events
          (user_id, from_tier, to_tier, channel, reason, actor, original_transaction_id)
        VALUES (${u}::uuid, ${before.get(u) ?? null}, ${after}, ${channel},
                ${supersede ? "superseded a free lifetime holding" : holding.productId},
                ${store}, ${txnId})
      `;
    }
    return { status: decision.action };
  });
}

/** Webhook reverse-map: which account holds this lifetime purchase. */
export async function getUserIdByLifetimeTransaction(originalTransactionId: string): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = (await sql`
      SELECT user_id FROM user_lifetime_entitlements
       WHERE original_transaction_id = ${originalTransactionId}
       LIMIT 1
    `) as { user_id: string }[];
    return rows[0]?.user_id ?? null;
  } catch (err) {
    console.warn("[lifetime] txn->user lookup failed", err);
    return null;
  }
}

/**
 * Give an account a 永久權益 without a purchase: an operator comp ('grant') or
 * the cutover migration for Pro accounts live on the switch day ('legacy_pro').
 * A no-op when the account already holds one from any source — never a second
 * live row, and never touching an App Store holding. `reason` is mandatory for
 * the same reason as Pro grants: it is the only record of why.
 */
export async function grantLifetimeHolding(input: {
  userId: string;
  source: "grant" | "legacy_pro";
  reason: string;
  grantedBy: string;
}): Promise<{ status: "granted" | "already_held" }> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error("reason required");

  return sql.begin(async (tx: SqlExecutor) => {
    // Serialise per account so a double-click (or a re-run of the migration
    // racing an operator) can't hit the one-live-row index.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${"lifetime:" + input.userId}, 0))`;
    const live = (await tx`
      SELECT 1 FROM user_lifetime_entitlements
       WHERE user_id = ${input.userId}::uuid AND revoked_at IS NULL
       LIMIT 1
    `) as unknown[];
    if (live.length > 0) return { status: "already_held" as const };

    const before = await readEffectiveMembershipTier(tx, input.userId);
    await tx`
      INSERT INTO user_lifetime_entitlements (user_id, source, reason, granted_by)
      VALUES (${input.userId}::uuid, ${input.source}, ${reason}, ${input.grantedBy})
    `;
    const after = await readEffectiveMembershipTier(tx, input.userId);
    // Recorded even when the tier does not move (a Pro account getting its
    // lifetime ahead of expiry) — that is exactly the history the ledger keeps.
    await tx`
      INSERT INTO user_entitlement_events (user_id, from_tier, to_tier, channel, reason, actor)
      VALUES (${input.userId}::uuid, ${before}, ${after},
              ${input.source === "legacy_pro" ? "legacy_pro_migration" : "lifetime_grant"},
              ${reason}, ${input.grantedBy})
    `;
    return { status: "granted" as const };
  });
}

/**
 * Revoke an operator-given 永久權益 (grant / legacy_pro). Never an App Store
 * purchase: those end only through Apple's refund, exactly as revoking a Pro
 * grant never cancels a subscription.
 */
export async function revokeLifetimeGrant(input: {
  userId: string;
  reason: string;
  revokedBy: string;
}): Promise<{ revoked: number }> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error("reason required");

  return sql.begin(async (tx: SqlExecutor) => {
    const before = await readEffectiveMembershipTier(tx, input.userId);
    const revoked = (await tx`
      UPDATE user_lifetime_entitlements
         SET revoked_at = now(), revoke_reason = ${reason}, updated_at = now()
       WHERE user_id = ${input.userId}::uuid
         AND revoked_at IS NULL
         AND source IN ('grant', 'legacy_pro')
      RETURNING id
    `) as unknown[];
    if (revoked.length === 0) return { revoked: 0 };
    const after = await readEffectiveMembershipTier(tx, input.userId);
    await tx`
      INSERT INTO user_entitlement_events (user_id, from_tier, to_tier, channel, reason, actor)
      VALUES (${input.userId}::uuid, ${before}, ${after}, 'lifetime_revoke', ${reason}, ${input.revokedBy})
    `;
    return { revoked: revoked.length };
  });
}
