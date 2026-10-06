import type postgres from "postgres";
import { z } from "zod";
import type { CreditAccount } from "./wallet";

/** Use with alias t. An operator closes only the exact Apple refund event they reviewed. */
export function refundReviewCondition(sql: postgres.Sql | postgres.TransactionSql) {
  return sql`t.refund_points > t.withdrawn_points + coalesce((
    SELECT r.resolved_points FROM credit_refund_resolutions r
    WHERE r.user_id = t.user_id AND r.environment = t.environment AND r.transaction_id = t.transaction_id
      AND r.refund_event_at = t.last_event_at AND r.refund_points = t.refund_points
  ), 0)`;
}

export const refundResolutionInput = z.object({
  requestKey: z.string().uuid(), transactionId: z.string().min(1).max(100),
  expectedEventAt: z.string().datetime(), expectedRefundPoints: z.number().int().positive(),
  expectedConsumedPoints: z.number().int().positive(), reason: z.string().trim().min(1).max(500),
}).strict();

export class RefundReviewError extends Error {
  constructor(public readonly code: "invalid_request" | "refund_not_found" | "refund_changed" |
    "refund_has_reservations" | "refund_already_resolved" | "idempotency_conflict") { super(code); }
}

export function createRefundReview(sql: postgres.Sql, clock = () => new Date()) {
  return {
    /** Read-only: no wallet read, enrollment, expiry, benefits or automatic deductions. */
    async readCases(account: CreditAccount) {
      const rows = await sql`SELECT t.transaction_id, t.product_id, t.refund_points, t.withdrawn_points,
        t.consumed_points, t.last_event_at, l.reserved, ${refundReviewCondition(sql)} AS needs_review,
        r.reason, r.actor, r.created_at AS resolved_at, r.resolved_points
        FROM credit_store_transactions t JOIN credit_lots l ON l.id = t.lot_id
        LEFT JOIN credit_refund_resolutions r ON r.user_id = t.user_id AND r.environment = t.environment
          AND r.transaction_id = t.transaction_id AND r.refund_event_at = t.last_event_at
          AND r.refund_points = t.refund_points
        WHERE t.user_id = ${account.userId} AND t.environment = ${account.environment} AND t.refund_points > 0
        ORDER BY t.last_event_at DESC, t.transaction_id LIMIT 100`;
      return rows.map(row => ({ transactionId: row.transaction_id as string, productId: row.product_id as string,
        refundPoints: row.refund_points as number, withdrawnPoints: row.withdrawn_points as number,
        consumedPoints: row.consumed_points as number, reserved: row.reserved as number,
        eventAt: row.last_event_at.toISOString() as string, needsReview: row.needs_review as boolean,
        resolution: row.resolved_at ? { points: row.resolved_points as number, reason: row.reason as string,
          actor: row.actor as string, createdAt: row.resolved_at.toISOString() as string } : null }));
    },
    /** Records completed manual handling; no points are granted, transferred or removed. */
    async resolve(account: CreditAccount, raw: unknown, actor: string) {
      const input = refundResolutionInput.safeParse(raw);
      if (!input.success || !actor.trim() || actor.length > 100) throw new RefundReviewError("invalid_request");
      const body = input.data;
      return sql.begin(async tx => {
        // Same row lock as wallet, Apple refunds, compensations and settlements.
        await tx`SELECT wallet_version FROM credit_accounts
          WHERE user_id = ${account.userId} AND environment = ${account.environment} FOR UPDATE`;
        const [prior] = await tx`SELECT * FROM credit_refund_resolutions WHERE user_id = ${account.userId}
          AND environment = ${account.environment} AND request_key = ${body.requestKey}`;
        if (prior) {
          if (prior.transaction_id !== body.transactionId || prior.refund_event_at.toISOString() !== body.expectedEventAt ||
              prior.refund_points !== body.expectedRefundPoints || prior.resolved_points !== body.expectedConsumedPoints ||
              prior.reason !== body.reason || prior.actor !== actor) throw new RefundReviewError("idempotency_conflict");
          return { resolved: true as const, duplicate: true, points: prior.resolved_points as number };
        }
        const [row] = await tx`SELECT t.*, l.reserved, ${refundReviewCondition(tx)} AS needs_review
          FROM credit_store_transactions t JOIN credit_lots l ON l.id = t.lot_id
          WHERE t.user_id = ${account.userId} AND t.environment = ${account.environment}
            AND t.transaction_id = ${body.transactionId}`;
        if (!row) throw new RefundReviewError("refund_not_found");
        if (row.last_event_at.toISOString() !== body.expectedEventAt || row.refund_points !== body.expectedRefundPoints ||
            row.consumed_points !== body.expectedConsumedPoints) throw new RefundReviewError("refund_changed");
        if (row.reserved > 0) throw new RefundReviewError("refund_has_reservations");
        if (!row.needs_review) throw new RefundReviewError("refund_already_resolved");
        if (row.refund_points - row.withdrawn_points !== row.consumed_points) throw new RefundReviewError("refund_changed");
        await tx`INSERT INTO credit_refund_resolutions(user_id, environment, request_key, transaction_id,
          refund_event_at, refund_points, resolved_points, reason, actor, created_at)
          VALUES (${account.userId}, ${account.environment}, ${body.requestKey}, ${body.transactionId},
            ${row.last_event_at}, ${row.refund_points}, ${row.consumed_points}, ${body.reason}, ${actor}, ${clock()})`;
        return { resolved: true as const, duplicate: false, points: row.consumed_points as number };
      });
    },
  };
}
