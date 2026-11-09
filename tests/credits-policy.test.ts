import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPoints, assertCreditKey, CREDIT_POLICY, creditConfig, userCreditConfig, creditRecoveryEnvironments, utcPeriod,
  effectiveCreditPolicy, freeCreditAtlasSlots, monthlyGiftFor, TRIAL_POLICY, trialActive,
} from "../lib/credits/policy";
import { limitsForBilling } from "../lib/atlas/membership-limits";

test("credit features default off with approved monthly reset and permanent check-in policy", () => {
  assert.deepEqual(creditConfig({}), {
    mode: "off", readEnabled: false, environment: "production", monthlyEnabled: false, checkInEnabled: false, replaceLegacyEnabled: false,
    monthlyExpiry: "month_end", checkInExpiryDays: "none", trialStartsAt: null,
  });
  assert.equal(CREDIT_POLICY.monthlyGift, 1000);
  assert.equal(CREDIT_POLICY.checkInDaily, 10);
  assert.equal(CREDIT_POLICY.checkInMonthlyCap, 300);
});

test("retired expiry settings cannot override approved policy and malformed environment fails closed", () => {
  assert.equal(creditConfig({ AI_CREDITS_MONTHLY_EXPIRY: "month_end" }).monthlyExpiry, "month_end");
  assert.equal(creditConfig({ AI_CREDITS_CHECK_IN_EXPIRY_DAYS: "90" }).checkInExpiryDays, "none");
  for (const value of ["", "0", "-1", "1.2", "NaN", "3651"]) {
    assert.equal(creditConfig({ AI_CREDITS_CHECK_IN_EXPIRY_DAYS: value }).checkInExpiryDays, "none");
  }
  assert.throws(() => creditConfig({ AI_CREDITS_MODE: "enabled" }));
  assert.throws(() => creditConfig({ AI_CREDITS_ENVIRONMENT: "Sandbox" }));
});

test("dates use UTC and handle December and leap February boundaries", () => {
  assert.deepEqual(utcPeriod(new Date("2026-12-31T23:59:59Z")), {
    day: "2026-12-31", month: "2026-12", nextMonth: new Date("2027-01-01T00:00:00Z"),
  });
  assert.equal(utcPeriod(new Date("2028-02-29T23:59:59Z")).nextMonth.toISOString(), "2028-03-01T00:00:00.000Z");
});

test("point and operation inputs reject fractions, negative values and unsafe values", () => {
  for (const value of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) assert.throws(() => assertPoints(value));
  for (const value of ["", " ", "x".repeat(201), " leading"]) assert.throws(() => assertCreditKey(value));
  assert.doesNotThrow(() => assertPoints(100));
});

test("enrolled active Pro uses permanent capacity and no legacy AI allowance", () => {
  assert.equal(limitsForBilling("lifetime", "v2", "credits").atlasSlotsLimit, 200);
  assert.equal(limitsForBilling("lifetime", "v2", "legacy").atlasSlotsLimit, 20);
  assert.deepEqual(limitsForBilling("pro", "v2", "credits"), {
    atlasSlotsLimit: 200, primaryAiSoftLimitMonthly: 0, precisionAiLimitMonthly: 0,
    savedItemsLimit: 1000, adsRequiredForCardGeneration: false,
  });
  assert.equal(limitsForBilling("pro", "v2", "legacy").atlasSlotsLimit, 300);
  assert.equal(limitsForBilling("free", "v2", "credits").atlasSlotsLimit, 0);
});

test("only deployment-selected review identities use sandbox while public production remains off", () => {
  const id = "4fca3953-f983-4a80-8d17-d421aa412027";
  const env = { AI_CREDITS_ENVIRONMENT: "production", AI_CREDITS_MODE: "off",
    AI_CREDITS_REVIEW_ENABLED: "true", AI_CREDITS_REVIEW_USER_IDS: id };
  assert.equal(userCreditConfig(id, env).mode, "live");
  assert.equal(userCreditConfig(id, env).environment, "sandbox");
  assert.equal(userCreditConfig("bbd78d65-27a8-49d9-b72d-462891a9c341", env).mode, "off");
  assert.equal(userCreditConfig(undefined, env).environment, "production");
  assert.deepEqual(creditRecoveryEnvironments(env), ["production", "sandbox"]);
  assert.equal(userCreditConfig(id, { ...env, AI_CREDITS_REVIEW_ENABLED: "false" }).mode, "off");
  assert.throws(() => userCreditConfig(id, { ...env, AI_CREDITS_REVIEW_USER_IDS: "not-a-user" }));
  assert.throws(() => creditRecoveryEnvironments({ ...env, AI_CREDITS_REVIEW_USER_IDS: "" }));
});

test("trial policy switches on at AI_CREDITS_TRIAL_STARTS_AT; the allowance drops from the following month", () => {
  const off = creditConfig({});
  const on = creditConfig({ AI_CREDITS_TRIAL_STARTS_AT: "2026-12-10T00:00:00Z" });
  assert.throws(() => creditConfig({ AI_CREDITS_TRIAL_STARTS_AT: "soon" }));
  assert.equal(trialActive(off, new Date("2030-01-01T00:00:00Z")), false);
  assert.equal(trialActive(on, new Date("2026-12-09T23:59:59Z")), false);
  assert.equal(trialActive(on, new Date("2026-12-10T00:00:00Z")), true);
  assert.deepEqual(monthlyGiftFor(off, "2027-01"), { amount: 1000, version: CREDIT_POLICY.version });
  assert.deepEqual(monthlyGiftFor(on, "2026-12"), { amount: 1000, version: CREDIT_POLICY.version });
  assert.deepEqual(monthlyGiftFor(on, "2027-01"), { amount: 500, version: TRIAL_POLICY.version });
  assert.equal(freeCreditAtlasSlots(on, new Date("2026-12-09T00:00:00Z")), 0);
  assert.equal(freeCreditAtlasSlots(on, new Date("2026-12-11T00:00:00Z")), 3);
  const before = effectiveCreditPolicy(on, new Date("2026-12-01T00:00:00Z"));
  assert.equal(before.monthlyGift, 1000);
  assert.equal(before.trialGrant, 0);
  const switchMonth = effectiveCreditPolicy(on, new Date("2026-12-20T00:00:00Z"));
  assert.deepEqual([switchMonth.monthlyGift, switchMonth.trialGrant, switchMonth.firstPurchaseGift], [500, 150, 1000]);
  assert.equal(effectiveCreditPolicy(on, new Date("2027-01-01T00:00:00Z")).monthlyGift, 500);
  assert.equal(limitsForBilling("free", "v2", "credits", 3).atlasSlotsLimit, 3);
  assert.equal(limitsForBilling("free", "v2", "legacy", 3).atlasSlotsLimit, 0);
  assert.equal(limitsForBilling("lifetime", "v2", "credits", 3).atlasSlotsLimit, 200);
});
