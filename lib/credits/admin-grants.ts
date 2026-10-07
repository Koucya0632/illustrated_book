import type postgres from "postgres";
import { z } from "zod";
import { CreditError, userCreditConfig } from "./policy";
import { createCreditWallet, type CreditAccount } from "./wallet";

export const adminGrantInput = z.object({
  requestKey: z.string().uuid(),
  amount: z.number().int().min(1).max(2_147_483_647),
  reason: z.string().trim().min(1).max(500),
}).strict();

export function createAdminCreditGrants(sql: postgres.Sql, clock = () => new Date(), configuration = userCreditConfig) {
  const wallet = createCreditWallet(sql, clock, configuration);
  return {
    /** Inspection never enrolls an account or issues monthly benefits. */
    async read(account: CreditAccount) {
      const now = clock();
      const [balance] = await sql`SELECT
        coalesce(sum(remaining - reserved) FILTER (WHERE expires_at IS NULL OR expires_at > ${now}), 0)::text AS available,
        coalesce(sum(reserved), 0)::text AS reserved
        FROM credit_lots WHERE user_id = ${account.userId} AND environment = ${account.environment}`;
      const rows = await sql`SELECT request_key, amount, reason, actor, created_at
        FROM credit_admin_grants WHERE user_id = ${account.userId} AND environment = ${account.environment}
        ORDER BY created_at DESC, request_key LIMIT 50`;
      return { available: balance.available as string, reserved: balance.reserved as string,
        grants: rows.map(row => ({ requestKey: row.request_key as string, amount: row.amount as number,
          reason: row.reason as string, actor: row.actor as string, createdAt: row.created_at.toISOString() as string })) };
    },
    async grant(account: CreditAccount, raw: unknown, actor: string) {
      const input = adminGrantInput.safeParse(raw);
      if (!input.success || !actor.trim() || actor.length > 100) throw new CreditError("invalid_credit_request");
      const config = configuration(account.userId);
      if (config.mode !== "live") throw new CreditError("credits_disabled");
      if (account.environment !== config.environment) throw new CreditError("invalid_credit_configuration");
      const body = input.data;
      return wallet.transact(account, async scope => {
        const tx = scope.sql;
        const [prior] = await tx`SELECT amount, reason, actor FROM credit_admin_grants
          WHERE user_id = ${account.userId} AND environment = ${account.environment} AND request_key = ${body.requestKey}`;
        if (prior) {
          if (prior.amount !== body.amount || prior.reason !== body.reason || prior.actor !== actor) {
            throw new CreditError("idempotency_conflict");
          }
          return { granted: false, amount: body.amount };
        }
        const [holding] = await tx`SELECT id FROM user_lifetime_entitlements
          WHERE user_id = ${account.userId} AND revoked_at IS NULL LIMIT 1 FOR SHARE`;
        if (!holding) throw new CreditError("benefit_ineligible");
        const key = `admin:grant:${body.requestKey}`;
        const granted = await scope.grant({ key, source: "adjustment", amount: body.amount, expiresAt: null });
        const [lot] = await tx`SELECT id FROM credit_lots
          WHERE user_id = ${account.userId} AND environment = ${account.environment} AND grant_key = ${key}`;
        await tx`INSERT INTO credit_admin_grants(user_id, environment, request_key, lot_id, amount, reason, actor, created_at)
          VALUES (${account.userId}, ${account.environment}, ${body.requestKey}, ${lot.id}, ${body.amount},
            ${body.reason}, ${actor}, ${scope.now})`;
        return { granted, amount: body.amount };
      });
    },
  };
}
