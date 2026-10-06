import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { migrateCreditSchema, CREDIT_TABLES } from "../lib/credits/schema";
import { creditConfig, CreditError } from "../lib/credits/policy";
import { createCreditWallet } from "../lib/credits/wallet";
import { auditCredits } from "../lib/credits/audit";
import { isCreditAccount } from "../lib/credits/legacy-guard";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;
const config = creditConfig({
  AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "sandbox", AI_CREDITS_MONTHLY_ENABLED: "true",
  AI_CREDITS_CHECK_IN_ENABLED: "true", AI_CREDITS_MONTHLY_EXPIRY: "month_end", AI_CREDITS_CHECK_IN_EXPIRY_DAYS: "90",
});
const isError = (code: string) => (error: unknown) => error instanceof CreditError && error.code === code;

test("credit transactions against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  // Never substitute DATABASE_URL. This suite creates its own auth stub and roles.
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const sql = postgres(databaseUrl!, { max: 25, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await sql`CREATE TABLE IF NOT EXISTS user_lifetime_entitlements
      (id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES auth.users(id), revoked_at TIMESTAMPTZ)`;
    await sql`ALTER TABLE user_lifetime_entitlements ADD COLUMN IF NOT EXISTS source TEXT`;
    await sql`ALTER TABLE user_lifetime_entitlements ADD COLUMN IF NOT EXISTS reason TEXT`;
    await sql`CREATE TABLE IF NOT EXISTS user_entitlements (user_id UUID PRIMARY KEY, tier TEXT, expires_at TIMESTAMPTZ, storekit_revoked_at TIMESTAMPTZ)`;
    await sql`CREATE TABLE IF NOT EXISTS user_entitlement_grants (user_id UUID, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)`;
    await sql`ALTER TABLE user_entitlement_grants ADD COLUMN IF NOT EXISTS reason TEXT`;
    await sql`ALTER TABLE user_entitlement_grants ADD COLUMN IF NOT EXISTS granted_by TEXT`;
    await migrateCreditSchema(sql);
    // The same migration must be safe to run a second time.
    await migrateCreditSchema(sql);

    async function fixture(lifetime = true) {
      const userId = randomUUID();
      const account = { userId, environment: "sandbox" as const };
      await sql`INSERT INTO auth.users (id) VALUES (${userId})`;
      await sql`INSERT INTO credit_accounts (user_id, environment) VALUES (${userId}, 'sandbox')`;
      await sql`INSERT INTO credit_user_policies (user_id, environment, billing_mode) VALUES (${userId}, 'sandbox', 'credits')`;
      if (lifetime) await sql`INSERT INTO user_lifetime_entitlements (user_id, source, reason) VALUES (${userId}, 'grant', 'isolated test')`;
      let now = new Date("2026-10-01T12:00:00Z");
      const wallet = createCreditWallet(sql, () => now);
      return { account, wallet, setTime: (value: string) => { now = new Date(value); } };
    }

    await t.test("automatic monthly refresh happens on read and competing devices issue only one allowance", async () => {
      const f = await fixture();
      let now = new Date("2026-10-03T12:00:00Z");
      const wallet = createCreditWallet(sql, () => now, () => config);
      const balances = await Promise.all(Array.from({ length: 20 }, () => wallet.readWallet(f.account)));
      assert.ok(balances.every(b => b.available === 1000 && b.monthlyAvailable === 1000));
      assert.equal((await wallet.readLedger(f.account)).entries.length, 1);
      await wallet.reserve(f.account, "spend-monthly", 200);
      await wallet.settle(f.account, "spend-monthly", "commit");
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 800);
      assert.equal((await wallet.claimBenefit(f.account, "monthly", config)).claimed, false);
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 800);
      now = new Date("2026-11-01T00:00:00Z");
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 1000);
      now = new Date("2027-04-01T00:00:00Z");
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 1000);
      const claims = await sql`SELECT period FROM credit_benefit_claims WHERE user_id = ${f.account.userId} AND kind = 'monthly' ORDER BY period`;
      assert.deepEqual(claims.map(c => c.period), ["2026-10", "2026-11", "2027-04"]);
      assert.deepEqual((await auditCredits(sql, "sandbox", f.account.userId)).mismatches, []);
    });

    await t.test("monthly reset never erases purchased or permanent check-in credits and old holds cannot revive allowance", async () => {
      const f = await fixture();
      let now = new Date("2026-10-31T23:59:59Z");
      const wallet = createCreditWallet(sql, () => now, () => config);
      await wallet.grant(f.account, { key: "paid", amount: 4000, source: "purchase", expiresAt: null });
      await wallet.claimBenefit(f.account, "check_in", config);
      await wallet.reserve(f.account, "old-month-hold", 200);
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 800);
      now = new Date("2026-11-01T00:00:00Z");
      let balance = await wallet.readWallet(f.account);
      assert.equal(balance.available, 5010);
      assert.equal(balance.monthlyAvailable, 1000);
      assert.equal(balance.checkInAvailable, 10);
      assert.equal(balance.reserved, 200);
      await wallet.settle(f.account, "old-month-hold", "release");
      balance = await wallet.readWallet(f.account);
      assert.equal(balance.available, 5010);
      assert.equal(balance.reserved, 0);
      now = new Date("2027-11-01T00:00:00Z");
      assert.equal((await wallet.readWallet(f.account)).checkInAvailable, 10);
      assert.deepEqual((await auditCredits(sql, "sandbox", f.account.userId)).mismatches, []);
    });

    await t.test("monthly worker scan skips ineligible and already refreshed accounts and pause issues no allowance", async () => {
      const f = await fixture(), ineligible = await fixture(false);
      const liveWallet = createCreditWallet(sql, () => new Date("2026-10-03T12:00:00Z"), () => config);
      assert.ok((await liveWallet.monthlyAccounts(config, 500)).some(a => a.user_id === f.account.userId));
      assert.ok(!(await liveWallet.monthlyAccounts(config, 500)).some(a => a.user_id === ineligible.account.userId));
      await liveWallet.readWallet(f.account);
      assert.ok(!(await liveWallet.monthlyAccounts(config, 500)).some(a => a.user_id === f.account.userId));
      const paused = createCreditWallet(sql, () => new Date("2026-11-01T00:00:00Z"), () => ({ ...config, mode: "off" }));
      assert.equal((await paused.readWallet(f.account)).monthlyAvailable, 0);
      const resume = createCreditWallet(sql, () => new Date("2026-11-01T00:00:00Z"), () => config);
      assert.equal((await resume.readWallet(f.account)).monthlyAvailable, 1000);
      assert.equal((await liveWallet.readWallet(ineligible.account)).available, 0);
    });

    await t.test("monthly refresh ledger failure rolls back the entire automatic reset", async () => {
      const f = await fixture();
      let now = new Date("2026-10-03T12:00:00Z");
      const wallet = createCreditWallet(sql, () => now, () => config);
      await wallet.readWallet(f.account);
      now = new Date("2026-11-01T00:00:00Z");
      await sql.unsafe(`CREATE OR REPLACE FUNCTION reject_auto_grant() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.user_id = '${f.account.userId}'::uuid AND NEW.kind = 'grant' THEN RAISE EXCEPTION 'injected fault'; END IF; RETURN NEW; END $$`);
      await sql.unsafe("CREATE TRIGGER reject_auto_grant BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_auto_grant()");
      try {
        await assert.rejects(wallet.readWallet(f.account));
        const [lot] = await sql`SELECT remaining FROM credit_lots WHERE user_id = ${f.account.userId}`;
        assert.equal(lot.remaining, 1000);
        const [count] = await sql`SELECT count(*)::int AS n FROM credit_benefit_claims WHERE user_id = ${f.account.userId}`;
        assert.equal(count.n, 1);
      } finally { await sql.unsafe("DROP TRIGGER reject_auto_grant ON credit_ledger"); await sql.unsafe("DROP FUNCTION reject_auto_grant()"); }
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 1000);
    });

    await t.test("replacement enrolls legacy permanent members atomically without announcement or altering their paid credits", async () => {
      const f = await fixture();
      await f.wallet.grant(f.account, { key: "existing-paid", source: "purchase", amount: 4000, expiresAt: null });
      await sql`UPDATE credit_user_policies SET billing_mode = 'legacy' WHERE user_id = ${f.account.userId}`;
      const replaceConfig = { ...config, replaceLegacyEnabled: true };
      const wallet = createCreditWallet(sql, () => new Date("2026-10-03T12:00:00Z"), () => replaceConfig);
      const result = await Promise.all(Array.from({ length: 20 }, () => wallet.readWallet(f.account)));
      assert.ok(result.every(w => w.available === 5000 && w.paidAvailable === 4000 && w.monthlyAvailable === 1000));
      const [events] = await sql`SELECT count(*)::int AS n FROM credit_policy_events WHERE user_id = ${f.account.userId}`;
      assert.equal(events.n, 1);
      const [policy] = await sql`SELECT billing_mode FROM credit_user_policies WHERE user_id = ${f.account.userId}`;
      assert.equal(policy.billing_mode, "credits");
      assert.deepEqual((await auditCredits(sql, "sandbox", f.account.userId)).mismatches, []);
    });

    await t.test("failed first allowance rolls back legacy enrollment and its audit event", async () => {
      const f = await fixture();
      await sql`UPDATE credit_user_policies SET billing_mode = 'legacy' WHERE user_id = ${f.account.userId}`;
      const wallet = createCreditWallet(sql, () => new Date("2026-10-03T12:00:00Z"), () => ({ ...config, replaceLegacyEnabled: true }));
      await sql.unsafe(`CREATE FUNCTION reject_cutover_grant() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.user_id = '${f.account.userId}'::uuid AND NEW.kind = 'grant' THEN RAISE EXCEPTION 'injected fault'; END IF; RETURN NEW; END $$`);
      await sql.unsafe("CREATE TRIGGER reject_cutover_grant BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION reject_cutover_grant()");
      try {
        await assert.rejects(wallet.readWallet(f.account));
        const [policy] = await sql`SELECT billing_mode FROM credit_user_policies WHERE user_id = ${f.account.userId}`;
        assert.equal(policy.billing_mode, "legacy");
        const [rows] = await sql`SELECT
          (SELECT count(*)::int FROM credit_policy_events WHERE user_id = ${f.account.userId}) AS events,
          (SELECT count(*)::int FROM credit_benefit_claims WHERE user_id = ${f.account.userId}) AS claims,
          (SELECT count(*)::int FROM credit_lots WHERE user_id = ${f.account.userId}) AS lots`;
        assert.deepEqual(rows, { events: 0, claims: 0, lots: 0 });
      } finally {
        await sql.unsafe("DROP TRIGGER reject_cutover_grant ON credit_ledger");
        await sql.unsafe("DROP FUNCTION reject_cutover_grant()");
      }
      assert.equal((await wallet.readWallet(f.account)).monthlyAvailable, 1000);
    });

    await t.test("live replacement includes subscription and grant Pro immediately; pause and lifetime eligibility still apply", async () => {
      const f = await fixture(), pro = await fixture(), grantPro = await fixture(), proOnly = await fixture(false), revoked = await fixture();
      const fixtures = [f, pro, grantPro, proOnly, revoked];
      for (const member of fixtures) await sql`UPDATE credit_user_policies SET billing_mode = 'legacy' WHERE user_id = ${member.account.userId}`;
      await sql`INSERT INTO user_entitlements(user_id, tier, expires_at) VALUES (${pro.account.userId}, 'pro', '2099-01-01')`;
      await sql`INSERT INTO user_entitlements(user_id, tier, expires_at) VALUES (${proOnly.account.userId}, 'pro', NULL)`;
      await sql`INSERT INTO user_entitlement_grants(user_id, expires_at, reason, granted_by)
        VALUES (${grantPro.account.userId}, '2099-02-01', 'isolated conversion fixture', 'test')`;
      await sql`UPDATE user_lifetime_entitlements SET revoked_at = now() WHERE user_id = ${revoked.account.userId}`;
      const now = () => new Date("2026-10-03T12:00:00Z");
      const liveConfig = { ...config, replaceLegacyEnabled: true };
      const paused = createCreditWallet(sql, now, () => ({ ...liveConfig, mode: "off" }));
      await assert.rejects(paused.readWallet(f.account), isError("credits_not_enrolled"));
      await assert.rejects(paused.readWallet(pro.account), isError("credits_not_enrolled"));
      const live = createCreditWallet(sql, now, () => liveConfig);
      const accounts = await live.monthlyAccounts(liveConfig, 500);
      for (const member of [f, pro, grantPro]) {
        assert.ok(accounts.some(a => a.user_id === member.account.userId));
        assert.equal(await isCreditAccount(sql, member.account.userId, liveConfig), true,
          "legacy AI writes must be guarded even before the first wallet refresh");
      }
      for (const member of [proOnly, revoked]) {
        assert.ok(!accounts.some(a => a.user_id === member.account.userId));
        assert.equal(await isCreditAccount(sql, member.account.userId, liveConfig), false);
        await assert.rejects(live.readWallet(member.account), isError("credits_not_enrolled"));
      }
      for (const member of [pro, grantPro]) {
        const balances = await Promise.all(Array.from({ length: 20 }, () => live.readWallet(member.account)));
        assert.ok(balances.every(b => b.available === 1000 && b.monthlyAvailable === 1000));
        const [counts] = await sql`SELECT
          (SELECT count(*)::int FROM credit_policy_events WHERE user_id = ${member.account.userId}) AS events,
          (SELECT count(*)::int FROM credit_benefit_claims WHERE user_id = ${member.account.userId}) AS claims`;
        assert.deepEqual(counts, { events: 1, claims: 1 });
        assert.equal(await isCreditAccount(sql, member.account.userId, { ...liveConfig, mode: "off" }), true);
        await live.reserve(member.account, "converted-pro-spend", 100);
        await live.settle(member.account, "converted-pro-spend", "commit");
        assert.equal((await live.readWallet(member.account)).monthlyAvailable, 900);
      }
      const [subscription] = await sql`SELECT tier, expires_at FROM user_entitlements WHERE user_id = ${pro.account.userId}`;
      assert.equal(subscription.tier, "pro");
      assert.equal(subscription.expires_at.toISOString(), "2099-01-01T00:00:00.000Z");
      const [grant] = await sql`SELECT expires_at, revoked_at FROM user_entitlement_grants WHERE user_id = ${grantPro.account.userId}`;
      assert.equal(grant.expires_at.toISOString(), "2099-02-01T00:00:00.000Z");
      assert.equal(grant.revoked_at, null);
      const remaining = await live.monthlyAccounts(liveConfig, 500);
      assert.ok(!remaining.some(a => a.user_id === pro.account.userId || a.user_id === grantPro.account.userId));
    });

    await t.test("20 simultaneous monthly claims grant exactly 1000 points", async () => {
      const { wallet, account } = await fixture();
      const claims = await Promise.all(Array.from({ length: 20 }, () => wallet.claimBenefit(account, "monthly", config)));
      assert.equal(claims.filter(claim => claim.claimed).length, 1);
      assert.equal((await wallet.readWallet(account)).available, 1000);
      assert.equal((await wallet.readLedger(account)).entries.length, 1);
    });

    await t.test("monthly claim uses UTC, policy changes cannot duplicate it, next month has a new grant", async () => {
      const { wallet, account, setTime } = await fixture();
      setTime("2026-10-31T23:59:59Z");
      await wallet.claimBenefit(account, "monthly", config);
      const retry = await wallet.claimBenefit(account, "monthly", { ...config, monthlyExpiry: "none" });
      assert.equal(retry.claimed, false);
      assert.equal(retry.wallet.available, 1000);
      setTime("2026-11-01T00:00:00Z");
      const next = await wallet.claimBenefit(account, "monthly", config);
      assert.equal(next.claimed, true);
      assert.equal(next.period, "2026-11");
      assert.equal(next.wallet.available, 1000);
    });

    await t.test("100 points cannot fund two concurrent 100-point operations", async () => {
      const { wallet, account } = await fixture();
      await wallet.grant(account, { key: "test", amount: 100, source: "purchase", expiresAt: null });
      const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => wallet.reserve(account, `operation-${i}`, 100)));
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      for (const result of results) if (result.status === "rejected") assert.ok(isError("insufficient_credits")(result.reason));
      assert.equal((await wallet.readWallet(account)).reserved, 100);
      const [count] = await sql`SELECT count(*)::int AS total FROM credit_reservations WHERE user_id = ${account.userId}`;
      assert.equal(count.total, 1);
    });

    await t.test("reserve, commit and release are idempotent and opposing settlements conflict", async () => {
      const { wallet, account } = await fixture();
      await wallet.grant(account, { key: "test", amount: 200, source: "purchase", expiresAt: null });
      await Promise.all(Array.from({ length: 10 }, () => wallet.reserve(account, "commit", 100)));
      await assert.rejects(wallet.reserve(account, "commit", 101), isError("idempotency_conflict"));
      await Promise.all(Array.from({ length: 10 }, () => wallet.settle(account, "commit", "commit")));
      await assert.rejects(wallet.settle(account, "commit", "release"), isError("reservation_already_settled"));
      await wallet.reserve(account, "release", 100);
      await Promise.all(Array.from({ length: 10 }, () => wallet.settle(account, "release", "release")));
      assert.deepEqual(await wallet.reserve(account, "release", 100), { operationKey: "release", amount: 100, state: "released" });
      const balance = await wallet.readWallet(account);
      assert.equal(balance.available, 100);
      assert.equal(balance.reserved, 0);
      assert.equal(balance.walletVersion, "5");
    });

    await t.test("daily claims serialize across devices, cap at 300 and reset next month", async () => {
      const { wallet, account, setTime } = await fixture();
      const dayOne = await Promise.all(Array.from({ length: 20 }, () => wallet.claimBenefit(account, "check_in", config)));
      assert.equal(dayOne.filter(claim => claim.claimed).length, 1);
      for (let day = 2; day <= 31; day++) {
        setTime(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`);
        const claim = await wallet.claimBenefit(account, "check_in", config);
        assert.equal(claim.amount, day <= 30 ? 10 : 0);
      }
      assert.equal((await wallet.readWallet(account)).available, 300);
      await wallet.reserve(account, "spend-all", 300);
      await wallet.settle(account, "spend-all", "commit");
      assert.equal((await wallet.claimBenefit(account, "check_in", config)).amount, 0);
      setTime("2026-11-01T00:00:00Z");
      assert.equal((await wallet.claimBenefit(account, "check_in", config)).amount, 10);
      assert.equal((await wallet.readWallet(account)).available, 10);
    });

    await t.test("February grants 280 for 28 check-ins; spending does not reset the cap", async () => {
      const { wallet, account, setTime } = await fixture();
      for (let day = 1; day <= 28; day++) {
        setTime(`2027-02-${String(day).padStart(2, "0")}T12:00:00Z`);
        await wallet.claimBenefit(account, "check_in", config);
      }
      await wallet.reserve(account, "spend", 100);
      await wallet.settle(account, "spend", "commit");
      assert.equal((await wallet.claimBenefit(account, "check_in", config)).claimed, false);
      assert.equal((await wallet.readWallet(account)).available, 180);
    });

    await t.test("mixed lots spend earliest expiring gifts before paid points", async () => {
      const { wallet, account } = await fixture();
      await wallet.grant(account, { key: "paid", amount: 100, source: "purchase", expiresAt: null });
      await wallet.grant(account, { key: "late", amount: 30, source: "adjustment", expiresAt: new Date("2026-12-01Z") });
      await wallet.grant(account, { key: "early", amount: 40, source: "adjustment", expiresAt: new Date("2026-11-01Z") });
      await wallet.reserve(account, "mixed", 100);
      const lots = await sql`SELECT grant_key, reserved FROM credit_lots WHERE user_id = ${account.userId} ORDER BY grant_key`;
      assert.deepEqual(lots.map(lot => [lot.grant_key, lot.reserved]), [["early", 40], ["late", 30], ["paid", 30]]);
      await wallet.settle(account, "mixed", "commit");
      assert.equal((await wallet.readWallet(account)).paidAvailable, 70);
    });

    await t.test("expiry retains held points; a late release cannot revive expired points", async () => {
      const { wallet, account, setTime } = await fixture();
      await wallet.claimBenefit(account, "monthly", config);
      await wallet.reserve(account, "held", 100);
      setTime("2026-11-01T00:00:00Z");
      const expired = await wallet.readWallet(account);
      assert.equal(expired.available, 0);
      assert.equal(expired.reserved, 100);
      await wallet.settle(account, "held", "release");
      assert.equal((await wallet.readWallet(account)).available, 0);
      assert.equal((await wallet.readWallet(account)).reserved, 0);
      const entries = (await wallet.readLedger(account)).entries;
      assert.equal(entries.filter(entry => entry.kind === "expire").reduce((sum, entry) => sum + entry.amount, 0), -1000);
      const version = (await wallet.readWallet(account)).walletVersion;
      assert.equal((await wallet.readWallet(account)).walletVersion, version);
    });

    await t.test("an operation can commit its original hold after lot expiry", async () => {
      const { wallet, account, setTime } = await fixture();
      await wallet.claimBenefit(account, "monthly", config);
      await wallet.reserve(account, "held", 100);
      setTime("2026-11-01T00:00:00Z");
      const result = await wallet.settle(account, "held", "commit");
      assert.equal(result.wallet.available, 0);
      assert.equal(result.wallet.reserved, 0);
    });

    await t.test("grant retries cannot change amount/source/expiry and paid credits never expire", async () => {
      const { wallet, account, setTime } = await fixture();
      const grant = { key: "verified-tx", amount: 1000, source: "purchase" as const, expiresAt: null };
      const results = await Promise.all(Array.from({ length: 10 }, () => wallet.grant(account, grant)));
      assert.equal(results.filter(result => result.granted).length, 1);
      await assert.rejects(wallet.grant(account, { ...grant, amount: 2000 }), isError("idempotency_conflict"));
      assert.throws(() => wallet.grant(account, { ...grant, expiresAt: new Date("2027-01-01Z") }), isError("invalid_credit_request"));
      setTime("2036-01-01T00:00:00Z");
      assert.equal((await wallet.readWallet(account)).available, 1000);
    });

    await t.test("an expired grant retry is still the original grant", async () => {
      const { wallet, account, setTime } = await fixture();
      const grant = { key: "gift", amount: 100, source: "adjustment" as const, expiresAt: new Date("2026-11-01Z") };
      await wallet.grant(account, grant);
      setTime("2026-11-01T00:00:00Z");
      const retry = await wallet.grant(account, grant);
      assert.equal(retry.granted, false);
      assert.equal(retry.wallet.available, 0);
    });

    await t.test("ledger failure rolls back grant, claim, reservation and version together", async () => {
      const { wallet, account } = await fixture();
      await wallet.grant(account, { key: "initial", amount: 100, source: "purchase", expiresAt: null });
      await sql.unsafe(`CREATE OR REPLACE FUNCTION credit_test_fail_ledger() RETURNS trigger AS $$
        BEGIN IF NEW.reference IN ('force_failure', 'benefit:monthly:2026-10') THEN
          RAISE EXCEPTION 'injected ledger failure'; END IF; RETURN NEW; END;
        $$ LANGUAGE plpgsql`);
      await sql.unsafe(`CREATE TRIGGER credit_test_fail BEFORE INSERT ON credit_ledger
        FOR EACH ROW EXECUTE FUNCTION credit_test_fail_ledger()`);
      try {
        await assert.rejects(wallet.grant(account, { key: "force_failure", amount: 1000, source: "purchase", expiresAt: null }));
        await assert.rejects(wallet.claimBenefit(account, "monthly", config));
        await assert.rejects(wallet.reserve(account, "force_failure", 100));
        assert.equal((await wallet.readWallet(account)).available, 100);
        assert.equal((await wallet.readWallet(account)).reserved, 0);
        assert.equal((await wallet.readWallet(account)).walletVersion, "1");
        const [claims] = await sql`SELECT count(*)::int AS total FROM credit_benefit_claims WHERE user_id = ${account.userId}`;
        assert.equal(claims.total, 0);
      } finally {
        await sql.unsafe("DROP TRIGGER credit_test_fail ON credit_ledger");
        await sql.unsafe("DROP FUNCTION credit_test_fail_ledger()");
      }
    });

    await t.test("eligibility requires server enrollment and live lifetime holding", async () => {
      const { wallet, account } = await fixture(false);
      await assert.rejects(wallet.claimBenefit(account, "monthly", config), isError("benefit_ineligible"));
      await assert.rejects(wallet.claimBenefit(account, "check_in", config), isError("benefit_ineligible"));
      assert.throws(() => wallet.claimBenefit(account, "check_in", { ...config, checkInEnabled: false }), isError("benefit_disabled"));
      assert.throws(() => wallet.claimBenefit(account, "monthly", { ...config, monthlyEnabled: false }), isError("benefit_disabled"));
      await sql`UPDATE credit_user_policies SET billing_mode = 'legacy' WHERE user_id = ${account.userId}`;
      await assert.rejects(wallet.claimBenefit(account, "check_in", config), isError("credits_not_enrolled"));
      const [lots] = await sql`SELECT count(*)::int AS total FROM credit_lots WHERE user_id = ${account.userId}`;
      assert.equal(lots.total, 0);
    });

    await t.test("sandbox balances never leak to production or another user", async () => {
      const { wallet, account } = await fixture();
      const other = await fixture();
      await wallet.claimBenefit(account, "monthly", config);
      await sql`INSERT INTO credit_accounts (user_id, environment) VALUES (${account.userId}, 'production')`;
      await sql`INSERT INTO credit_user_policies (user_id, environment, billing_mode) VALUES (${account.userId}, 'production', 'credits')`;
      assert.equal((await wallet.readWallet({ ...account, environment: "production" })).available, 0);
      assert.equal((await other.wallet.readWallet(other.account)).available, 0);
      assert.equal((await other.wallet.readLedger(other.account)).entries.length, 0);
    });

    await t.test("ledger pagination has no overlaps, cursor validation rejects invalid BIGINT", async () => {
      const { wallet, account } = await fixture();
      for (let i = 0; i < 55; i++) await wallet.grant(account, { key: `grant-${i}`, amount: 1, source: "adjustment", expiresAt: null });
      const first = await wallet.readLedger(account);
      const second = await wallet.readLedger(account, first.nextCursor!);
      assert.equal(first.entries.length, 50);
      assert.equal(second.entries.length, 5);
      assert.equal(second.nextCursor, null);
      assert.equal(new Set([...first.entries, ...second.entries].map(entry => entry.id)).size, 55);
      for (const cursor of ["-1", "x", "0", "9223372036854775808"]) assert.throws(() => wallet.readLedger(account, cursor));
    });

    await t.test("read-only audit detects ledger drift and allocation drift without repairing either", async () => {
      const { wallet, account } = await fixture();
      await wallet.claimBenefit(account, "monthly", config);
      await wallet.reserve(account, "audit-operation", 100);
      assert.deepEqual((await auditCredits(sql, "sandbox", account.userId)).mismatches, []);
      const [before] = await sql`SELECT wallet_version FROM credit_accounts WHERE user_id = ${account.userId}`;
      await sql`UPDATE credit_lots SET remaining = remaining - 1 WHERE user_id = ${account.userId}`;
      let audit = await auditCredits(sql, "sandbox", account.userId);
      assert.ok(audit.mismatches.some(row => row.check === "wallet_ledger"));
      await sql`UPDATE credit_lots SET remaining = remaining + 1 WHERE user_id = ${account.userId}`;
      await sql`UPDATE credit_operation_allocations SET amount = amount - 1 WHERE user_id = ${account.userId}`;
      audit = await auditCredits(sql, "sandbox", account.userId);
      assert.ok(audit.mismatches.some(row => row.check === "reservation_allocation"));
      assert.ok(audit.mismatches.some(row => row.check === "lot_reserved"));
      const [after] = await sql`SELECT wallet_version FROM credit_accounts WHERE user_id = ${account.userId}`;
      assert.equal(after.wallet_version, before.wallet_version);
      await sql`UPDATE credit_operation_allocations SET amount = amount + 1 WHERE user_id = ${account.userId}`;
      assert.deepEqual((await auditCredits(sql, "sandbox", account.userId)).mismatches, []);
      assert.equal((await auditCredits(sql, "production", account.userId)).accounts, "0");
    });

    await t.test("all tables enforce RLS for a client role; lot constraints reject corruption", async () => {
      const { wallet, account } = await fixture();
      await wallet.claimBenefit(account, "monthly", config);
      const tables = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${[...CREDIT_TABLES]})`;
      assert.equal(tables.length, CREDIT_TABLES.length);
      assert.ok(tables.every(table => table.relrowsecurity));
      await sql.unsafe("DO $$ BEGIN CREATE ROLE credit_test_client; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
      await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${CREDIT_TABLES.join(",")} TO credit_test_client`);
      await sql.begin(async tx => {
        await tx.unsafe("SET LOCAL ROLE credit_test_client");
        const rows = await tx`SELECT * FROM credit_lots`;
        assert.equal(rows.length, 0);
      });
      await assert.rejects(sql.begin(async tx => {
        await tx.unsafe("SET LOCAL ROLE credit_test_client");
        await tx`INSERT INTO credit_accounts (user_id, environment) VALUES (${randomUUID()}, 'sandbox')`;
      }), (error: unknown) => error instanceof postgres.PostgresError && error.code === "42501");
      await assert.rejects(sql`UPDATE credit_lots SET reserved = issued + 1 WHERE user_id = ${account.userId}`);
      assert.equal((await wallet.readWallet(account)).available, 1000);
    });
  } finally {
    await sql.end();
  }
});
