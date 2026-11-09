import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { migrateCreditSchema } from "../lib/credits/schema";
import { creditConfig, CreditError, type CreditConfig } from "../lib/credits/policy";
import { createCreditWallet } from "../lib/credits/wallet";
import { creditAtlasSlots } from "../lib/credits/atlas-slots";
import { auditCredits } from "../lib/credits/audit";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;
const isError = (code: string) => (error: unknown) => error instanceof CreditError && error.code === code;
const base = creditConfig({
  AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "sandbox", AI_CREDITS_MONTHLY_ENABLED: "true",
  AI_CREDITS_CHECK_IN_ENABLED: "true", AI_CREDITS_REPLACE_LEGACY_ENABLED: "true",
});
const trial: CreditConfig = { ...base, trialStartsAt: new Date("2026-12-10T00:00:00Z") };

test("試用點數, 首購禮 and the 500 allowance against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const sql = postgres(databaseUrl!, { max: 25, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await sql`CREATE TABLE IF NOT EXISTS study_logs (user_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS user_lifetime_entitlements
      (id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES auth.users(id), revoked_at TIMESTAMPTZ)`;
    for (const column of ["source TEXT", "reason TEXT", "product_id TEXT", "original_transaction_id TEXT UNIQUE",
      "acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()"]) {
      await sql.unsafe(`ALTER TABLE user_lifetime_entitlements ADD COLUMN IF NOT EXISTS ${column}`);
    }
    await migrateCreditSchema(sql);

    async function fixture(config: CreditConfig = trial) {
      const userId = randomUUID();
      await sql`INSERT INTO auth.users (id) VALUES (${userId})`;
      await sql`INSERT INTO study_logs (user_id, created_at) SELECT ${userId}, d
        FROM generate_series('2026-11-01T04:00:00Z'::timestamptz, '2027-03-31T04:00:00Z', interval '1 day') d`;
      let now = new Date("2026-12-15T12:00:00Z");
      const wallet = createCreditWallet(sql, () => now, () => config);
      return {
        account: { userId, environment: "sandbox" as const }, wallet,
        setTime: (value: string) => { now = new Date(value); },
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const buy = async (userId: string, acquiredAt: string, transactionId = String(randomInt(100000000, 999999999))) => {
      await sql`INSERT INTO user_lifetime_entitlements (user_id, source, product_id, original_transaction_id, acquired_at)
        VALUES (${userId}, 'appstore', 'app.tuji.lifetime', ${transactionId}, ${acquiredAt})`;
      return transactionId;
    };
    const revoke = (transactionId: string, at: string | null) =>
      sql`UPDATE user_lifetime_entitlements SET revoked_at = ${at} WHERE original_transaction_id = ${transactionId}`;
    const spend = async (f: Fixture, key: string, amount: number) => {
      await f.wallet.reserve(f.account, key, amount);
      await f.wallet.settle(f.account, key, "commit");
    };
    const clean = async (f: Fixture) =>
      assert.deepEqual((await auditCredits(sql, "sandbox", f.account.userId)).mismatches, []);

    await t.test("before the switch a free account stays outside the points system", async () => {
      const f = await fixture(base);
      await assert.rejects(f.wallet.readWallet(f.account), isError("credits_not_enrolled"));
      const g = await fixture();
      g.setTime("2026-12-09T23:59:59Z");
      await assert.rejects(g.wallet.readWallet(g.account), isError("credits_not_enrolled"));
      await assert.rejects(creditAtlasSlots(sql, g.account.userId, trial, new Date("2026-12-09T00:00:00Z")),
        isError("benefit_ineligible"));
    });

    await t.test("a free account gets 150 trial points once, with no check-in or allowance", async () => {
      const f = await fixture();
      const balances = await Promise.all(Array.from({ length: 12 }, () => f.wallet.readWallet(f.account)));
      assert.ok(balances.every(b => b.available === 150 && b.trialAvailable === 150 && b.monthlyAvailable === 0));
      assert.equal(balances[0].benefits.hasLifetime, false);
      await assert.rejects(f.wallet.claimBenefit(f.account, "check_in", trial), isError("benefit_ineligible"));
      await assert.rejects(f.wallet.claimBenefit(f.account, "monthly", trial), isError("benefit_ineligible"));
      await spend(f, "chat", 150);
      f.setTime("2027-03-01T00:00:00Z");
      assert.equal((await f.wallet.readWallet(f.account)).available, 0);
      const [lots] = await sql`SELECT count(*)::int AS n FROM credit_lots WHERE user_id = ${f.account.userId}`;
      assert.equal(lots.n, 1);
      assert.equal(await creditAtlasSlots(sql, f.account.userId, trial, new Date("2026-12-15T00:00:00Z")), 3);
      await clean(f);
    });

    await t.test("an existing member gets no trial or gift, keeps 1,000 in the switch month and 500 after", async () => {
      const f = await fixture();
      await sql`INSERT INTO user_lifetime_entitlements (user_id, source, reason, acquired_at)
        VALUES (${f.account.userId}, 'grant', 'isolated test', '2026-10-01T00:00:00Z')`;
      const december = await f.wallet.readWallet(f.account);
      assert.deepEqual([december.available, december.monthlyAvailable, december.trialAvailable], [1000, 1000, 0]);
      f.setTime("2027-01-02T00:00:00Z");
      const january = await f.wallet.readWallet(f.account);
      assert.deepEqual([january.available, january.monthlyAvailable], [500, 500]);
      const [claim] = await sql`SELECT amount, policy_version FROM credit_benefit_claims
        WHERE user_id = ${f.account.userId} AND period = '2027-01'`;
      assert.deepEqual({ ...claim }, { amount: 500, policy_version: "credits-2026-11-trial" });
      assert.equal(await creditAtlasSlots(sql, f.account.userId, trial, new Date()), 200);
      await clean(f);
    });

    await t.test("a purchase after the switch brings 1,000 in place of that month's allowance and keeps the trial rest", async () => {
      const f = await fixture();
      await f.wallet.readWallet(f.account);
      await spend(f, "recognize", 100);
      await buy(f.account.userId, "2026-12-15T13:00:00Z");
      f.setTime("2026-12-15T13:01:00Z");
      const bought = await f.wallet.readWallet(f.account);
      assert.deepEqual([bought.available, bought.trialAvailable, bought.monthlyAvailable], [1050, 50, 0]);
      assert.equal(bought.benefits.monthlyClaimed, true);
      f.setTime("2027-01-01T00:00:00Z");
      const january = await f.wallet.readWallet(f.account);
      assert.deepEqual([january.available, january.monthlyAvailable], [1550, 500]);
      await clean(f);
    });

    await t.test("a restore onto another account, or a second purchase, gives no second gift", async () => {
      const a = await fixture(), b = await fixture();
      const transactionId = await buy(a.account.userId, "2026-12-15T00:00:00Z");
      assert.equal((await a.wallet.readWallet(a.account)).available, 1000);
      await sql`UPDATE user_lifetime_entitlements SET user_id = ${b.account.userId} WHERE original_transaction_id = ${transactionId}`;
      const restored = await b.wallet.readWallet(b.account);
      assert.equal(restored.available, 1000, "this month's allowance only");
      assert.equal(restored.monthlyAvailable, 1000);
      assert.equal((await a.wallet.readWallet(a.account)).available, 1000);

      const c = await fixture();
      const first = await buy(c.account.userId, "2026-12-15T00:00:00Z");
      await c.wallet.readWallet(c.account);
      await revoke(first, "2026-12-16T00:00:00Z");
      await buy(c.account.userId, "2026-12-17T00:00:00Z");
      c.setTime("2026-12-17T01:00:00Z");
      assert.equal((await c.wallet.readWallet(c.account)).available, 0);
      for (const f of [a, b, c]) await clean(f);
    });

    await t.test("a refund withdraws the unspent gift, holds spent points for review, and a reversal restores it", async () => {
      const f = await fixture();
      const transactionId = await buy(f.account.userId, "2026-12-15T00:00:00Z");
      assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      await spend(f, "used", 300);
      await f.wallet.grant(f.account, { key: "gift", source: "adjustment", amount: 60, expiresAt: null });
      await revoke(transactionId, "2026-12-20T00:00:00Z");
      f.setTime("2026-12-20T01:00:00Z");
      const refunded = await f.wallet.readWallet(f.account);
      assert.equal(refunded.available, 60, "other gifts are never deducted");
      assert.equal(refunded.reconciliationRequired, true);
      await assert.rejects(f.wallet.reserve(f.account, "blocked", 10), isError("credits_reconciliation_required"));
      const [row] = await sql`SELECT refund_points, withdrawn_points, consumed_points FROM credit_store_transactions
        WHERE transaction_id = ${transactionId}`;
      assert.deepEqual({ ...row }, { refund_points: 1000, withdrawn_points: 700, consumed_points: 300 });

      const g = await fixture();
      const unspent = await buy(g.account.userId, "2026-12-15T00:00:00Z");
      await g.wallet.readWallet(g.account);
      await spend(g, "some", 300);
      await revoke(unspent, "2026-12-20T00:00:00Z");
      g.setTime("2026-12-20T01:00:00Z");
      assert.equal((await g.wallet.readWallet(g.account)).available, 0);
      await revoke(unspent, null);
      g.setTime("2026-12-21T00:00:00Z");
      const reinstated = await g.wallet.readWallet(g.account);
      assert.equal(reinstated.available, 700);
      assert.equal(reinstated.reconciliationRequired, false);
      for (const u of [f, g]) await clean(u);
    });
  } finally {
    await sql.end();
  }
});
