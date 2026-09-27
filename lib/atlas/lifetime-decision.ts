// What to do with one App Store lifetime (non-consumable) transaction.
// Pure, so the whole matrix is testable; lib/atlas/lifetime.ts carries it out.
//
// Ordering and account binding are the subscription's rules, reused rather than
// restated: decideStoreKitState (Apple's signedDate is monotonic per original
// transaction) and decideStoreKitBinding (appAccountToken — ADR-0005). A live
// holding maps to 'pro' and a revoked one to 'free' only to feed that ordering
// rule, which already knows a downgrade may win a same-millisecond tie.

import { decideStoreKitBinding, decideStoreKitState } from "@/lib/billing/storekit-state";
import type { LifetimeSource } from "@/lib/atlas/membership";

export interface LifetimeIncoming {
  transactionId: string;
  signedAt: Date;
  appAccountToken: string | null;
  /** Apple set revocationDate (refund / revocation). */
  revoked: boolean;
}

/** The row already holding this original_transaction_id, if any. */
export interface LifetimeTxnRow {
  userId: string;
  revoked: boolean;
  transactionId: string | null;
  signedAt: Date | null;
}

export type LifetimeWriteDecision =
  | { action: "insert"; supersede: boolean }
  | { action: "transfer"; supersede: boolean }
  | { action: "refresh" }
  | { action: "reinstate"; supersede: boolean }
  | { action: "revoke" }
  | { action: "duplicate" }
  | { action: "stale" }
  | { action: "ignore" }
  | { action: "already_owned" }
  | { action: "account_mismatch" }
  | { action: "already_bound" }
  | { action: "unbound_legacy" };

export function decideLifetimeWrite(input: {
  userId: string;
  incoming: LifetimeIncoming;
  txnRow: LifetimeTxnRow | null;
  /** The account's live lifetime holding from ANY source, if any. */
  userLive: { source: LifetimeSource } | null;
}): LifetimeWriteDecision {
  const { userId, incoming, txnRow, userLive } = input;

  const state = decideStoreKitState(
    txnRow
      ? { tier: txnRow.revoked ? "free" : "pro", transactionId: txnRow.transactionId, signedAt: txnRow.signedAt }
      : null,
    { tier: incoming.revoked ? "free" : "pro", transactionId: incoming.transactionId, signedAt: incoming.signedAt },
  );
  if (state === "stale") return { action: "stale" };
  if (state === "duplicate" && txnRow?.userId === userId) return { action: "duplicate" };

  const binding = decideStoreKitBinding({
    authenticatedUserId: userId,
    appAccountToken: incoming.appAccountToken,
    existingUserId: txnRow?.userId ?? null,
  });
  if (binding !== "allow") return { action: binding };

  if (incoming.revoked) {
    if (!txnRow) return { action: "ignore" }; // nothing we ever granted
    return txnRow.revoked ? { action: "refresh" } : { action: "revoke" };
  }

  // A paid App Store holding replaces a free one (legacy_pro / grant), so the
  // purchase is recorded and a later refund has a row to revoke. Two paid
  // holdings for one account cannot both be live.
  const liveElsewhere = userLive !== null && !(txnRow && txnRow.userId === userId && !txnRow.revoked);
  if (liveElsewhere && userLive!.source === "appstore") return { action: "already_owned" };
  const supersede = liveElsewhere;

  if (!txnRow) return { action: "insert", supersede };
  if (txnRow.userId !== userId) return { action: "transfer", supersede };
  return txnRow.revoked ? { action: "reinstate", supersede } : { action: "refresh" };
}
