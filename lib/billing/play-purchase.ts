// What one Google Play purchase is, in the terms the App Store path already
// writes. Pure, so the whole matrix is testable without Google.
//
// Play sells the same two things iOS does under 罐頭點數 billing: 永久會員
// (a one-time product, acknowledged) and the point packs (consumables,
// consumed). Pro subscriptions are not sold on Android.
//
// Account binding is ADR-0005's appAccountToken rule with Google's name for it:
// the app sets obfuscatedAccountId = the Tuji user id on every purchase, and a
// purchase without it — or with someone else's — is never granted.

import type { LifetimeFromTransaction } from "./appstore";
import type { ProductPurchase } from "./play";
import { isCreditProduct, PLAY_ORDER_ID, storeSnapshot, type StoreSnapshot } from "../credits/store-contracts";

export const PLAY_LIFETIME_PRODUCT = "app.tuji.lifetime";

export type PlayPurchaseErrorCode =
  | "unsupported_product"
  /** Slow payment method (cash at a store, …): nothing to grant yet. */
  | "purchase_pending"
  /** Canceled or refunded. */
  | "purchase_not_active"
  | "purchase_account_mismatch"
  | "invalid_purchase";

export class PlayPurchaseError extends Error {
  constructor(public readonly code: PlayPurchaseErrorCode) { super(code); }
}

export type PlayClassified =
  | { kind: "lifetime"; holding: LifetimeFromTransaction; acknowledged: boolean }
  | { kind: "credits"; snapshot: StoreSnapshot; consumed: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The key a Play lifetime holding is stored under — never a bare order id, so it cannot meet an Apple one. */
export const playLifetimeKey = (orderId: string) => `play:${orderId}`;

export function classifyPlayPurchase(productId: string, p: ProductPurchase, userId: string): PlayClassified {
  const lifetime = productId === PLAY_LIFETIME_PRODUCT;
  if (!lifetime && !isCreditProduct(productId)) throw new PlayPurchaseError("unsupported_product");
  if (p.purchaseState === 2) throw new PlayPurchaseError("purchase_pending");
  if (p.purchaseState !== 0) throw new PlayPurchaseError("purchase_not_active");

  const account = p.obfuscatedExternalAccountId?.toLowerCase() ?? null;
  if (!account || !UUID.test(account) || account !== userId.toLowerCase()) {
    throw new PlayPurchaseError("purchase_account_mismatch");
  }
  const orderId = p.orderId;
  if (!orderId || !PLAY_ORDER_ID.test(orderId)) throw new PlayPurchaseError("invalid_purchase");
  const purchasedAt = Number(p.purchaseTimeMillis);
  if (!Number.isSafeInteger(purchasedAt) || purchasedAt <= 0) throw new PlayPurchaseError("invalid_purchase");

  if (lifetime) {
    return {
      kind: "lifetime",
      holding: {
        productId,
        originalTransactionId: playLifetimeKey(orderId),
        transactionId: orderId,
        signedAt: new Date(purchasedAt),
        appAccountToken: account,
        revoked: false,
      },
      acknowledged: p.acknowledgementState === 1,
    };
  }

  const parsed = storeSnapshot.safeParse({
    transactionId: orderId,
    productId,
    userId: account,
    // A license tester's purchase is Play's sandbox: no money moved.
    environment: p.purchaseType === 0 ? "sandbox" : "production",
    quantity: p.quantity ?? 1,
    signedAt: purchasedAt,
    kind: "purchase",
    refundFraction: 0,
  });
  if (!parsed.success) throw new PlayPurchaseError("invalid_purchase");
  return { kind: "credits", snapshot: parsed.data, consumed: p.consumptionState === 1 };
}
