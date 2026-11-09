/** Prices are integer points. Store prices and legacy membership limits stay separate. */
export const CREDIT_POLICY = {
  version: "credits-2026-10-precision-upgrade",
  /** Before the trial switch (`AI_CREDITS_TRIAL_STARTS_AT`); see `TRIAL_POLICY` for after it. */
  monthlyGift: 1000,
  checkInDaily: 10,
  checkInMonthlyCap: 300,
  recognition: 100,
  precision: 200,
  /** Precision on a photo whose ordinary recognition already committed. */
  precisionUpgrade: 100,
  lifetimeAtlasSlots: 200,
} as const;

/**
 * From `AI_CREDITS_TRIAL_STARTS_AT` (docs/adr/0001 in the parent repo): free accounts
 * get one never-expiring 試用點數 grant, a lifetime bought after the switch brings a
 * never-expiring 首購禮 that replaces that month's allowance, and the allowance drops
 * to 500 from the month after the switch.
 */
export const TRIAL_POLICY = {
  version: "credits-2026-11-trial",
  trialGrant: 150,
  firstPurchaseGift: 1000,
  monthlyGift: 500,
  freeAtlasSlots: 3,
} as const;

export function trialActive(config: Pick<CreditConfig, "trialStartsAt">, now: Date): boolean {
  return config.trialStartsAt !== null && now >= config.trialStartsAt;
}

/** The allowance for a UTC month ("2026-12"); the switch month keeps the old amount. */
export function monthlyGiftFor(config: Pick<CreditConfig, "trialStartsAt">, month: string) {
  const start = config.trialStartsAt;
  return start && month > start.toISOString().slice(0, 7)
    ? { amount: TRIAL_POLICY.monthlyGift, version: TRIAL_POLICY.version }
    : { amount: CREDIT_POLICY.monthlyGift, version: CREDIT_POLICY.version };
}

/** 自製圖鑑 slots of a free credit account. */
export function freeCreditAtlasSlots(config: Pick<CreditConfig, "trialStartsAt">, now: Date): number {
  return trialActive(config, now) ? TRIAL_POLICY.freeAtlasSlots : 0;
}

/** What clients are told: the numbers in force at `now`. */
export function effectiveCreditPolicy(config: Pick<CreditConfig, "trialStartsAt">, now: Date) {
  const monthly = monthlyGiftFor(config, utcPeriod(now).month);
  if (!trialActive(config, now)) return { ...CREDIT_POLICY, trialGrant: 0, firstPurchaseGift: 0, freeAtlasSlots: 0 };
  return { ...CREDIT_POLICY, version: TRIAL_POLICY.version, monthlyGift: monthly.amount,
    trialGrant: TRIAL_POLICY.trialGrant, firstPurchaseGift: TRIAL_POLICY.firstPurchaseGift,
    freeAtlasSlots: TRIAL_POLICY.freeAtlasSlots };
}

export type CreditEnvironment = "production" | "sandbox";
export type CreditSource = "monthly" | "check_in" | "purchase" | "adjustment" | "trial" | "first_purchase";
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
  /** When free accounts join the points system with 試用點數; null keeps the October policy. */
  trialStartsAt: Date | null;
}

/** Approved policy: monthly allowance resets; check-in credits never expire. */
export function creditConfig(env: Record<string, string | undefined> = process.env): CreditConfig {
  const mode = env.AI_CREDITS_MODE ?? "off";
  const environment = env.AI_CREDITS_ENVIRONMENT ?? "production";
  const trialStartsAt = env.AI_CREDITS_TRIAL_STARTS_AT ? new Date(env.AI_CREDITS_TRIAL_STARTS_AT) : null;
  if (!["off", "shadow", "live"].includes(mode) ||
      (trialStartsAt !== null && !Number.isFinite(trialStartsAt.getTime())) ||
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
    trialStartsAt,
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
