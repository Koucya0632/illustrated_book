import type postgres from "postgres";
import type { CreditEnvironment } from "./policy";

export interface CreditAudit {
  environment: CreditEnvironment;
  checkedAt: string;
  accounts: string;
  mismatches: { check: string; userId: string; reference: string }[];
  truncated: boolean;
}
/** Read-only, consistent snapshot. Does not expire gifts, enroll accounts or repair balances. */
export async function auditCredits(sql: postgres.Sql, environment: CreditEnvironment, userId: string | null = null): Promise<CreditAudit> {
  return sql.begin("isolation level repeatable read read only", async tx => {
    const [snapshot] = await tx`SELECT now() AS now, count(*)::text AS accounts FROM credit_accounts
      WHERE environment = ${environment} AND (${userId}::uuid IS NULL OR user_id = ${userId}::uuid)`;
    const rows = await tx`
      WITH accounts AS (
        SELECT * FROM credit_accounts WHERE environment = ${environment}
          AND (${userId}::uuid IS NULL OR user_id = ${userId}::uuid)
      ), lots AS (
        SELECT l.user_id, sum(l.remaining) AS remaining, sum(l.reserved) AS reserved
        FROM credit_lots l JOIN accounts a USING(user_id, environment) GROUP BY l.user_id
      ), ledger AS (
        SELECT l.user_id, sum(l.amount) AS remaining, sum(l.reserved_delta) AS reserved,
          max(l.wallet_version) AS version, count(*) AS entries
        FROM credit_ledger l JOIN accounts a USING(user_id, environment) GROUP BY l.user_id
      ), allocations AS (
        SELECT x.user_id, x.operation_key, sum(x.amount) AS amount
        FROM credit_operation_allocations x JOIN accounts a USING(user_id, environment)
        GROUP BY x.user_id, x.operation_key
      ), held AS (
        SELECT x.lot_id, sum(x.amount) AS amount FROM credit_operation_allocations x
        JOIN credit_reservations r USING(user_id, environment, operation_key)
        JOIN accounts a USING(user_id, environment) WHERE r.state = 'reserved' GROUP BY x.lot_id
      ), issues AS (
        SELECT 'wallet_ledger' AS "check", a.user_id, a.wallet_version::text AS reference
        FROM accounts a LEFT JOIN lots l USING(user_id) LEFT JOIN ledger e USING(user_id)
        WHERE coalesce(l.remaining,0) <> coalesce(e.remaining,0)
          OR coalesce(l.reserved,0) <> coalesce(e.reserved,0)
          OR a.wallet_version <> coalesce(e.version,0) OR a.wallet_version <> coalesce(e.entries,0)
        UNION ALL
        SELECT 'reservation_allocation', r.user_id, r.operation_key FROM credit_reservations r
        JOIN accounts a USING(user_id, environment) LEFT JOIN allocations x USING(user_id, operation_key)
        WHERE r.amount <> coalesce(x.amount,0)
        UNION ALL
        SELECT 'lot_reserved', l.user_id, l.id::text FROM credit_lots l
        JOIN accounts a USING(user_id, environment) LEFT JOIN held h ON h.lot_id = l.id
        WHERE l.reserved <> coalesce(h.amount,0)
        UNION ALL
        SELECT 'benefit_grant', b.user_id, b.kind || ':' || b.period
        FROM credit_benefit_claims b JOIN accounts a USING(user_id, environment)
        LEFT JOIN credit_lots l ON l.user_id = b.user_id AND l.environment = b.environment
          AND l.grant_key = 'benefit:' || b.kind || ':' || b.period
        WHERE b.amount > 0 AND (l.id IS NULL OR l.issued <> b.amount OR l.source <> b.kind)
        UNION ALL
        SELECT 'store_grant', s.user_id, s.transaction_id FROM credit_store_transactions s
        JOIN accounts a USING(user_id, environment) LEFT JOIN credit_lots l
          ON l.id = s.lot_id AND l.user_id = s.user_id AND l.environment = s.environment
        WHERE l.id IS NULL OR l.source <> 'purchase' OR l.issued <> s.points OR l.expires_at IS NOT NULL
        UNION ALL
        SELECT 'compensation', c.user_id, c.operation_key FROM credit_compensations c
        JOIN accounts a USING(user_id, environment) JOIN credit_reservations r USING(user_id, environment, operation_key)
        WHERE r.state <> 'committed' OR c.amount <> r.amount
      ) SELECT "check", user_id, reference FROM issues ORDER BY "check", user_id, reference LIMIT 101
    `;
    return {
      environment, checkedAt: snapshot.now.toISOString(), accounts: snapshot.accounts,
      mismatches: rows.slice(0, 100).map(r => ({ check: r.check, userId: r.user_id, reference: r.reference })),
      truncated: rows.length > 100,
    };
  }) as Promise<CreditAudit>;
}
