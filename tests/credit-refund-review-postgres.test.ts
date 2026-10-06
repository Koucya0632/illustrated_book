import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomInt } from "node:crypto";
import postgres from "postgres";
import { migrateCreditSchema } from "../lib/credits/schema";
import { createCreditWallet } from "../lib/credits/wallet";
import { createCreditStore } from "../lib/credits/store";
import { createRefundReview, RefundReviewError } from "../lib/credits/refund-review";
import { auditCredits } from "../lib/credits/audit";
import { userCreditConfig } from "../lib/credits/policy";

const url = process.env.CREDIT_TEST_DATABASE_URL;
test("manual refund resolution against isolated PostgreSQL", { skip: !url }, async t => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.equal(parsed.pathname, "/tuji_credits_test");
  const sql = postgres(url!, { max: 25, onnotice: () => {} });
  const now = new Date("2026-10-05T00:00:00Z"), clock = () => now;
  const wallet = createCreditWallet(sql, clock), store = createCreditStore(sql, clock), review = createRefundReview(sql, clock);
  const error = (code: string) => (e: unknown) => e instanceof RefundReviewError && e.code === code;
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await sql`CREATE TABLE IF NOT EXISTS user_lifetime_entitlements (id BIGSERIAL PRIMARY KEY, user_id UUID, source TEXT NOT NULL, reason TEXT, revoked_at TIMESTAMPTZ)`;
    await migrateCreditSchema(sql);
    async function fixture() {
      const account = { userId: randomUUID(), environment: "sandbox" as const };
      await sql`INSERT INTO auth.users(id) VALUES (${account.userId})`;
      await sql`INSERT INTO credit_accounts(user_id,environment) VALUES (${account.userId},'sandbox')`;
      await sql`INSERT INTO credit_user_policies(user_id,environment,billing_mode) VALUES (${account.userId},'sandbox','credits')`;
      const purchase = { userId: account.userId, environment: account.environment, transactionId: String(randomInt(100000000,999999999)),
        productId: "app.tuji.credits.1000" as const, quantity: 1, kind: "purchase" as const, refundFraction: 0, signedAt: now.getTime() };
      await store.apply(purchase);
      await wallet.reserve(account, "used", 600); await wallet.settle(account, "used", "commit");
      await wallet.grant(account, { key: "gift", source: "check_in", amount: 10, expiresAt: null });
      const refund = { ...purchase, kind: "refund" as const, refundFraction: 50000, signedAt: now.getTime()+1 };
      await store.apply(refund);
      const input = { requestKey: randomUUID(), transactionId: purchase.transactionId, expectedEventAt: new Date(refund.signedAt).toISOString(),
        expectedRefundPoints: 500, expectedConsumedPoints: 100, reason: "客服已核對並完成人工處理" };
      return { account, purchase, refund, input };
    }
    await t.test("20 admin retries resolve once without changing gifts, ledger or Apple refund; duplicate notifications preserve resolution", async () => {
      const f = await fixture();
      const before = await wallet.readWallet(f.account);
      assert.equal(before.reconciliationRequired, true);
      const results = await Promise.all(Array.from({ length: 20 }, () => review.resolve(f.account, f.input, "admin")));
      assert.equal(results.filter(r => !r.duplicate).length, 1);
      const after = await wallet.readWallet(f.account);
      assert.deepEqual(after, { ...before, reconciliationRequired: false });
      await store.apply(f.refund);
      assert.equal((await wallet.readWallet(f.account)).reconciliationRequired, false);
      const [row] = await sql`SELECT refund_points, withdrawn_points, consumed_points FROM credit_store_transactions WHERE transaction_id = ${f.purchase.transactionId}`;
      assert.deepEqual(row, { refund_points: 500, withdrawn_points: 400, consumed_points: 100 });
      assert.equal((await review.readCases(f.account))[0].resolution?.reason, f.input.reason);
      await assert.rejects(review.resolve(f.account, { ...f.input, reason: "different" }, "admin"), error("idempotency_conflict"));
      await assert.rejects(review.resolve(f.account, { ...f.input, requestKey: randomUUID() }, "admin"), error("refund_already_resolved"));
      assert.deepEqual((await auditCredits(sql,"sandbox",f.account.userId)).mismatches, []);
    });
    await t.test("another user or environment cannot resolve a refund, and later larger refunds require a new review", async () => {
      const f = await fixture(), other = await fixture();
      await assert.rejects(review.resolve(other.account,f.input,"admin"),error("refund_not_found"));
      await assert.rejects(review.resolve({...f.account,environment:"production"},f.input,"admin"),error("refund_not_found"));
      await review.resolve(f.account,f.input,"admin");
      await store.apply({...f.refund,refundFraction:100000,signedAt:f.refund.signedAt+1});
      assert.equal((await wallet.readWallet(f.account)).reconciliationRequired,true);
      await assert.rejects(review.resolve(f.account,{...f.input,requestKey:randomUUID()},"admin"),error("refund_changed"));
      const row=(await review.readCases(f.account))[0];
      assert.equal(row.consumedPoints,600); assert.equal(row.resolution,null);
      await review.resolve(f.account,{...f.input,requestKey:randomUUID(),expectedEventAt:row.eventAt,expectedRefundPoints:1000,expectedConsumedPoints:600},"admin");
      assert.equal((await wallet.readWallet(f.account)).reconciliationRequired,false);
      await store.apply({...f.purchase,kind:"reverse",signedAt:f.refund.signedAt+2});
      const restored=await wallet.readWallet(f.account);
      assert.equal(restored.paidAvailable,400); assert.equal(restored.checkInAvailable,10);
      assert.equal(restored.reconciliationRequired,false);
    });
    await t.test("in-flight refunded allocations cannot be manually cleared and released points are withdrawn before review", async () => {
      const f=await fixture();
      await store.apply({...f.purchase,kind:"reverse",signedAt:f.refund.signedAt+1});
      await wallet.reserve(f.account,"pending",110); // 10 gift + 100 purchase held.
      const event={...f.refund,refundFraction:100000,signedAt:f.refund.signedAt+2}; await store.apply(event);
      const row=(await review.readCases(f.account))[0];
      const input={...f.input,expectedEventAt:row.eventAt,expectedRefundPoints:1000,expectedConsumedPoints:row.consumedPoints};
      await assert.rejects(review.resolve(f.account,input,"admin"),error("refund_has_reservations"));
      await wallet.settle(f.account,"pending","release");
      await review.resolve(f.account,input,"admin");
      const after=await wallet.readWallet(f.account);
      assert.equal(after.paidAvailable,0); assert.equal(after.checkInAvailable,10); assert.equal(after.reconciliationRequired,false);
    });
    await t.test("a new Apple refund racing with admin resolution always remains restricted", async () => {
      const f=await fixture();
      const result=await Promise.allSettled([review.resolve(f.account,f.input,"admin"),
        store.apply({...f.refund,refundFraction:100000,signedAt:f.refund.signedAt+1})]);
      assert.equal(result[1].status,"fulfilled");
      assert.equal((await wallet.readWallet(f.account)).reconciliationRequired,true);
    });
    await t.test("review account automatically enrolls only its sandbox wallet with public rollout off", async () => {
      const reviewer = randomUUID(), publicUser = randomUUID();
      await sql`INSERT INTO auth.users(id) VALUES (${reviewer}), (${publicUser})`;
      await sql`INSERT INTO user_lifetime_entitlements(user_id,source,reason)
        VALUES (${reviewer},'grant','isolated review test'), (${publicUser},'grant','isolated public test')`;
      const env = { AI_CREDITS_MODE: "off", AI_CREDITS_ENVIRONMENT: "production",
        AI_CREDITS_REVIEW_ENABLED: "true", AI_CREDITS_REVIEW_USER_IDS: reviewer };
      const isolated = createCreditWallet(sql, clock, userId => userCreditConfig(userId, env));
      const a = { userId: reviewer, environment: "sandbox" as const };
      assert.equal((await isolated.readWallet(a)).available, 1000);
      await isolated.reserve(a, "review-ai", 100); await isolated.settle(a, "review-ai", "commit");
      assert.equal((await isolated.readWallet(a)).available, 900);
      await assert.rejects(isolated.readWallet({ userId: reviewer, environment: "production" }));
      await assert.rejects(isolated.readWallet({ userId: publicUser, environment: "production" }));
      const policies = await sql`SELECT user_id, environment FROM credit_user_policies WHERE user_id IN (${reviewer}, ${publicUser})`;
      assert.deepEqual([...policies], [{ user_id: reviewer, environment: "sandbox" }]);
      const publicConfig = { ...userCreditConfig(publicUser, env), mode: "live" as const, monthlyEnabled: true, replaceLegacyEnabled: true };
      const candidates = await isolated.monthlyAccounts(publicConfig, 100, [reviewer]);
      assert.equal(candidates.some(row => row.user_id === reviewer), false);
      assert.equal(candidates.some(row => row.user_id === publicUser), true);
      assert.deepEqual((await auditCredits(sql, "sandbox", reviewer)).mismatches, []);
    });
  } finally { await sql.end(); }
});
