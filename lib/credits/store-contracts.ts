import { z } from "zod";
import type { AppleTransaction } from "../billing/appstore";

/** Approved catalog; actual storefront prices come from StoreKit. */
export const CREDIT_PACKS = Object.freeze({
  "app.tuji.credits.1000": 1000, "app.tuji.credits.4000": 4000, "app.tuji.credits.7000": 7000,
});
export const CREDIT_CATALOG_VERSION = "credit-packs-2026-10-approved";
export const CREDIT_PACK_USD_PRICES = Object.freeze({
  "app.tuji.credits.1000": "0.99", "app.tuji.credits.4000": "2.99", "app.tuji.credits.7000": "4.99",
});
export const isCreditProduct = (id?: string): id is keyof typeof CREDIT_PACKS =>
  id !== undefined && Object.hasOwn(CREDIT_PACKS, id);
export class StoreCreditError extends Error {
  constructor(public readonly code: "invalid_credit_transaction" | "purchase_account_mismatch" | "purchase_identity_conflict") { super(code); }
}
const date = z.number().int().positive().max(8_640_000_000_000_000);
/** Google order ids ("GPA.1234-5678-9012-34567"); Apple's are all digits, so the two never collide. */
export const PLAY_ORDER_ID = /^GPA\.[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{5}$/;
/** The ledger reference of a store purchase — `apple:` or `play:` by the id's own shape. */
export const creditGrantKey = (transactionId: string) =>
  PLAY_ORDER_ID.test(transactionId) ? `play:${transactionId}` : `apple:${transactionId}`;
export const storeSnapshot = z.object({
  transactionId: z.string().refine(v => /^[0-9]{1,64}$/.test(v) || PLAY_ORDER_ID.test(v)), productId: z.enum(["app.tuji.credits.1000", "app.tuji.credits.4000", "app.tuji.credits.7000"]),
  userId: z.string().uuid().transform(v => v.toLowerCase()), environment: z.enum(["production", "sandbox"]),
  quantity: z.number().int().min(1).max(100), signedAt: date,
  kind: z.enum(["purchase", "refund", "reverse"]), refundFraction: z.number().int().min(0).max(100000),
}).strict();
export type StoreSnapshot = z.infer<typeof storeSnapshot>;

/** Only pass output of Apple's strict signature verifier to this mapper. */
export function creditSnapshot(t: AppleTransaction, notification?: { type: string; signedAt: number }): StoreSnapshot {
  if (!isCreditProduct(t.productId) || t.type !== "Consumable" || !["Production", "Sandbox"].includes(t.environment ?? "") ||
      (t.revocationDate !== undefined && !date.safeParse(t.revocationDate).success)) throw new StoreCreditError("invalid_credit_transaction");
  let kind: StoreSnapshot["kind"] = "purchase", fraction = 0;
  if (notification?.type === "REFUND_REVERSED") {
    if (t.revocationDate !== undefined || t.revocationPercentage !== undefined) throw new StoreCreditError("invalid_credit_transaction");
    kind = "reverse";
  } else if (notification?.type === "REFUND" || t.revocationDate !== undefined) {
    if (t.revocationDate === undefined) throw new StoreCreditError("invalid_credit_transaction");
    if (t.revocationType === "REFUND_PRORATED" && t.revocationPercentage === undefined) throw new StoreCreditError("invalid_credit_transaction");
    if (t.revocationType && !["REFUND_FULL", "REFUND_PRORATED"].includes(t.revocationType)) throw new StoreCreditError("invalid_credit_transaction");
    kind = "refund"; fraction = t.revocationPercentage ?? 100000;
  }
  const parsed = storeSnapshot.safeParse({ transactionId: t.transactionId, productId: t.productId,
    userId: t.appAccountToken, environment: t.environment === "Production" ? "production" : "sandbox",
    quantity: t.quantity, signedAt: notification?.signedAt ?? t.signedDate, kind, refundFraction: fraction });
  if (!parsed.success) throw new StoreCreditError("invalid_credit_transaction");
  return parsed.data;
}
