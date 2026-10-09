// The live wiring for lib/billing/play-delivery.ts: Google, Postgres, and the
// credit store. Kept apart so the delivery rules stay testable with fakes.

import { getSql } from "@/lib/db";
import { applyLifetimeTransaction } from "@/lib/atlas/lifetime";
import { deliverPlayCreditPurchase, serverCreditStore } from "@/lib/credits/store-server";
import { serverPlayApi } from "./play";
import type { PlayDeliveryDeps, VoidedDeps } from "./play-delivery";

const applyLifetime: PlayDeliveryDeps["applyLifetime"] = (userId, holding) => applyLifetimeTransaction(userId, holding, "play");

export function serverPlayDelivery(): PlayDeliveryDeps {
  return { api: serverPlayApi(), applyLifetime, applyCredits: deliverPlayCreditPurchase };
}

export function serverPlayVoided(): VoidedDeps {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  return {
    api: serverPlayApi(),
    applyLifetime,
    async findLifetime(key) {
      const [row] = await sql`SELECT user_id, product_id FROM user_lifetime_entitlements
        WHERE original_transaction_id = ${key} AND source = 'play' LIMIT 1`;
      return row ? { userId: row.user_id as string, productId: (row.product_id as string | null) ?? null } : null;
    },
    async findCredits(orderId) {
      const rows = await sql`SELECT environment, user_id, product_id, quantity FROM credit_store_transactions
        WHERE transaction_id = ${orderId}`;
      return rows.map(r => ({ environment: r.environment, userId: r.user_id, productId: r.product_id, quantity: r.quantity }));
    },
    refundCredits: snapshot => serverCreditStore().store.apply(snapshot),
  };
}
