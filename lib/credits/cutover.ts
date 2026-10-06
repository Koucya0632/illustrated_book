import type postgres from "postgres";
import { CREDIT_POLICY } from "./policy";
import type { CreditAccount } from "./wallet";

/** Valid lifetime holdings switch immediately, including accounts with active Pro. */
export async function canReplaceLegacy(sql: postgres.Sql | postgres.TransactionSql, userId: string) {
  const [row] = await sql`SELECT
    EXISTS (SELECT 1 FROM user_lifetime_entitlements WHERE user_id = ${userId} AND revoked_at IS NULL) AS eligible`;
  return row.eligible === true;
}

/** Caller holds the credit account lock; policy and the first automatic allowance share one commit. */
export async function replaceLegacyInTransaction(tx: postgres.TransactionSql, account: CreditAccount, now: Date) {
  if (!await canReplaceLegacy(tx, account.userId)) return false;
  const [previous] = await tx`SELECT billing_mode FROM credit_user_policies
    WHERE user_id = ${account.userId} AND environment = ${account.environment}`;
  await tx`INSERT INTO credit_user_policies(user_id, environment, billing_mode, updated_at)
    VALUES (${account.userId}, ${account.environment}, 'credits', ${now})
    ON CONFLICT(user_id, environment) DO UPDATE SET billing_mode = 'credits', updated_at = excluded.updated_at`;
  await tx`INSERT INTO credit_policy_events(user_id, environment, policy_version, previous_mode, billing_mode, actor, created_at)
    VALUES (${account.userId}, ${account.environment}, ${CREDIT_POLICY.version}, ${previous?.billing_mode ?? "legacy"},
      'credits', 'automatic_cutover', ${now}) ON CONFLICT DO NOTHING`;
  return true;
}
