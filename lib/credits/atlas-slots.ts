import type postgres from "postgres";
import { CREDIT_POLICY, CreditError, TRIAL_POLICY, trialActive, type CreditConfig } from "./policy";

/**
 * 自製圖鑑 slots a credit account may fill with AI recognitions: the lifetime
 * plan's, or after the trial switch a few for free accounts, so a recognition
 * paid with 試用點數 can be kept.
 */
export async function creditAtlasSlots(
  sql: postgres.Sql | postgres.TransactionSql, userId: string, config: Pick<CreditConfig, "trialStartsAt">, now: Date,
): Promise<number> {
  const [permanent] = await sql`SELECT id FROM user_lifetime_entitlements
    WHERE user_id = ${userId} AND revoked_at IS NULL LIMIT 1`;
  if (permanent) return CREDIT_POLICY.lifetimeAtlasSlots;
  if (trialActive(config, now)) return TRIAL_POLICY.freeAtlasSlots;
  throw new CreditError("benefit_ineligible");
}
