import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { creditConfig } from "../lib/credits/policy";
import { createCreditWallet } from "../lib/credits/wallet";
import { migrateCreditSchema } from "../lib/credits/schema";
import { migrateAssistantSchema } from "../lib/assistant/schema";
import { migrateGrammarSchema } from "../lib/assistant/grammar/schema";
import { createGrammarStore } from "../lib/assistant/grammar/store";
import { createGrammarHandler, type GrammarAction } from "../lib/assistant/grammar/http";
import type { GrammarInput } from "../lib/assistant/grammar/contracts";
import type { GrammarModel } from "../lib/assistant/grammar/model";
import { sampleInput, sampleReply, sampleUsage } from "./fixtures/grammar";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;
test("grammar atomic purchases and recovery against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const sql = postgres(databaseUrl!, { max: 15, onnotice: () => {} });
  const config = creditConfig({ AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "sandbox" });
  let clock = new Date();
  const wallet = createCreditWallet(sql, () => clock, () => config);
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await sql`CREATE TABLE IF NOT EXISTS study_logs (user_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS user_lifetime_entitlements (id BIGSERIAL PRIMARY KEY, user_id UUID, revoked_at TIMESTAMPTZ)`;
    await migrateCreditSchema(sql); await migrateAssistantSchema(sql); await migrateGrammarSchema(sql);
    await migrateGrammarSchema(sql);
    // Re-running is the every-deploy path: the guarded ALTERs must leave the schema as the first run did.
    await migrateCreditSchema(sql); await migrateAssistantSchema(sql);
    const deferred = await sql`SELECT conname FROM pg_constraint WHERE condeferred
      AND conname IN ('credit_operation_allocations_lot_id_user_id_environment_fkey', 'credit_store_transactions_lot_id_user_id_environment_fkey')`;
    assert.equal(deferred.length, 2);
    const [check] = await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'assistant_usage_feature_check'`;
    assert.match(check.def, /'grammar'/);
    async function fixture() {
      const userId = randomUUID();
      const account = { userId, environment: "sandbox" as const };
      await sql`INSERT INTO auth.users (id) VALUES (${userId})`;
      await sql`INSERT INTO credit_accounts (user_id, environment) VALUES (${userId}, 'sandbox')`;
      await sql`INSERT INTO credit_user_policies (user_id, environment, billing_mode) VALUES (${userId}, 'sandbox', 'credits')`;
      await wallet.grant(account, { key: "test-gift", source: "adjustment", amount: 1000, expiresAt: null });
      const store = createGrammarStore(sql, wallet, () => clock);
      let enabled = true, calls = 0;
      let generate: GrammarModel = async input => { calls++; return { reply: sampleReply(input.mode), usage: sampleUsage }; };
      const handler = createGrammarHandler({ userId: async () => userId, config: () => config,
        enabled: () => enabled, balance: a => wallet.readWallet(a), store: () => store,
        generate: input => generate(input), rateLimit: async () => {}, reportError: () => {} });
      async function call(action: GrammarAction, body?: unknown, id?: string, query = "") {
        const method = action === "generate" ? "POST" : action === "favorite" ? "PATCH" : action === "delete" ? "DELETE" : "GET";
        return handler(new Request(`https://tuji.test/api/assistant/grammar${query}`, {
          method, ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
        }), action, id);
      }
      return { userId, account, store, call, calls: () => calls, disable: () => { enabled = false; },
        model: (value: GrammarModel) => { generate = async input => { calls++; return value(input); }; } };
    }
    await t.test("three modes produce distinct saved cards; prices are hard caps and repeats never regenerate", async () => {
      const f = await fixture();
      for (const mode of ["explain", "compare", "practice"] as const) {
        f.model(async input => ({ reply: sampleReply(input.mode), usage: { inputTokens: 100000, outputTokens: 100000 } }));
        const input = sampleInput(mode);
        const first = await (await f.call("generate", input)).json();
        assert.equal(first.record.status, "completed"); assert.equal(first.record.charged, input.maxPoints);
        const again = await (await f.call("generate", input)).json();
        assert.deepEqual(again, first);
        assert.equal((await f.call("generate", { ...input, context: "changed" })).status, 409);
      }
      assert.equal(f.calls(), 3);
      assert.equal((await wallet.readWallet(f.account)).available, 1000 - 8 - 10 - 20);
    });
    await t.test("concurrent duplicate submissions invoke the model once and charge once", async () => {
      const f = await fixture(), input = sampleInput();
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      f.model(async () => { await held; return { reply: sampleReply(), usage: sampleUsage }; });
      const first = f.call("generate", input);
      while (f.calls() === 0) await new Promise(resolve => setTimeout(resolve, 5));
      const duplicates = await Promise.all(Array.from({ length: 12 }, () => f.call("generate", input)));
      assert.ok(duplicates.every(r => r.status === 202));
      release();
      assert.equal((await (await first).json()).record.status, "completed");
      assert.equal(f.calls(), 1);
      const [{ count }] = await sql`SELECT count(*)::int FROM credit_ledger WHERE user_id = ${f.userId} AND kind = 'commit'`;
      assert.equal(count, 1);
    });
    await t.test("a result-save failure rolls back the charge; retry returns the terminal failure", async () => {
      const f = await fixture(), input = sampleInput();
      await sql.unsafe(`CREATE FUNCTION reject_grammar_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.status = 'completed' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
      await sql.unsafe("CREATE TRIGGER reject_grammar_result BEFORE UPDATE ON assistant_grammar_requests FOR EACH ROW EXECUTE FUNCTION reject_grammar_result()");
      try {
        const result = await (await f.call("generate", input)).json();
        assert.equal(result.record.status, "failed"); assert.equal(result.record.charged, 0);
        assert.equal((await wallet.readWallet(f.account)).available, 1000);
        assert.deepEqual(await (await f.call("generate", input)).json(), result);
        assert.equal(f.calls(), 1);
      } finally { await sql.unsafe("DROP TRIGGER reject_grammar_result ON assistant_grammar_requests"); await sql.unsafe("DROP FUNCTION reject_grammar_result()"); }
    });
    await t.test("lost commit acknowledgement recovers the paid result without charging again", async () => {
      const f = await fixture();
      const complete = f.store.complete;
      f.store.complete = async (...args) => { await complete(...args); throw new Error("lost acknowledgement"); };
      const result = await (await f.call("generate", sampleInput())).json();
      assert.equal(result.record.status, "completed");
      assert.ok(result.record.charged > 0);
      const restored = await (await f.call("read", undefined, result.record.id)).json();
      assert.deepEqual(restored, result);
    });
    await t.test("insufficient balance and stale prices do not call AI; races never leave a charge without a result", async () => {
      const f = await fixture();
      assert.equal((await f.call("generate", { ...sampleInput(), maxPoints: 1 })).status, 409);
      assert.equal(f.calls(), 0);
      f.model(async () => {
        await wallet.reserve(f.account, "other-purchase", 1000); await wallet.settle(f.account, "other-purchase", "commit");
        return { reply: sampleReply(), usage: sampleUsage };
      });
      const result = await (await f.call("generate", sampleInput())).json();
      assert.equal(result.record.status, "failed"); assert.equal(result.record.error, "insufficient_credits");
      assert.equal(result.record.charged, 0);
      assert.equal((await f.call("generate", sampleInput())).status, 409);
      assert.equal(f.calls(), 1);
    });
    await t.test("clarification, invalid output and provider errors are free", async () => {
      const f = await fixture();
      f.model(async () => ({ reply: { outcome: "clarification", message: "這句有兩個語法，要看哪一個？", content: null,
        candidates: [{ focus: "〜たことがある", description: "經驗" }, { focus: "〜ながら", description: "同時進行" }] }, usage: sampleUsage }));
      const clarified = await (await f.call("generate", sampleInput("compare"))).json();
      assert.equal(clarified.record.status, "clarification"); assert.equal(clarified.record.charged, 0);
      f.model(async () => ({ reply: { ...sampleReply(), content: null }, usage: sampleUsage }));
      assert.equal((await (await f.call("generate", sampleInput())).json()).record.status, "failed");
      f.model(async () => { throw new Error("offline provider"); });
      assert.equal((await (await f.call("generate", sampleInput())).json()).record.status, "failed");
      assert.equal((await wallet.readWallet(f.account)).available, 1000);
    });
    await t.test("expired runs cannot deliver or charge late", async () => {
      const f = await fixture(), input = sampleInput();
      await f.store.begin(f.account, input);
      clock = new Date(clock.getTime() + 151000);
      const result = await (await f.call("read", undefined, input.requestId)).json();
      assert.equal(result.record.status, "failed");
      await assert.rejects(f.store.complete(f.account, input, sampleReply(), 3, sampleUsage));
      assert.equal((await wallet.readWallet(f.account)).available, 1000);
    });
    await t.test("history survives disabled generation and membership loss; account/language/environment stay isolated", async () => {
      const f = await fixture(), other = await fixture(), input = sampleInput();
      await f.call("generate", input);
      f.disable();
      await sql`DELETE FROM credit_user_policies WHERE user_id = ${f.userId}`;
      assert.equal((await (await f.call("read", undefined, input.requestId)).json()).record.status, "completed");
      assert.equal((await f.call("generate", sampleInput())).status, 403);
      assert.equal((await other.call("read", undefined, input.requestId)).status, 404);
      assert.equal(await f.store.read({ ...f.account, environment: "production" }, input.requestId), null);
      const list = (q: string) => f.call("list", undefined, undefined, q).then(r => r.json());
      // History splits by learning direction only; the interface language a card was made in does not hide it.
      assert.equal((await list("?learningDirection=zh-ja")).records.length, 1);
      assert.equal((await list("?uiLanguage=ja&learningDirection=zh-ja")).records.length, 1);
      assert.equal((await list("?learningDirection=zh-en")).records.length, 0);
      // 模版 filter narrows the list; every card is one of the three.
      assert.equal((await list("?learningDirection=zh-ja&mode=explain")).records.length, 1);
      assert.equal((await list("?learningDirection=zh-ja&mode=practice")).records.length, 0);
      assert.equal((await f.call("list", undefined, undefined, "?learningDirection=zh-ja&mode=lookup")).status, 400);
      await f.call("favorite", { favorite: true }, input.requestId);
      assert.equal((await list("?learningDirection=zh-ja&favorite=true")).records.length, 1);
      await f.call("delete", undefined, input.requestId);
      assert.equal((await list("?learningDirection=zh-ja")).records.length, 0);
      assert.equal((await (await f.call("generate", input)).json()).record.status, "deleted");
      assert.equal(f.calls(), 1);
      const [{ input: removed, result }] = await sql`SELECT input, result FROM assistant_grammar_requests WHERE user_id = ${f.userId}`;
      assert.equal(removed, null); assert.equal(result, null);
    });
    await t.test("the offer says why generation is closed: switched off beats membership", async () => {
      const f = await fixture();
      const offer = () => f.call("offer").then(r => r.json());
      assert.deepEqual([(await offer()).enabled, (await offer()).reason], [true, null]);
      const card = sampleInput("explain", { uiLanguage: "ja" });
      await f.call("generate", card);
      const both = await (await f.call("list", undefined, undefined, "?learningDirection=zh-ja")).json();
      assert.equal(both.records[0].input.uiLanguage, "ja");
      await sql`DELETE FROM credit_user_policies WHERE user_id = ${f.userId}`;
      assert.deepEqual([(await offer()).enabled, (await offer()).reason], [false, "membership"]);
      f.disable();
      assert.deepEqual([(await offer()).enabled, (await offer()).reason], [false, "disabled"]);
    });
    await t.test("history paginates without duplicates; schema denies client policies and cascades account deletion", async () => {
      const f = await fixture();
      for (let i = 0; i < 32; i++) await f.call("generate", sampleInput("explain", { query: `語法${i}` }));
      const first = await (await f.call("list", undefined, undefined, "?learningDirection=zh-ja")).json();
      const second = await (await f.call("list", undefined, undefined, `?learningDirection=zh-ja&cursor=${first.nextCursor}`)).json();
      assert.equal(first.records.length, 30); assert.equal(second.records.length, 2);
      assert.equal(new Set([...first.records, ...second.records].map(r => r.id)).size, 32);
      const [table] = await sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'assistant_grammar_requests'`;
      assert.equal(table.relrowsecurity, true);
      assert.equal((await sql`SELECT * FROM pg_policies WHERE tablename = 'assistant_grammar_requests'`).length, 0);
      await sql`DELETE FROM auth.users WHERE id = ${f.userId}`;
      assert.equal((await sql`SELECT * FROM assistant_grammar_requests WHERE user_id = ${f.userId}`).length, 0);
    });
  } finally { await sql.end(); }
});
