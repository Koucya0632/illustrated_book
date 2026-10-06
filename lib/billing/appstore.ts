// App Store (StoreKit 2) signed-payload types + mapping for Tuji Pro.
//
// Signature verification lives in ./verifier.ts (Apple's SignedDataVerifier),
// which is the default path used by the routes. The `decode*` helpers below do
// NOT verify signatures — they exist only as the fallback the verifier uses when
// APPSTORE_ALLOW_UNVERIFIED=true (sandbox/dev). Do not call them directly from
// routes. `entitlementFromTransaction` maps a decoded transaction either way.

import type { AtlasTier } from "@/lib/atlas/entitlement";
import { normalizeStoreKitAccountToken } from "@/lib/billing/storekit-state";

const PRO_PRODUCT_IDS = new Set([
  "app.tuji.pro.monthly",
  "app.tuji.pro.quarterly",
  "app.tuji.pro.semiannual",
  "app.tuji.pro.yearly",
]);

/** 永久會員 — non-consumable (docs/MEMBERSHIP_SERVER_DESIGN.md §5). */
export const LIFETIME_PRODUCT_ID = "app.tuji.lifetime";

/** JWSTransactionDecodedPayload subset we rely on. */
export interface AppleTransaction {
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  /** ms since epoch; Apple signs every decoded transaction with this ordering value. */
  signedDate?: number;
  /** UUID supplied by Product.PurchaseOption.appAccountToken. */
  appAccountToken?: string;
  /** ms since epoch; present for auto-renewable subscriptions. */
  expiresDate?: number;
  /** ms since epoch; set when refunded / revoked. */
  revocationDate?: number;
  type?: string;
  bundleId?: string;
  environment?: string;
  quantity?: number;
  purchaseDate?: number;
  revocationType?: string;
  revocationPercentage?: number;
}

/** responseBodyV2DecodedPayload subset (App Store Server Notifications V2). */
export interface AppleNotification {
  notificationUUID?: string;
  signedDate?: number;
  notificationType?: string;
  subtype?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    bundleId?: string;
    environment?: string;
  };
}

/** Decode the payload segment of a JWS (base64url middle part). Unverified. */
export function decodeJwsPayload<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("malformed JWS");
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

export function decodeTransaction(signedTransaction: string): AppleTransaction {
  return decodeJwsPayload<AppleTransaction>(signedTransaction);
}

export function decodeNotification(signedPayload: string): AppleNotification {
  return decodeJwsPayload<AppleNotification>(signedPayload);
}

export interface EntitlementFromTransaction {
  tier: AtlasTier;
  source: string;
  expiresAt: Date | null;
  originalTransactionId: string;
  transactionId: string;
  signedAt: Date;
  appAccountToken: string | null;
  /** When Apple refunded / revoked it; null otherwise. Tells a refund apart from natural expiry. */
  revokedAt: Date | null;
}

/**
 * Derive the entitlement a transaction implies. Pro when it's one of our
 * subscription products and neither expired nor revoked; otherwise free
 * (so a lapsed/refunded sub downgrades). expiresAt is stored either way so
 * reads (which also lapse on expiry) stay consistent.
 */
export function entitlementFromTransaction(t: AppleTransaction): EntitlementFromTransaction {
  if (
    !t.originalTransactionId ||
    !t.transactionId ||
    typeof t.signedDate !== "number" ||
    !Number.isFinite(t.signedDate)
  ) {
    throw new Error("transaction identity/order fields required");
  }
  const appAccountToken = normalizeStoreKitAccountToken(t.appAccountToken ?? null);
  if (t.appAccountToken && appAccountToken === null) {
    throw new Error("invalid appAccountToken");
  }
  const now = Date.now();
  const isProProduct = t.productId ? PRO_PRODUCT_IDS.has(t.productId) : false;
  const revoked = typeof t.revocationDate === "number" && t.revocationDate <= now;
  const expired = typeof t.expiresDate === "number" && t.expiresDate <= now;
  const active = isProProduct && !revoked && !expired;
  return {
    tier: active ? "pro" : "free",
    source: "appstore",
    expiresAt: typeof t.expiresDate === "number" ? new Date(t.expiresDate) : null,
    originalTransactionId: t.originalTransactionId,
    transactionId: t.transactionId,
    signedAt: new Date(t.signedDate),
    appAccountToken,
    revokedAt: revoked ? new Date(t.revocationDate!) : null,
  };
}

export interface LifetimeFromTransaction {
  productId: string;
  originalTransactionId: string;
  transactionId: string;
  signedAt: Date;
  appAccountToken: string | null;
  revoked: boolean;
}

export type ClassifiedTransaction =
  | { kind: "subscription"; entitlement: EntitlementFromTransaction }
  | { kind: "lifetime"; holding: LifetimeFromTransaction }
  | { kind: "unknown"; productId: string | null };

/**
 * Route a transaction by product BEFORE anything is written. The subscription
 * mapper alone turns every non-Pro product into tier 'free' on the
 * subscription row — so a lifetime purchase sent there would downgrade a
 * paying Pro subscriber. Unknown products are written nowhere.
 */
export function classifyTransaction(t: AppleTransaction): ClassifiedTransaction {
  if (t.productId && PRO_PRODUCT_IDS.has(t.productId)) {
    return { kind: "subscription", entitlement: entitlementFromTransaction(t) };
  }
  if (t.productId === LIFETIME_PRODUCT_ID) {
    // Same identity/order/token validation as the subscription path.
    const e = entitlementFromTransaction(t);
    return {
      kind: "lifetime",
      holding: {
        productId: LIFETIME_PRODUCT_ID,
        originalTransactionId: e.originalTransactionId,
        transactionId: e.transactionId,
        signedAt: e.signedAt,
        appAccountToken: e.appAccountToken,
        revoked: typeof t.revocationDate === "number" && t.revocationDate <= Date.now(),
      },
    };
  }
  return { kind: "unknown", productId: t.productId ?? null };
}
