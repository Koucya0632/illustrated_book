import type postgres from "postgres";
import { CreditError, type CreditConfig } from "./policy";
import { canReplaceLegacy } from "./cutover";

/** A server cohort remains authoritative even when new operations are paused. */
export async function isCreditAccount(sql: postgres.Sql | null, userId: string, config: CreditConfig): Promise<boolean> {
  const active = config.mode !== "off" || config.readEnabled;
  if (!sql) {
    if (active) throw new CreditError("credits_unavailable");
    return false;
  }
  try {
    const [row] = await sql`SELECT billing_mode FROM credit_user_policies
      WHERE user_id = ${userId} AND environment = ${config.environment}`;
    if (row?.billing_mode === "credits") return true;
    return config.mode === "live" && config.replaceLegacyEnabled && await canReplaceLegacy(sql, userId);
  } catch (error) {
    // Only a not-yet-migrated database with all credit features off is legacy.
    if (!active && typeof error === "object" && error !== null && "code" in error && error.code === "42P01") return false;
    throw new CreditError("credits_unavailable");
  }
}
