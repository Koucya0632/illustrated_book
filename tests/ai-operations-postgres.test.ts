import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { migrateCreditSchema } from "../lib/credits/schema";
import { createCreditWallet } from "../lib/credits/wallet";
import { creditConfig, CreditError } from "../lib/credits/policy";
import { isCreditAccount } from "../lib/credits/legacy-guard";
import { migrateAiOperationsSchema, AI_OPERATION_TABLES } from "../lib/ai-operations/schema";
import { createAiOperations } from "../lib/ai-operations/service";
import { createAiRunner } from "../lib/ai-operations/runner";
import { OperationError, type RecognitionInput } from "../lib/ai-operations/contracts";
import { createFulfillments } from "../lib/ai-operations/fulfillment";
import { createFulfillmentRunner } from "../lib/ai-operations/fulfillment-runner";
import { createCreditUploads } from "../lib/ai-operations/uploads";
import { createCreditStore } from "../lib/credits/store";
import type { StoreSnapshot } from "../lib/credits/store-contracts";
import { creditOperationsReport } from "../lib/credits/operations-report";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;
const errorCode = (code: string) => (error: unknown) =>
  (error instanceof OperationError || error instanceof CreditError) && error.code === code;
function delivery(stage: "primary" | "escalated" = "primary") {
  return {
    provider: "test-provider", model: "fixture", stage,
    primary: [{ label: "cat", normalizedLabel: "cat", zhHant: "貓", gloss: null, confidence: 0.9, taxonomyNodeId: null }],
    fine: [], attributes: { colors: [], scene: null, count: 1 }, uncertainty: { reason: null, needsEscalation: false },
    usage: { latencyMs: 1, inputTokens: 100, outputTokens: 10 },
  };
}

test("durable AI operations with real PostgreSQL", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const sql = postgres(databaseUrl!, { max: 25, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await sql`CREATE TABLE IF NOT EXISTS words (id TEXT PRIMARY KEY)`;
    // Use the actual additive atlas DDL, not a test copy with weaker constraints.
    const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
    for (const table of ["user_atlas_images", "user_atlas_recognition_jobs", "user_atlas_candidates", "user_atlas_items",
      "user_atlas_ai_usage", "user_entitlements", "user_entitlement_grants", "user_lifetime_entitlements"]) {
      const statement = migration.match(new RegExp("`(CREATE TABLE IF NOT EXISTS " + table + " \\([\\s\\S]*?)`"))?.[1];
      assert.ok(statement, `missing real DDL for ${table}`);
      await sql.unsafe(statement);
    }
    await sql`ALTER TABLE user_atlas_candidates ADD COLUMN IF NOT EXISTS gloss TEXT`;
    await sql`ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS display_ja TEXT`;
    await sql`ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS display_en TEXT`;
    for (const column of ["enrichment", "definition_ja", "definition_en", "reading_segments", "backfill_attempts", "backfill_attempts_version"]) {
      const statement = migration.match(new RegExp("`(ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS " + column + " [^`]+)`"))?.[1];
      assert.ok(statement); await sql.unsafe(statement);
    }
    await sql`ALTER TABLE user_entitlements ADD COLUMN IF NOT EXISTS storekit_revoked_at TIMESTAMPTZ`;
    await sql`ALTER TABLE user_lifetime_entitlements ADD COLUMN IF NOT EXISTS source TEXT`;
    await sql`ALTER TABLE user_lifetime_entitlements ADD COLUMN IF NOT EXISTS reason TEXT`;
    await migrateCreditSchema(sql);
    await migrateAiOperationsSchema(sql);
    await migrateAiOperationsSchema(sql);

    async function fixture(points = 1000) {
      const userId = randomUUID(), imageId = randomUUID();
      const account = { userId, environment: "sandbox" as const };
      await sql`INSERT INTO auth.users (id) VALUES (${userId})`;
      await sql`INSERT INTO user_lifetime_entitlements (user_id, source, reason) VALUES (${userId}, 'grant', 'isolated test')`;
      await sql`INSERT INTO credit_accounts (user_id, environment) VALUES (${userId}, 'sandbox')`;
      await sql`INSERT INTO credit_user_policies (user_id, environment, billing_mode) VALUES (${userId}, 'sandbox', 'credits')`;
      let now = new Date("2026-10-03T12:00:00Z");
      const wallet = createCreditWallet(sql, () => now), operations = createAiOperations(sql, () => now);
      if (points) await wallet.grant(account, { key: "test-funds", amount: points, source: "purchase", expiresAt: null });
      async function newImage(id = randomUUID()) {
        await sql`INSERT INTO user_atlas_images (id, user_id, original_path, thumb_path, recognition_path, mime_type, byte_size, sha256)
          VALUES (${id}, ${userId}, 'test/original.webp', 'test/thumb.webp', 'test/recognition.webp', 'image/webp', 100, ${id})`;
        return id;
      }
      await newImage(imageId);
      const input: RecognitionInput = { imageId, feature: "atlas.recognize.primary", targetLanguage: "en", glossLanguage: null };
      async function accept(key: string = randomUUID(), raw = input) {
        const quote = await operations.quote(account, raw);
        return operations.accept(account, quote.id, key);
      }
      async function finish(id: string, value: unknown = delivery()) {
        const lease = await operations.claimWork(account, id);
        assert.ok(lease);
        await operations.stageResult(account, id, lease.token, value);
        return operations.commit(account, id, lease.token);
      }
      return { sql, account, imageId, input, wallet, operations, newImage, accept, finish,
        fulfillments: createFulfillments(sql, () => now), uploads: createCreditUploads(sql, () => now),
        setTime: (iso: string) => { now = new Date(iso); } };
    }

    await t.test("20 accept retries reserve once; changed input or another key conflicts", async () => {
      const f = await fixture();
      const quote = await f.operations.quote(f.account, f.input);
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 0);
      const results = await Promise.all(Array.from({ length: 20 }, () => f.operations.accept(f.account, quote.id, "same")));
      assert.equal(new Set(results.map(result => result.id)).size, 1);
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
      await assert.rejects(f.operations.accept(f.account, quote.id, "different"), errorCode("idempotency_conflict"));
      const different = await f.operations.quote(f.account, { ...f.input, targetLanguage: "ja" });
      await assert.rejects(f.operations.accept(f.account, different.id, "same"), errorCode("idempotency_conflict"));
    });

    await t.test("paused acceptance recovers the same key without creating new work and history stays owned", async () => {
      const f = await fixture(), other = await fixture();
      const quote = await f.operations.quote(f.account, f.input);
      await assert.rejects(f.operations.accept(f.account, quote.id, "paused", false), errorCode("credits_disabled"));
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 0);
      const op = await f.operations.accept(f.account, quote.id, "original");
      f.setTime("2026-10-03T12:06:00Z");
      assert.equal((await f.operations.accept(f.account, quote.id, "original", false)).id, op.id);
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
      assert.equal((await f.operations.list(f.account)).operations[0].id, op.id);
      assert.deepEqual((await other.operations.list(other.account)).operations, []);
      await assert.rejects(f.operations.list({ ...f.account, environment: "production" }), errorCode("credits_not_enrolled"));
    });

    await t.test("expired quotes, modified images and foreign owners never reserve", async () => {
      const f = await fixture(), other = await fixture();
      const quote = await f.operations.quote(f.account, f.input);
      await assert.rejects(other.operations.accept(other.account, quote.id, "foreign"), errorCode("quote_not_found"));
      await assert.rejects(other.operations.quote(other.account, f.input), errorCode("image_not_found"));
      f.setTime("2026-10-03T12:05:00Z");
      await assert.rejects(f.operations.accept(f.account, quote.id, "expired"), errorCode("quote_expired"));
      const fresh = await f.operations.quote(f.account, f.input);
      await sql`UPDATE user_atlas_images SET sha256 = 'changed' WHERE id = ${f.imageId}`;
      await assert.rejects(f.operations.accept(f.account, fresh.id, "changed"), errorCode("image_changed"));
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 0);
    });

    await t.test("result, candidates and debit commit once; private staged results are not exposed", async () => {
      const f = await fixture();
      const op = await f.accept();
      const leases = await Promise.all(Array.from({ length: 10 }, () => f.operations.claimWork(f.account, op.id)));
      assert.equal(leases.filter(Boolean).length, 1);
      const lease = leases.find(Boolean)!;
      await f.operations.stageResult(f.account, op.id, lease.token, delivery());
      await f.operations.stageResult(f.account, op.id, lease.token, delivery());
      assert.equal((await f.operations.read(f.account, op.id)).result, null);
      await Promise.all(Array.from({ length: 10 }, () => f.operations.commit(f.account, op.id, lease.token)));
      const finished = await f.operations.read(f.account, op.id);
      assert.equal(finished.state, "committed");
      assert.equal(finished.result.candidates.length, 1);
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 0);
      const [candidates] = await sql`SELECT count(*)::int AS total FROM user_atlas_candidates WHERE user_id = ${f.account.userId}`;
      assert.equal(candidates.total, 1);
      const [usage] = await sql`SELECT count(*)::int AS total FROM user_atlas_ai_usage WHERE user_id = ${f.account.userId}`;
      assert.equal(usage.total, 1);
    });

    await t.test("late worker fencing rejects old tokens and recovers staged results without another model call", async () => {
      const f = await fixture();
      const op = await f.accept();
      const old = await f.operations.claimWork(f.account, op.id);
      assert.ok(old);
      await f.operations.stageResult(f.account, op.id, old.token, delivery());
      f.setTime("2026-10-03T12:01:31Z");
      await assert.rejects(f.operations.commit(f.account, op.id, old.token), errorCode("stale_attempt"));
      let calls = 0;
      const run = createAiRunner(f.operations, { prepare: async () => 1, execute: async () => { calls++; return delivery(); } });
      assert.equal(await run(f.account, op.id), "committed");
      assert.equal(calls, 0);
      await assert.rejects(f.operations.stageResult(f.account, op.id, old.token, delivery()), errorCode("stale_attempt"));
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);
    });

    await t.test("crashed unknown result is held until deadline, never calls the model again, then releases", async () => {
      const f = await fixture();
      const op = await f.accept();
      const old = await f.operations.claimWork(f.account, op.id);
      assert.ok(old);
      f.setTime("2026-10-03T12:01:31Z");
      assert.equal(await f.operations.claimWork(f.account, op.id), null);
      assert.equal((await f.operations.read(f.account, op.id)).state, "reconciling");
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
      f.setTime("2026-10-03T12:15:00Z");
      assert.equal(await f.operations.claimWork(f.account, op.id), null);
      assert.equal((await f.operations.read(f.account, op.id)).state, "released");
      assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      await assert.rejects(f.operations.stageResult(f.account, op.id, old.token, delivery()), errorCode("stale_attempt"));
      const [capacity] = await sql`SELECT count(*)::int AS total FROM atlas_capacity_reservations WHERE user_id = ${f.account.userId}`;
      assert.equal(capacity.total, 0);
    });

    await t.test("invalid, empty and missing-language results release points", async () => {
      for (const value of [{ ...delivery(), primary: [] }, { ...delivery(), primary: [{ ...delivery().primary[0], zhHant: null }] },
        { ...delivery(), stage: "escalated" }]) {
        const f = await fixture();
        const op = await f.accept();
        const run = createAiRunner(f.operations, { prepare: async () => 1, execute: async () => value });
        assert.equal(await run(f.account, op.id), "released");
        assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
        const [attempt] = await sql`SELECT usage FROM ai_operation_attempts WHERE operation_id = ${op.id}`;
        assert.equal(attempt.usage.inputTokens, 100);
      }
    });

    await t.test("ordinary then precision costs 200; frozen language and gloss reach one confirmed item", async () => {
      const f = await fixture();
      const ordinary = await f.accept();
      await f.finish(ordinary.id);
      const precision = await f.accept("precision", { ...f.input, feature: "atlas.recognize.precision", targetLanguage: "ja", glossLanguage: "en" });
      const value = { ...delivery("escalated"),
        primary: [{ ...delivery().primary[0], label: "猫", normalizedLabel: "猫", gloss: "cat" }] };
      const result = await f.finish(precision.id, value);
      const confirmed = await f.operations.confirm(f.account, precision.id, result.result.candidates[0].id);
      assert.equal(confirmed.item.target_language, "ja");
      assert.equal(confirmed.item.display_en, "cat");
      assert.equal((await f.wallet.readWallet(f.account)).available, 800);
      assert.equal(confirmed.operation.fulfillmentState, "pending");
      await assert.rejects(f.operations.read({ ...f.account, environment: "production" }, precision.id));
    });

    await t.test("direct precision costs 200; the upgrade discount is used once and a stale upgrade quote cannot be accepted", async () => {
      const f = await fixture();
      const precisionInput = { ...f.input, feature: "atlas.recognize.precision" as const };
      assert.equal((await f.operations.quote(f.account, precisionInput)).points, 200);
      const ordinary = await f.accept();
      await f.finish(ordinary.id);
      const first = await f.operations.quote(f.account, precisionInput);
      const second = await f.operations.quote(f.account, precisionInput);
      assert.deepEqual([first.points, second.points], [100, 100]);
      const upgraded = await f.operations.accept(f.account, first.id, "upgrade");
      await f.finish(upgraded.id, delivery("escalated"));
      await assert.rejects(f.operations.accept(f.account, second.id, "stale"), errorCode("quote_expired"));
      assert.equal((await f.operations.quote(f.account, precisionInput)).points, 200);
      assert.equal((await f.wallet.readWallet(f.account)).available, 800);
    });

    await t.test("a released upgrade leaves the discount available", async () => {
      const f = await fixture();
      const ordinary = await f.accept();
      await f.finish(ordinary.id);
      const precisionInput = { ...f.input, feature: "atlas.recognize.precision" as const };
      const upgrade = await f.accept("cancelled", precisionInput);
      await f.operations.cancel(f.account, upgrade.id);
      assert.equal((await f.operations.quote(f.account, precisionInput)).points, 100);
    });

    await t.test("an almost-expired queued job releases without starting a provider call", async () => {
      const f = await fixture();
      const op = await f.accept();
      f.setTime("2026-10-03T12:14:01Z");
      let calls = 0;
      const run = createAiRunner(f.operations, { prepare: async () => 1, execute: async () => { calls++; return delivery(); } });
      assert.equal(await run(f.account, op.id), "idle");
      assert.equal(calls, 0);
      assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
    });

    await t.test("provider timeout reconciles; late response cannot charge; late download cannot call the provider", async () => {
      const f = await fixture();
      const op = await f.accept();
      let resolve!: (value: unknown) => void;
      const run = createAiRunner(f.operations, { timeoutMs: 20, prepare: async () => 1,
        execute: () => new Promise(done => { resolve = done; }) });
      assert.equal(await run(f.account, op.id), "reconciling");
      resolve(delivery());
      await new Promise(done => setTimeout(done, 20));
      assert.equal((await f.operations.read(f.account, op.id)).state, "reconciling");
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
      const g = await fixture();
      const downloadOp = await g.accept();
      let calls = 0, finishDownload!: (value: number) => void;
      const delayed = createAiRunner(g.operations, { timeoutMs: 20,
        prepare: () => new Promise<number>(done => { finishDownload = done; }),
        execute: async () => { calls++; return delivery(); } });
      assert.equal(await delayed(g.account, downloadOp.id), "released");
      finishDownload(1);
      await new Promise(done => setTimeout(done, 20));
      assert.equal(calls, 0);
      assert.equal((await g.wallet.readWallet(g.account)).available, 1000);
    });

    await t.test("concurrent starts at 199 slots accept just one operation before charging", async () => {
      const f = await fixture();
      await sql`INSERT INTO user_atlas_items (id, user_id, image_id, target_language, primary_label, lemma, display_zh_hant, correction_source)
        SELECT gen_random_uuid(), ${f.account.userId}::uuid, ${f.imageId}::uuid, 'en', 'old', 'old', '舊', 'manual'
        FROM generate_series(1, 199)`;
      const first = await f.newImage(), second = await f.newImage();
      const quotes = await Promise.all([first, second].map(imageId => f.operations.quote(f.account, { ...f.input, imageId })));
      const accepted = await Promise.allSettled(quotes.map((quote, i) => f.operations.accept(f.account, quote.id, `cap-${i}`)));
      assert.equal(accepted.filter(result => result.status === "fulfilled").length, 1);
      assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
      const success = accepted.find(result => result.status === "fulfilled")!;
      assert.equal(success.status, "fulfilled");
      const result = await f.finish(success.value.id);
      await Promise.all(Array.from({ length: 10 }, () => f.operations.confirm(f.account, result.id, result.result.candidates[0].id)));
      const [count] = await sql`SELECT count(*)::int AS total FROM user_atlas_items WHERE user_id = ${f.account.userId} AND deleted_at IS NULL`;
      assert.equal(count.total, 200);
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);
    });

    await t.test("expired confirmation holds recheck capacity without another debit", async () => {
      const f = await fixture();
      const op = await f.accept();
      const finished = await f.finish(op.id);
      f.setTime("2026-10-03T12:30:00Z");
      await sql`INSERT INTO user_atlas_items (id, user_id, image_id, target_language, primary_label, lemma, display_zh_hant, correction_source)
        SELECT gen_random_uuid(), ${f.account.userId}::uuid, ${f.imageId}::uuid, 'en', 'old', 'old', '舊', 'manual'
        FROM generate_series(1, 200)`;
      const alternateImage = await f.newImage();
      // The operation image has no existing item when the collection is full.
      await sql`UPDATE user_atlas_items SET image_id = ${alternateImage} WHERE user_id = ${f.account.userId}`;
      await assert.rejects(f.operations.confirm(f.account, op.id, finished.result.candidates[0].id), errorCode("capacity_full"));
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);
      await sql`UPDATE user_atlas_items SET deleted_at = now() WHERE id IN
        (SELECT id FROM user_atlas_items WHERE user_id = ${f.account.userId} LIMIT 1)`;
      await f.operations.confirm(f.account, op.id, finished.result.candidates[0].id);
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);
    });

    await t.test("cancel-before-worker releases; ownership and one included card cannot be bypassed", async () => {
      const f = await fixture(), other = await fixture();
      const cancelled = await f.accept();
      await f.operations.cancel(f.account, cancelled.id);
      assert.equal(await f.operations.claimWork(f.account, cancelled.id), null);
      assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      const op = await f.accept();
      const result = await f.finish(op.id, { ...delivery(), fine: [{ ...delivery().primary[0], label: "kitten" }] });
      await assert.rejects(other.operations.read(other.account, op.id), errorCode("operation_not_found"));
      await assert.rejects(other.operations.confirm(other.account, op.id, result.result.candidates[0].id), errorCode("operation_not_found"));
      await f.operations.confirm(f.account, op.id, result.result.candidates[0].id);
      await assert.rejects(f.operations.confirm(f.account, op.id, result.result.candidates[1].id), errorCode("idempotency_conflict"));
    });

    await t.test("database settlement failure rolls back delivery and recovers it without another model call", async () => {
      const f = await fixture();
      const op = await f.accept();
      const lease = await f.operations.claimWork(f.account, op.id);
      assert.ok(lease);
      await f.operations.stageResult(f.account, op.id, lease.token, delivery());
      await sql.unsafe(`CREATE OR REPLACE FUNCTION ai_test_fail_commit() RETURNS trigger AS $$
        BEGIN IF NEW.kind = 'commit' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END;
        $$ LANGUAGE plpgsql`);
      await sql.unsafe("CREATE TRIGGER ai_test_fail BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION ai_test_fail_commit()");
      try {
        await assert.rejects(f.operations.commit(f.account, op.id, lease.token));
        assert.equal((await f.operations.read(f.account, op.id)).result, null);
        const [rows] = await sql`SELECT count(*)::int AS total FROM user_atlas_candidates WHERE user_id = ${f.account.userId}`;
        assert.equal(rows.total, 0);
        assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
      } finally {
        await sql.unsafe("DROP TRIGGER ai_test_fail ON credit_ledger");
        await sql.unsafe("DROP FUNCTION ai_test_fail_commit()");
      }
      await f.operations.markUncertain(f.account, op.id, lease.token);
      let calls = 0;
      const run = createAiRunner(f.operations, { prepare: async () => 1, execute: async () => { calls++; return delivery(); } });
      assert.equal(await run(f.account, op.id), "committed");
      assert.equal(calls, 0);
    });

    await t.test("converted subscription and grant Pro enforce 200 slots before reserving points and preserve existing cards", async () => {
      for (const source of ["subscription", "grant"] as const) {
        const f = await fixture();
        if (source === "subscription") {
          await sql`INSERT INTO user_entitlements (user_id, tier, expires_at) VALUES (${f.account.userId}, 'pro', '2099-11-01Z')`;
        } else {
          await sql`INSERT INTO user_entitlement_grants(user_id, expires_at, reason, granted_by)
            VALUES (${f.account.userId}, '2099-11-01Z', 'conversion fixture', 'test')`;
        }
        await sql`INSERT INTO user_atlas_items (id, user_id, image_id, target_language, primary_label, lemma, display_zh_hant, correction_source)
          SELECT gen_random_uuid(), ${f.account.userId}::uuid, ${f.imageId}::uuid, 'en', 'old', 'old', '舊', 'manual'
          FROM generate_series(1, 200)`;
        const imageId = await f.newImage();
        const quote = await f.operations.quote(f.account, { ...f.input, imageId });
        const before = await f.wallet.readWallet(f.account);
        await assert.rejects(f.operations.accept(f.account, quote.id, "converted-pro"), errorCode("capacity_full"));
        assert.deepEqual(await f.wallet.readWallet(f.account), before);
        const [cards] = await sql`SELECT count(*)::int AS n FROM user_atlas_items WHERE user_id = ${f.account.userId} AND deleted_at IS NULL`;
        assert.equal(cards.n, 200);
        await sql`UPDATE user_atlas_items SET deleted_at = now() WHERE id = (
          SELECT id FROM user_atlas_items WHERE user_id = ${f.account.userId} LIMIT 1)`;
        const op = await f.operations.accept(f.account, quote.id, "converted-pro");
        assert.equal((await f.wallet.readWallet(f.account)).reserved, 100);
        await f.operations.cancel(f.account, op.id);
        await sql`UPDATE user_lifetime_entitlements SET revoked_at = now() WHERE user_id = ${f.account.userId}`;
        await assert.rejects(f.operations.quote(f.account, f.input), errorCode("benefit_ineligible"));
      }
    });

    const enriched = () => ({ provider: "test", model: "fixture", usage: { latencyMs: 1, inputTokens: 20 }, fields: {
      pronunciation: null, reading: null, readingSegments: null, definitionTarget: "A small animal", definitionZh: "小動物",
      definitionJa: "小さい動物", definitionEn: "A small animal", displayJa: "猫", displayEn: "cat",
      enrichment: { targetDefinitionLang: "en", enrichVersion: 3, synonyms: [], forms: [] },
    } });
    async function included(f: Awaited<ReturnType<typeof fixture>>) {
      const op = await f.accept(), delivered = await f.finish(op.id);
      const confirmed = await f.operations.confirm(f.account, op.id, delivered.result.candidates[0].id);
      return { op, confirmed };
    }
    await t.test("included fulfillment has one worker, one atomic delivery and no extra debit", async () => {
      const f = await fixture(), { op, confirmed } = await included(f);
      let calls = 0;
      const run = createFulfillmentRunner(f.fulfillments, async () => { calls++; return enriched(); });
      const outcomes = await Promise.all(Array.from({ length: 10 }, () => run(f.account, op.id)));
      assert.equal(calls, 1); assert.equal(outcomes.filter(o => o === "completed").length, 1);
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);
      const [item] = await sql`SELECT * FROM user_atlas_items WHERE id = ${confirmed.item.id}`;
      assert.equal(item.definition_target, "A small animal"); assert.equal(item.backfill_status, "filled");
      assert.equal((await f.operations.read(f.account, op.id)).fulfillmentState, "completed");
      assert.equal(await run(f.account, op.id), "idle");
    });
    await t.test("a manually corrected name keeps the included supplement; a later rename still withdraws it", async () => {
      const f = await fixture();
      const op = await f.accept(), delivered = await f.finish(op.id);
      const confirmed = await f.operations.confirm(f.account, op.id, delivered.result.candidates[0].id,
        { lemma: "kitten", displayZhHant: "小貓", displayGloss: "ignored" });
      assert.equal(confirmed.item.lemma, "kitten"); assert.equal(confirmed.item.primary_label, "cat");
      assert.equal(confirmed.item.display_zh_hant, "小貓"); assert.equal(confirmed.item.display_en, null);
      assert.equal(confirmed.item.correction_source, "manual");
      let seen = "";
      const run = createFulfillmentRunner(f.fulfillments, async lease => { seen = lease.item.lemma; return enriched(); });
      assert.equal(await run(f.account, op.id), "completed");
      assert.equal(seen, "kitten");
      assert.equal((await f.wallet.readWallet(f.account)).available, 900);

      const other = await fixture();
      const second = await other.accept(), result = await other.finish(second.id);
      const kept = await other.operations.confirm(other.account, second.id, result.result.candidates[0].id, {});
      assert.equal(kept.item.lemma, "cat"); assert.equal(kept.item.correction_source, "candidate");
      await sql`UPDATE user_atlas_items SET lemma = 'renamed' WHERE id = ${kept.item.id}`;
      const lease = await other.fulfillments.claim(other.account, second.id);
      assert.equal(lease, null);
      assert.equal((await other.operations.read(other.account, second.id)).fulfillmentState, "superseded");
    });

    await t.test("three invalid supplements compensate once using original paid and gift allocations", async () => {
      const f = await fixture(0);
      await f.wallet.grant(f.account, { key: "gift", source: "monthly", amount: 40, expiresAt: new Date("2026-10-03T12:03:00Z") });
      await f.wallet.grant(f.account, { key: "paid", source: "purchase", amount: 200, expiresAt: null });
      const { op } = await included(f);
      const run = createFulfillmentRunner(f.fulfillments, async () => ({ ...enriched(), fields: { ...enriched().fields, definitionZh: "" } }));
      assert.equal(await run(f.account, op.id), "pending");
      f.setTime("2026-10-03T12:02:00Z"); assert.equal(await run(f.account, op.id), "pending");
      f.setTime("2026-10-03T12:04:00Z"); assert.equal(await run(f.account, op.id), "compensated");
      assert.equal(await run(f.account, op.id), "idle");
      const balance = await f.wallet.readWallet(f.account);
      assert.equal(balance.available, 200); assert.equal(balance.paidAvailable, 200); assert.equal(balance.giftAvailable, 0);
      const ledger = await f.wallet.readLedger(f.account);
      assert.equal(ledger.entries.filter(row => row.kind === "compensate").length, 1);
      assert.equal(ledger.entries.find(row => row.kind === "expire")?.amount, -40);
    });
    await t.test("staged supplement recovers a database failure without another AI call", async () => {
      const f = await fixture(), { op } = await included(f);
      const lease = await f.fulfillments.claim(f.account, op.id); assert.ok(lease);
      await f.fulfillments.stage(f.account, op.id, lease.token, enriched());
      await sql.unsafe(`CREATE OR REPLACE FUNCTION fail_enrich() RETURNS trigger AS $$ BEGIN
        IF NEW.backfill_status = 'filled' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await sql.unsafe("CREATE TRIGGER fail_enrich BEFORE UPDATE ON user_atlas_items FOR EACH ROW EXECUTE FUNCTION fail_enrich()");
      try { await assert.rejects(f.fulfillments.commit(f.account, op.id, lease.token)); }
      finally { await sql.unsafe("DROP TRIGGER fail_enrich ON user_atlas_items"); await sql.unsafe("DROP FUNCTION fail_enrich()"); }
      await f.fulfillments.fail(f.account, op.id, lease.token, "database_uncertain", true);
      f.setTime("2026-10-03T12:01:30Z");
      let calls = 0;
      const run = createFulfillmentRunner(f.fulfillments, async () => { calls++; return enriched(); });
      assert.equal(await run(f.account, op.id), "completed"); assert.equal(calls, 0);
      await assert.rejects(f.fulfillments.stage(f.account, op.id, lease.token, enriched()), errorCode("stale_attempt"));
    });
    await t.test("supplement timeout cannot apply a late result or make a second provider call", async () => {
      const f = await fixture(), { op } = await included(f);
      let resolve!: (v: unknown) => void, calls = 0;
      const run = createFulfillmentRunner(f.fulfillments, () => { calls++; return new Promise(done => { resolve = done; }); }, 10);
      assert.equal(await run(f.account, op.id), "reconciling"); resolve(enriched());
      await new Promise(done => setTimeout(done, 20));
      f.setTime("2026-10-03T12:01:30Z"); assert.equal(await run(f.account, op.id), "idle");
      assert.equal(calls, 1); assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      assert.equal((await f.operations.read(f.account, op.id)).fulfillmentState, "compensated");
    });
    await t.test("re-recognition clears old details and fences the old included supplement", async () => {
      const f = await fixture(), first = await included(f);
      const lease = await f.fulfillments.claim(f.account, first.op.id); assert.ok(lease);
      await f.fulfillments.stage(f.account, first.op.id, lease.token, enriched());
      await sql`UPDATE user_atlas_items SET definition_target = 'stale', enrichment = '{"mnemonic":"stale"}'::jsonb WHERE id = ${first.confirmed.item.id}`;
      const second = await included(f);
      assert.equal(second.confirmed.item.id, first.confirmed.item.id);
      assert.equal(second.confirmed.item.definition_target, null); assert.deepEqual(second.confirmed.item.enrichment, {});
      assert.equal(await f.fulfillments.commit(f.account, first.op.id, lease.token), "superseded");
      assert.equal((await f.wallet.readWallet(f.account)).available, 800);
    });
    const uploadInput = () => ({ sha256: randomUUID().replaceAll("-", "").repeat(2), byteSize: 1000, width: 800, height: 600 });
    await t.test("parallel uploads reserve only the last pending-image place, without spending", async () => {
      const f = await fixture();
      for (let i = 0; i < 18; i++) await f.newImage();
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => f.uploads.begin(f.account, uploadInput())));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
    });
    await t.test("upload hash dedup returns no candidates; failed-response cleanup cannot delete a saved image", async () => {
      const f = await fixture(), input = uploadInput();
      const start = await f.uploads.begin(f.account, input); assert.ok(start.upload);
      await assert.rejects(f.uploads.begin(f.account, input), { message: "upload_busy" });
      const image = await f.uploads.complete(f.account, start.upload.id);
      assert.equal(await f.uploads.cleanup(f.account, image.id, true), null);
      const dupe = await f.uploads.begin(f.account, input); assert.equal(dupe.duplicate, true); assert.equal(dupe.image?.id, image.id);
      assert.equal("candidates" in dupe, false);
    });
    await t.test("pending expiry prevents late completion and durable cleanup survives retries", async () => {
      const f = await fixture(), start = await f.uploads.begin(f.account, uploadInput()); assert.ok(start.upload);
      f.setTime("2026-10-03T12:15:00Z");
      await assert.rejects(f.uploads.complete(f.account, start.upload.id), { message: "upload_expired" });
      const paths = await f.uploads.cleanup(f.account, start.upload.id); assert.equal(paths?.length, 2);
      assert.deepEqual(await f.uploads.cleanup(f.account, start.upload.id), paths);
      await f.uploads.finishCleanup(f.account, start.upload.id); assert.equal(await f.uploads.cleanup(f.account, start.upload.id), null);
    });
    await t.test("retention cleanup preserves images with cards and active paid operations", async () => {
      const f = await fixture(), start = await f.uploads.begin(f.account, uploadInput()); assert.ok(start.upload);
      const image = await f.uploads.complete(f.account, start.upload.id);
      const quote = await f.operations.quote(f.account, { ...f.input, imageId: image.id });
      const op = await f.operations.accept(f.account, quote.id, "uploaded");
      f.setTime("2026-10-11T12:00:00Z");
      assert.equal(await f.uploads.cleanup(f.account, image.id), null);
      await f.operations.cancel(f.account, op.id);
      assert.equal((await f.uploads.cleanup(f.account, image.id))?.length, 2);
    });

    const store = createCreditStore(sql, () => new Date("2026-10-03T12:00:00Z"));
    let transactionCounter = 100000;
    function purchase(userId: string): StoreSnapshot {
      return { userId, environment: "sandbox", transactionId: String(transactionCounter++), productId: "app.tuji.credits.1000",
        quantity: 1, signedAt: Date.parse("2026-10-03T11:00:00Z"), kind: "purchase", refundFraction: 0 };
    }
    const refund = (p: StoreSnapshot, fraction = 100000) => ({ ...p, kind: "refund" as const, refundFraction: fraction, signedAt: p.signedAt + 1000 });
    const reverse = (p: StoreSnapshot) => ({ ...p, kind: "reverse" as const, refundFraction: 0, signedAt: p.signedAt + 2000 });
    await t.test("20 verified transaction deliveries atomically credit once; same pack can be bought again", async () => {
      const f = await fixture(0), p = purchase(f.account.userId);
      const result = await Promise.all(Array.from({ length: 20 }, () => store.apply(p, f.account.userId)));
      assert.equal(result.filter(r => r.status === "credited").length, 1);
      assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      await store.apply(purchase(f.account.userId), f.account.userId);
      assert.equal((await f.wallet.readWallet(f.account)).available, 2000);
      const [rows] = await sql`SELECT count(*)::int AS total FROM credit_store_transactions WHERE user_id = ${f.account.userId}`;
      assert.equal(rows.total, 2);
    });
    await t.test("purchase binding rejects another account and changed quantity", async () => {
      const f = await fixture(0), g = await fixture(0), p = purchase(f.account.userId);
      await assert.rejects(store.apply(p, g.account.userId), { message: "purchase_account_mismatch" });
      await store.apply(p, f.account.userId);
      await assert.rejects(store.apply({ ...p, userId: g.account.userId }, g.account.userId), { message: "purchase_identity_conflict" });
      await assert.rejects(store.apply({ ...p, quantity: 2 }, f.account.userId), { message: "purchase_identity_conflict" });
      assert.equal((await g.wallet.readWallet(g.account)).available, 0);
    });
    await t.test("refund before client delivery never revives points; only a newer reversal restores them", async () => {
      const f = await fixture(0), p = purchase(f.account.userId);
      assert.equal((await store.apply(refund(p))).status, "revoked");
      assert.equal((await store.apply(p, f.account.userId)).status, "revoked");
      assert.equal((await f.wallet.readWallet(f.account)).available, 0);
      await store.apply(reverse(p)); assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      await store.apply(refund(p)); assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
    });
    await t.test("spent refund tracks debt; reversal restores only actual withdrawals without another full pack", async () => {
      const f = await fixture(0), p = purchase(f.account.userId);
      await store.apply(p); const op = await f.accept(); await f.finish(op.id);
      const result = await store.apply(refund(p));
      assert.equal(result.refundConsumedPoints, 100);
      assert.equal((await f.wallet.readWallet(f.account)).available, 0);
      assert.equal((await f.wallet.readWallet(f.account)).reconciliationRequired, true);
      await f.wallet.grant(f.account, { key: "gift-remains", source: "monthly", amount: 1000, expiresAt: null });
      await assert.rejects(f.wallet.reserve(f.account, "new-paid-ai", 100), errorCode("credits_reconciliation_required"));
      assert.equal((await f.wallet.readWallet(f.account)).giftAvailable, 1000);
      await store.apply(reverse(p));
      const balance = await f.wallet.readWallet(f.account);
      assert.equal(balance.paidAvailable, 900); assert.equal(balance.reconciliationRequired, false);
      await store.apply(reverse(p)); assert.equal((await f.wallet.readWallet(f.account)).paidAvailable, 900);
    });
    await t.test("refund of held points fences commit and releases the whole AI reservation once", async () => {
      const f = await fixture(0), p = purchase(f.account.userId);
      await store.apply(p); const op = await f.accept();
      const lease = await f.operations.claimWork(f.account, op.id); assert.ok(lease);
      await f.operations.stageResult(f.account, op.id, lease.token, delivery());
      await store.apply(refund(p));
      f.setTime("2026-10-03T12:01:30Z");
      let calls = 0;
      const run = createAiRunner(f.operations, { prepare: async () => 1, execute: async () => { calls++; return delivery(); } });
      assert.equal(await run(f.account, op.id), "released"); assert.equal(calls, 0);
      const balance = await f.wallet.readWallet(f.account);
      assert.equal(balance.available, 0); assert.equal(balance.reserved, 0); assert.equal(balance.reconciliationRequired, false);
      assert.equal((await f.operations.read(f.account, op.id)).result, null);
    });
    await t.test("service compensation and store refund share original lots without returning money twice", async () => {
      const f = await fixture(0), p = purchase(f.account.userId);
      await store.apply(p); const { op } = await included(f);
      await store.apply(refund(p));
      const run = createFulfillmentRunner(f.fulfillments, async () => ({}));
      await run(f.account, op.id); f.setTime("2026-10-03T12:02:00Z"); await run(f.account, op.id);
      f.setTime("2026-10-03T12:04:00Z"); assert.equal(await run(f.account, op.id), "compensated");
      const balance = await f.wallet.readWallet(f.account);
      assert.equal(balance.available, 0); assert.equal(balance.reconciliationRequired, false);
      await store.apply(reverse(p)); assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
    });
    await t.test("partial refunds use signed milliunits and withdrawals never touch another pack", async () => {
      const f = await fixture(0), p = purchase(f.account.userId);
      await store.apply(p); await store.apply(purchase(f.account.userId));
      await store.apply(refund(p, 40000)); assert.equal((await f.wallet.readWallet(f.account)).available, 1600);
      await store.apply({ ...refund(p, 50000), signedAt: p.signedAt + 1500 });
      assert.equal((await f.wallet.readWallet(f.account)).available, 1500);
      await store.apply(reverse(p)); assert.equal((await f.wallet.readWallet(f.account)).available, 2000);
    });
    await t.test("verified notification inbox deduplicates, processes out of order and keeps unknown accounts", async () => {
      const f = await fixture(0), p = purchase(f.account.userId), id = randomUUID();
      const payload = { snapshot: refund(p), notificationType: "REFUND" };
      await Promise.all(Array.from({ length: 10 }, () => store.receive("sandbox", id, payload)));
      await assert.rejects(store.receive("sandbox", id, { ...payload, snapshot: { ...payload.snapshot, quantity: 2 } }), { message: "purchase_identity_conflict" });
      await Promise.all(Array.from({ length: 10 }, () => store.process("sandbox", id)));
      assert.equal((await f.wallet.readWallet(f.account)).available, 0);
      const reversedId = randomUUID(); await store.receive("sandbox", reversedId, { snapshot: reverse(p), notificationType: "REFUND_REVERSED" });
      await store.process("sandbox", reversedId); assert.equal((await f.wallet.readWallet(f.account)).available, 1000);
      const missingId = randomUUID();
      await store.receive("sandbox", missingId, { snapshot: refund(purchase(randomUUID())), notificationType: "REFUND" });
      await assert.rejects(store.process("sandbox", missingId));
      const [saved] = await sql`SELECT state, attempts FROM credit_store_notifications WHERE notification_id = ${missingId}`;
      assert.equal(saved.state, "pending"); assert.equal(saved.attempts, 1);
    });
    await t.test("a consumption request persists without granting or refunding points", async () => {
      const f = await fixture(0), p = purchase(f.account.userId), id = randomUUID();
      await store.receive("sandbox", id, { snapshot: p, notificationType: "CONSUMPTION_REQUEST" });
      assert.equal(await store.process("sandbox", id), "ignored");
      assert.equal((await f.wallet.readWallet(f.account)).available, 0);
    });
    await t.test("store transaction, lot, ledger and notification acknowledgement roll back together", async () => {
      const f = await fixture(0), p = purchase(f.account.userId), id = randomUUID();
      await store.receive("sandbox", id, { snapshot: refund(p), notificationType: "REFUND" });
      await sql.unsafe(`CREATE OR REPLACE FUNCTION fail_store_ledger() RETURNS trigger AS $$ BEGIN
        IF NEW.kind = 'refund' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await sql.unsafe("CREATE TRIGGER fail_store BEFORE INSERT ON credit_ledger FOR EACH ROW EXECUTE FUNCTION fail_store_ledger()");
      try {
        await assert.rejects(store.process("sandbox", id));
        const [rows] = await sql`SELECT count(*)::int AS total FROM credit_store_transactions WHERE user_id = ${f.account.userId}`;
        assert.equal(rows.total, 0); assert.equal((await f.wallet.readWallet(f.account)).available, 0);
        const [saved] = await sql`SELECT state FROM credit_store_notifications WHERE notification_id = ${id}`;
        assert.equal(saved.state, "pending");
      } finally { await sql.unsafe("DROP TRIGGER fail_store ON credit_ledger"); await sql.unsafe("DROP FUNCTION fail_store_ledger()"); }
      await store.process("sandbox", id);
      assert.equal((await f.wallet.readWallet(f.account)).available, 0);
    });

    await t.test("credit cohort blocks legacy while paused; new tables have RLS", async () => {
      const f = await fixture();
      const config = creditConfig({ AI_CREDITS_MODE: "off", AI_CREDITS_ENVIRONMENT: "sandbox" });
      assert.equal(await isCreditAccount(sql, f.account.userId, config), true);
      const tables = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${[...AI_OPERATION_TABLES]})`;
      assert.equal(tables.length, AI_OPERATION_TABLES.length);
      assert.ok(tables.every(table => table.relrowsecurity));
      await sql.unsafe("DO $$ BEGIN CREATE ROLE ai_test_client; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
      await sql.unsafe(`GRANT SELECT ON ${AI_OPERATION_TABLES.join(",")} TO ai_test_client`);
      await sql.begin(async tx => {
        await tx.unsafe("SET LOCAL ROLE ai_test_client");
        for (const table of AI_OPERATION_TABLES) {
          assert.equal((await tx.unsafe(`SELECT * FROM ${table}`)).length, 0);
        }
      });
    });
    await t.test("operations report counts retry cost separately by environment and leaves the ledger untouched", async () => {
      const [attempt] = await sql`SELECT operation_id,attempt,started_at FROM ai_operation_attempts ORDER BY started_at DESC LIMIT 1`;
      await sql`UPDATE ai_operation_attempts SET usage=${sql.json({ estimatedCostUsd: 0.25 })}
        WHERE operation_id=${attempt.operation_id} AND attempt=${attempt.attempt}`;
      const [before] = await sql`SELECT count(*)::int AS count,coalesce(sum(amount),0)::text AS sum FROM credit_ledger`;
      const report = await creditOperationsReport(sql,new Date(attempt.started_at.getTime()+1000),0.2);
      const sandbox = report.environments.find(row => row.environment === "sandbox")!;
      const production = report.environments.find(row => row.environment === "production")!;
      assert.ok(sandbox.estimated_cost_usd >= 0.25);
      assert.ok(sandbox.attempts_without_cost > 0);
      assert.equal(sandbox.alert,true); assert.equal(production.estimated_cost_usd,0);
      const [after] = await sql`SELECT count(*)::int AS count,coalesce(sum(amount),0)::text AS sum FROM credit_ledger`;
      assert.deepEqual(after,before);
    });
  } finally { await sql.end(); }
});
