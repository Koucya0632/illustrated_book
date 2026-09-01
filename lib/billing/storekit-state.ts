import type { AtlasTier } from "@/lib/atlas/entitlement";

export interface StoredStoreKitState {
  tier: AtlasTier;
  transactionId: string | null;
  signedAt: Date | null;
}

export interface IncomingStoreKitState {
  tier: AtlasTier;
  transactionId: string;
  signedAt: Date;
}

export type StoreKitStateDecision = "apply" | "duplicate" | "stale";

/**
 * StoreKit state is monotonic per original transaction. A later Apple-signed
 * payload may replace an earlier one. An exact replay is idempotent. If two
 * different payloads have the same millisecond timestamp, only a downgrade is
 * allowed; this fails closed instead of letting an ambiguous tie raise access.
 */
export function decideStoreKitState(
  stored: StoredStoreKitState | null,
  incoming: IncomingStoreKitState,
): StoreKitStateDecision {
  if (!stored) return "apply";
  // Rows created before signed-date tracking have no ordering baseline. Do not
  // let an old active JWS raise a recorded free entitlement during migration.
  // A downgrade (or a no-op active refresh) may safely seed the baseline.
  if (!stored.signedAt) {
    return stored.tier === "free" && incoming.tier === "pro" ? "stale" : "apply";
  }

  const currentMs = stored.signedAt.getTime();
  const incomingMs = incoming.signedAt.getTime();
  if (incomingMs > currentMs) return "apply";
  if (incomingMs < currentMs) return "stale";
  if (stored.transactionId === incoming.transactionId) return "duplicate";
  if (stored.tier === "pro" && incoming.tier === "free") return "apply";
  return "stale";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeStoreKitAccountToken(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  return UUID_RE.test(normalized) ? normalized : null;
}

export type StoreKitBindingDecision =
  | "allow"
  | "account_mismatch"
  | "already_bound"
  | "unbound_legacy";

/**
 * New purchases carry appAccountToken and are valid only for that account.
 * Legacy purchases have no token and may only refresh an existing binding. An
 * unbound legacy JWS is a bearer credential, so first claim requires an
 * explicit support-side migration rather than trusting whichever user submits
 * it first.
 */
export function decideStoreKitBinding(input: {
  authenticatedUserId: string;
  appAccountToken: string | null;
  existingUserId: string | null;
}): StoreKitBindingDecision {
  const userId = input.authenticatedUserId.toLowerCase();
  if (input.appAccountToken !== null) {
    return input.appAccountToken === userId ? "allow" : "account_mismatch";
  }
  if (input.existingUserId === null) return "unbound_legacy";
  if (input.existingUserId !== null && input.existingUserId.toLowerCase() !== userId) {
    return "already_bound";
  }
  return "allow";
}
