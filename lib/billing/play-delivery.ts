// Deliver a Google Play purchase, and take back a voided one.
//
// Order matters, and it is the reverse of what feels natural: **grant first,
// then acknowledge / consume.** Google refunds a purchase that is not
// acknowledged within three days, so a grant that fails leaves the money to be
// returned on its own — while an acknowledge that lands before a failed grant
// would keep money for nothing. Both writes are idempotent, so the client
// re-sending the same token after a crash only finishes what was started.
//
// Refunds have no push here: there is no Pub/Sub. A daily cron reads Google's
// Voided Purchases API (30 days deep) and revokes what it finds. Every voided
// order is applied through the same idempotent writes, so re-reading the whole
// window each day costs nothing and a missed day loses nothing.

import { applyLifetimeTransaction, type LifetimeWriteStatus } from "@/lib/atlas/lifetime";
import type { StoreSnapshot } from "@/lib/credits/store-contracts";
import type { PlayApi } from "./play";
import { classifyPlayPurchase, playLifetimeKey, PLAY_LIFETIME_PRODUCT } from "./play-purchase";

export interface CreditDelivery {
  deliveryAck: true;
  /** credited, duplicate, or revoked (refunded before it was ever delivered). */
  status: string;
  transactionId: string;
  environment: string;
  [k: string]: unknown;
}

export interface PlayDeliveryDeps {
  api: PlayApi;
  applyLifetime: (userId: string, holding: Parameters<typeof applyLifetimeTransaction>[1]) => Promise<{ status: LifetimeWriteStatus }>;
  /** Grant (or re-read) a point pack; throws when credits are off or the environment is wrong. */
  applyCredits: (userId: string, snapshot: StoreSnapshot) => Promise<CreditDelivery>;
}

/** Statuses after which the purchase is ours to keep. Anything else is left for Google to refund. */
const LIFETIME_KEEPS = new Set<LifetimeWriteStatus>(["insert", "transfer", "refresh", "reinstate", "duplicate"]);

export type PlayDelivery =
  | { kind: "lifetime"; status: LifetimeWriteStatus; acknowledged: boolean }
  | { kind: "credits"; acknowledged: boolean; delivery: CreditDelivery };

export async function deliverPlayPurchase(deps: PlayDeliveryDeps, userId: string, productId: string, token: string): Promise<PlayDelivery> {
  const purchase = await deps.api.getProductPurchase(productId, token);
  const classified = classifyPlayPurchase(productId, purchase, userId);

  if (classified.kind === "lifetime") {
    const { status } = await deps.applyLifetime(userId, classified.holding);
    let acknowledged = classified.acknowledged;
    if (LIFETIME_KEEPS.has(status) && !acknowledged) {
      await deps.api.acknowledgeProductPurchase(productId, token);
      acknowledged = true;
    }
    return { kind: "lifetime", status, acknowledged };
  }

  const delivery = await deps.applyCredits(userId, classified.snapshot);
  let acknowledged = classified.consumed;
  if (delivery.status !== "revoked" && !acknowledged) {
    // Consuming acknowledges too, and frees the pack to be bought again.
    await deps.api.consumeProductPurchase(productId, token);
    acknowledged = true;
  }
  return { kind: "credits", acknowledged, delivery };
}

export interface VoidedDeps {
  api: PlayApi;
  /** The account and product a Play lifetime order was granted to, if it ever was. */
  findLifetime: (key: string) => Promise<{ userId: string; productId: string | null } | null>;
  applyLifetime: PlayDeliveryDeps["applyLifetime"];
  /** Every credit row bought with this order (one per environment at most). */
  findCredits: (orderId: string) => Promise<Pick<StoreSnapshot, "environment" | "userId" | "productId" | "quantity">[]>;
  refundCredits: (snapshot: StoreSnapshot) => Promise<unknown>;
}

export async function sweepPlayVoided(deps: VoidedDeps, since: Date) {
  const voided = await deps.api.listVoidedPurchases(since);
  let lifetime = 0, credits = 0, unknown = 0, failed = 0;
  for (const v of voided) {
    if (!v.orderId) { unknown++; continue; }
    try {
      const held = await deps.findLifetime(playLifetimeKey(v.orderId));
      if (held) {
        const { status } = await deps.applyLifetime(held.userId, {
          productId: held.productId ?? PLAY_LIFETIME_PRODUCT,
          originalTransactionId: playLifetimeKey(v.orderId),
          transactionId: v.orderId,
          signedAt: v.voidedAt,
          appAccountToken: held.userId,
          revoked: true,
        });
        if (status === "revoke") lifetime++;
        continue;
      }
      const rows = await deps.findCredits(v.orderId);
      if (!rows.length) { unknown++; continue; } // never granted: nothing to take back
      for (const row of rows) {
        await deps.refundCredits({ ...row, transactionId: v.orderId, signedAt: v.voidedAt.getTime(), kind: "refund", refundFraction: 100000 });
        credits++;
      }
    } catch (error) {
      failed++;
      console.error("[play-voided] could not apply", v.orderId, error);
    }
  }
  return { seen: voided.length, lifetime, credits, unknown, failed };
}
