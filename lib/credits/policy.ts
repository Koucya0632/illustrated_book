/** Prices are integer points. Store prices and legacy membership limits stay separate. */
export const CREDIT_POLICY = {
  version: "credits-2026-10-precision-upgrade",
  monthlyGift: 1000,
  checkInDaily: 10,
  checkInMonthlyCap: 300,
  recognition: 100,
  precision: 200,
  /** Precision on a photo whose ordinary recognition already committed. */
  precisionUpgrade: 100,
  lifetimeAtlasSlots: 200,
} as const;

export type CreditEnvironment = "production" | "sandbox";
export type CreditSource = "monthly" | "check_in" | "purchase" | "adjustment";
export type CreditErrorCode =
  | "credits_disabled" | "credits_unavailable" | "credits_not_enrolled"
  | "benefit_disabled" | "benefit_ineligible" | "invalid_credit_configuration"
  | "invalid_credit_request" | "insufficient_credits" | "idempotency_conflict"
  | "reservation_not_found" | "reservation_already_settled" | "credits_reconciliation_required"
  | "check_in_requires_study";

export class CreditError extends Error {
  constructor(public readonly code: CreditErrorCode) { super(code); }
}

export function assertPoints(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
    throw new CreditError("invalid_credit_request");
  }
}

export function assertCreditKey(key: string): void {
  if (!key || key.length > 200 || key.trim() !== key) {
    throw new CreditError("invalid_credit_request");
  }
}

export function utcPeriod(now: Date): { day: string; month: string; nextMonth: Date } {
  const day = now.toISOString().slice(0, 10);
  return {
    day, month: day.slice(0, 7),
    nextMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export interface CreditConfig {
  mode: "off" | "shadow" | "live";
  readEnabled: boolean;
  environment: CreditEnvironment;
  monthlyEnabled: boolean;
  checkInEnabled: boolean;
  replaceLegacyEnabled: boolean;
  monthlyExpiry: "none" | "month_end" | null;
  checkInExpiryDays: number | "none" | null;
}

/** Approved policy: monthly allowance resets; check-in credits never expire. */
export function creditConfig(env: Record<string, string | undefined> = process.env): CreditConfig {
  const mode = env.AI_CREDITS_MODE ?? "off";
  const environment = env.AI_CREDITS_ENVIRONMENT ?? "production";
  if (!["off", "shadow", "live"].includes(mode) ||
      !["production", "sandbox"].includes(environment) ||
      (mode !== "off" && !env.AI_CREDITS_ENVIRONMENT)) {
    throw new CreditError("invalid_credit_configuration");
  }
  return {
    mode: mode as CreditConfig["mode"], environment: environment as CreditEnvironment,
    readEnabled: env.AI_CREDITS_READ_ENABLED === "true",
    monthlyEnabled: env.AI_CREDITS_MONTHLY_ENABLED === "true",
    checkInEnabled: env.AI_CREDITS_CHECK_IN_ENABLED === "true",
    replaceLegacyEnabled: env.AI_CREDITS_REPLACE_LEGACY_ENABLED === "true",
    monthlyExpiry: "month_end",
    checkInExpiryDays: "none",
  };
}

/** Review identities are selected by deployment configuration, never request data. */
export function creditReviewUsers(env: Record<string, string | undefined> = process.env): string[] {
  if (env.AI_CREDITS_REVIEW_ENABLED !== "true") return [];
  const ids = (env.AI_CREDITS_REVIEW_USER_IDS ?? "").split(",").map(id => id.trim().toLowerCase()).filter(Boolean);
  if (!ids.length || ids.length > 20 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))) {
    throw new CreditError("invalid_credit_configuration");
  }
  return [...new Set(ids)];
}

export function userCreditConfig(userId?: string, env: Record<string, string | undefined> = process.env): CreditConfig {
  const config = creditConfig(env);
  if (userId && creditReviewUsers(env).includes(userId.toLowerCase())) {
    return { ...config, environment: "sandbox", mode: "live", readEnabled: true,
      monthlyEnabled: true, checkInEnabled: true, replaceLegacyEnabled: true };
  }
  return config;
}

/** Persisted review work can recover while the public production rollout is off. */
export function creditRecoveryEnvironments(env: Record<string, string | undefined> = process.env): CreditEnvironment[] {
  return [...new Set([creditConfig(env).environment, ...(creditReviewUsers(env).length ? ["sandbox" as const] : [])])];
}
