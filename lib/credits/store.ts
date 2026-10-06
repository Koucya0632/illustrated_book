import { createHash } from "node:crypto";
import { z } from "zod";
import type postgres from "postgres";
import { createCreditWallet } from "./wallet";
import { CREDIT_PACKS, CREDIT_CATALOG_VERSION, StoreCreditError, storeSnapshot, type StoreSnapshot } from "./store-contracts";
import type { CreditEnvironment } from "./policy";

const inboxPayload = z.object({ snapshot: storeSnapshot, notificationType: z.string().min(1).max(100) }).strict();
export function createCreditStore(sql: postgres.Sql, clock = () => new Date()) {
  const wallet = createCreditWallet(sql, clock);
  async function apply(raw: StoreSnapshot, expectedUserId?: string, notificationId?: string) {
    const parsed = storeSnapshot.safeParse(raw);
    if (!parsed.success) throw new StoreCreditError("invalid_credit_transaction");
    const s = parsed.data;
    if (expectedUserId && s.userId !== expectedUserId.toLowerCase()) throw new StoreCreditError("purchase_account_mismatch");
    const a = { userId: s.userId, environment: s.environment };
    return wallet.transact(a, async scope => {
      const tx = scope.sql;
      // Apple transaction IDs are globally bound within their signed environment.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`credit-store:${s.environment}:${s.transactionId}`}, 0))`;
      const [previous] = await tx`SELECT * FROM credit_store_transactions
        WHERE environment = ${s.environment} AND transaction_id = ${s.transactionId}`;
      if (previous && (previous.user_id !== s.userId || previous.product_id !== s.productId || previous.quantity !== s.quantity)) {
        throw new StoreCreditError("purchase_identity_conflict");
      }
      const points = previous?.points ?? CREDIT_PACKS[s.productId] * s.quantity;
      let record = previous;
      if (!record) {
        [record] = await tx`INSERT INTO credit_store_transactions
          (environment, transaction_id, user_id, product_id, quantity, points, catalog_version, last_event_at)
          VALUES (${s.environment}, ${s.transactionId}, ${s.userId}, ${s.productId}, ${s.quantity}, ${points},
            ${CREDIT_CATALOG_VERSION}, ${new Date(s.signedAt)}) RETURNING *`;
      }
      let granted = false;
      // A refund-before-verify is a durable tombstone. A later old purchase cannot resurrect it.
      if (!record.lot_id) {
        granted = await scope.grant({ key: `apple:${s.transactionId}`, source: "purchase", amount: points, expiresAt: null });
        const [lot] = await tx`SELECT id FROM credit_lots WHERE user_id = ${s.userId} AND environment = ${s.environment}
          AND grant_key = ${`apple:${s.transactionId}`}`;
        await tx`UPDATE credit_store_transactions SET lot_id = ${lot.id} WHERE environment = ${s.environment} AND transaction_id = ${s.transactionId}`;
        record = { ...record, lot_id: lot.id };
      }
      const eventTime = new Date(s.signedAt);
      if (s.kind !== "purchase" && eventTime >= record.last_event_at) {
        const target = s.kind === "reverse" ? 0 : Math.floor(points * s.refundFraction / 100000);
        if (previous && eventTime.getTime() === record.last_event_at.getTime() && target !== record.refund_points) {
          throw new StoreCreditError("purchase_identity_conflict");
        }
        if (target < record.withdrawn_points) {
          const restored = record.withdrawn_points - target;
          await tx`UPDATE credit_lots SET remaining = remaining + ${restored} WHERE id = ${record.lot_id}`;
          await scope.record("refund_reverse", restored, `apple:${s.transactionId}`);
          record = { ...record, withdrawn_points: target };
        }
        await tx`UPDATE credit_store_transactions SET refund_points = ${target},
          withdrawn_points = ${record.withdrawn_points}, consumed_points = 0, last_event_at = ${eventTime}
          WHERE environment = ${s.environment} AND transaction_id = ${s.transactionId}`;
        await scope.reconcileRefunds();
      }
      if (notificationId) await tx`UPDATE credit_store_notifications SET state = 'processed', processed_at = ${scope.now}
        WHERE environment = ${s.environment} AND notification_id = ${notificationId}`;
      const [current] = await tx`SELECT refund_points, consumed_points FROM credit_store_transactions
        WHERE environment = ${s.environment} AND transaction_id = ${s.transactionId}`;
      return { deliveryAck: true as const, status: current.refund_points > 0 ? "revoked" : granted ? "credited" : "duplicate",
        transactionId: s.transactionId, environment: s.environment, points, refundedPoints: current.refund_points,
        refundConsumedPoints: current.consumed_points };
    });
  }
  return {
    /** Call only with a strictly verified, server-mapped Apple payload. */
    apply,
    async receive(environment: CreditEnvironment, id: string, raw: z.infer<typeof inboxPayload>, signedPayload?: string) {
      if (signedPayload !== undefined && (!signedPayload || signedPayload.length > 262144)) {
        throw new StoreCreditError("invalid_credit_transaction");
      }
      if (!z.string().uuid().safeParse(id).success) throw new StoreCreditError("invalid_credit_transaction");
      const parsed = inboxPayload.safeParse(raw);
      if (!parsed.success || parsed.data.snapshot.environment !== environment) throw new StoreCreditError("invalid_credit_transaction");
      const payload = parsed.data, hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex"), now = clock();
      await sql.begin(async tx => {
        await tx`INSERT INTO credit_store_notifications (environment, notification_id, payload_hash, payload, next_attempt_at, created_at)
          VALUES (${environment}, ${id}, ${hash}, ${tx.json(payload)}, ${now}, ${now}) ON CONFLICT DO NOTHING`;
        const [saved] = await tx`SELECT payload_hash FROM credit_store_notifications WHERE environment = ${environment} AND notification_id = ${id}`;
        if (saved.payload_hash !== hash) throw new StoreCreditError("purchase_identity_conflict");
        if (signedPayload) await tx`UPDATE credit_store_notifications SET signed_payload = coalesce(signed_payload, ${signedPayload})
          WHERE environment = ${environment} AND notification_id = ${id}`;
      });
    },
    async process(environment: CreditEnvironment, id: string) {
      const [row] = await sql`SELECT * FROM credit_store_notifications WHERE environment = ${environment} AND notification_id = ${id}`;
      if (!row || row.state !== "pending") return "idle";
      const payload = inboxPayload.parse(row.payload);
      if (!["REFUND", "REFUND_REVERSED"].includes(payload.notificationType)) {
        await sql`UPDATE credit_store_notifications SET state = 'ignored', processed_at = ${clock()} WHERE environment = ${environment} AND notification_id = ${id}`;
        return "ignored";
      }
      try { return await apply(payload.snapshot, undefined, id); }
      catch (error) {
        await sql`UPDATE credit_store_notifications SET attempts = attempts + 1,
          next_attempt_at = ${new Date(clock().getTime() + Math.min(86_400_000, 60_000 * 2 ** Math.min(row.attempts, 10)))}
          WHERE environment = ${environment} AND notification_id = ${id} AND state = 'pending'`;
        throw error;
      }
    },
    scan(limit = 10) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new StoreCreditError("invalid_credit_transaction");
      return sql`SELECT environment, notification_id FROM credit_store_notifications
        WHERE state = 'pending' AND next_attempt_at <= ${clock()} ORDER BY next_attempt_at, created_at LIMIT ${limit}`;
    },
  };
}
