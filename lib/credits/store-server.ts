import { getSql } from "../db";
import { verifyTransaction, verifyNotification } from "../billing/verifier";
import type { AppleNotification, AppleTransaction } from "../billing/appstore";
import { CreditError, userCreditConfig } from "./policy";
import { createCreditWallet } from "./wallet";
import { creditSnapshot, type StoreSnapshot } from "./store-contracts";
import { createCreditStore } from "./store";

export function serverCreditStore() {
  if (process.env.CREDITS_STORE_PROCESSING_ENABLED !== "true") throw new CreditError("credits_disabled");
  const sql = getSql();
  if (!sql) throw new CreditError("credits_unavailable");
  return { sql, store: createCreditStore(sql) };
}
export async function deliverCreditPurchase(userId: string, signed: string) {
  // Strict verification never honors APPSTORE_ALLOW_UNVERIFIED.
  const verified = await verifyTransaction(signed, true);
  const snapshot = creditSnapshot(verified), { sql, store } = serverCreditStore();
  if (snapshot.environment !== userCreditConfig(userId).environment) throw new CreditError("invalid_credit_configuration");
  const delivered = await store.apply(snapshot, userId);
  const wallet = await createCreditWallet(sql).readWallet({ userId, environment: snapshot.environment });
  return { ...delivered, wallet };
}
export async function receiveCreditNotification(signed: string): Promise<void> {
  const n: AppleNotification = await verifyNotification(signed, true);
  if (!n.data?.signedTransactionInfo || !n.notificationUUID || !n.notificationType || !n.signedDate) throw new Error("invalid credit notification");
  const tx: AppleTransaction = await verifyTransaction(n.data.signedTransactionInfo, true);
  if (tx.environment !== n.data.environment || tx.bundleId !== n.data.bundleId) throw new Error("notification identity mismatch");
  const snapshot = creditSnapshot(tx, { type: n.notificationType, signedAt: n.signedDate });
  const { store } = serverCreditStore();
  await store.receive(snapshot.environment, n.notificationUUID, { snapshot, notificationType: n.notificationType }, signed);
}
/** A Google Play point pack, already verified with Google and mapped by lib/billing/play-purchase.ts. */
export async function deliverPlayCreditPurchase(userId: string, snapshot: StoreSnapshot) {
  const { sql, store } = serverCreditStore();
  if (snapshot.environment !== userCreditConfig(userId).environment) throw new CreditError("invalid_credit_configuration");
  const delivered = await store.apply(snapshot, userId);
  const wallet = await createCreditWallet(sql).readWallet({ userId, environment: snapshot.environment });
  return { ...delivered, wallet };
}
