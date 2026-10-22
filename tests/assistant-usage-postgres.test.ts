import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { migrateCreditSchema } from "../lib/credits/schema";
import { ASSISTANT_TABLES, migrateAssistantSchema } from "../lib/assistant/schema";
import { createAssistantUsageLog } from "../lib/assistant/usage";
import { realisedMarkupReport } from "../lib/credits/markup-report";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;

test("assistant usage against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  // Never substitute DATABASE_URL.
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const sql = postgres(databaseUrl!, { max: 5, onnotice: () => {} });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS auth`;
    await sql`CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY)`;
    await migrateCreditSchema(sql);
    // Production's table predates 0018: the migration must bring that shape over, keeping its rows.
    await sql`DROP TABLE IF EXISTS assistant_usage`;
    await sql.unsafe(`CREATE TABLE assistant_usage (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, request_id UUID NOT NULL, user_id UUID NOT NULL,
      environment TEXT NOT NULL, model TEXT NOT NULL, in_scope BOOLEAN NOT NULL, input_tokens INT NOT NULL,
      output_tokens INT NOT NULL, cache_read_tokens INT NOT NULL DEFAULT 0, cache_write_tokens INT NOT NULL DEFAULT 0,
      estimated_cost_usd NUMERIC(12, 6) NOT NULL, points_charged INT NOT NULL, pricing_version TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE)`);
    await migrateAssistantSchema(sql);
    // The same migration must be safe to run a second time.
    await migrateAssistantSchema(sql);
    const [fk] = await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'assistant_usage'::regclass AND contype = 'f'`;
    assert.match(fk.def, /ON DELETE SET NULL \(user_id\)/);

    const userId = randomUUID();
    await sql`INSERT INTO auth.users (id) VALUES (${userId})`;
    await sql`INSERT INTO credit_accounts (user_id, environment) VALUES (${userId}, 'sandbox')`;
    const account = { userId, environment: "sandbox" as const };
    const at = new Date("2026-10-12T12:00:00.000Z");
    const record = createAssistantUsageLog(sql, () => at);

    await t.test("a row carries the tokens, the cost and the charge", async () => {
      const requestId = randomUUID();
      await record({ account, requestId, inScope: true, usage: { inputTokens: 2000, outputTokens: 300 }, charged: 2 });
      const [row] = await sql`SELECT * FROM assistant_usage WHERE request_id = ${requestId}`;
      assert.equal(row.model, "claude-haiku-5-5");
      assert.equal(row.in_scope, true);
      assert.equal(row.input_tokens, 2000);
      assert.equal(row.output_tokens, 300);
      assert.equal(row.cache_read_tokens, 0);
      assert.equal(row.estimated_cost_usd, "0.000350");
      assert.equal(row.points_charged, 2);
      assert.equal(row.pricing_version, "assistant-2026-10");
      assert.equal(row.feature, "ask");
      assert.equal(row.created_at.toISOString(), at.toISOString());
    });

    await t.test("a story row carries its feature and its own price list", async () => {
      const requestId = randomUUID();
      await record({ account, requestId, feature: "story", pricingVersion: "assistant-story-2026-10",
        inScope: true, usage: { inputTokens: 1800, outputTokens: 1000 }, charged: 3 });
      const [row] = await sql`SELECT feature, pricing_version FROM assistant_usage WHERE request_id = ${requestId}`;
      assert.deepEqual([row.feature, row.pricing_version], ["story", "assistant-story-2026-10"]);
      await assert.rejects(record({ account, requestId, feature: "other" as "story",
        inScope: true, usage: { inputTokens: 1, outputTokens: 1 }, charged: 0 }));
    });

    await t.test("a resend under the same request id is a second row: the model ran twice", async () => {
      const requestId = randomUUID();
      const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10 };
      await record({ account, requestId, inScope: true, usage, charged: 1 });
      await record({ account, requestId, inScope: true, usage, charged: 0 });
      const rows = await sql`SELECT points_charged, cache_read_tokens, cache_write_tokens
        FROM assistant_usage WHERE request_id = ${requestId} ORDER BY id`;
      assert.deepEqual(rows.map(row => row.points_charged), [1, 0]);
      assert.deepEqual([rows[0].cache_read_tokens, rows[0].cache_write_tokens], [50, 10]);
    });

    await t.test("usage belongs to a credit account and outlives it, tied to no one", async () => {
      const stranger = { userId: randomUUID(), environment: "sandbox" as const };
      await assert.rejects(record({ account: stranger, requestId: randomUUID(), inScope: true,
        usage: { inputTokens: 1, outputTokens: 1 }, charged: 1 }));
      const [{ count: before }] = await sql`SELECT count(*)::int FROM assistant_usage WHERE user_id = ${userId}`;
      assert.ok(before > 0);
      // Account deletion removes auth.users, which cascades to the credit account.
      await sql`DELETE FROM auth.users WHERE id = ${userId}`;
      const [{ count: linked }] = await sql`SELECT count(*)::int FROM assistant_usage WHERE user_id = ${userId}`;
      assert.equal(linked, 0);
      const [{ count: kept }] = await sql`SELECT count(*)::int FROM assistant_usage
        WHERE user_id IS NULL AND environment = 'sandbox' AND created_at = ${at}`;
      assert.equal(kept, before);
    });

    await t.test("實際倍率 counts uncharged runs, judges from 50 runs, and keeps 拍照做卡 out of the month's 助手 cost", async () => {
      const owner = randomUUID();
      await sql`INSERT INTO auth.users (id) VALUES (${owner})`;
      await sql`INSERT INTO credit_accounts (user_id, environment) VALUES (${owner}, 'production')`;
      const now = new Date("2026-11-20T00:00:00Z");
      const row = (feature: string, version: string, cost: number, points: number, createdAt = new Date("2026-11-10T00:00:00Z")) =>
        sql`INSERT INTO assistant_usage (request_id, user_id, environment, feature, model, in_scope, input_tokens,
          output_tokens, estimated_cost_usd, points_charged, pricing_version, created_at)
          VALUES (${randomUUID()}, ${owner}, 'production', ${feature}, 'm', true, 0, 0, ${cost}, ${points}, ${version}, ${createdAt})`;
      // 50 story runs: 40 charged 3 points at 0.0007 cost, 10 uncharged at the same cost → 120×0.0007 / 0.035 = 2.4×.
      for (let i = 0; i < 40; i++) await row("story", "s1", 0.0007, 3);
      for (let i = 0; i < 10; i++) await row("story", "s1", 0.0007, 0);
      for (let i = 0; i < 49; i++) await row("chat", "c1", 0.0001, 1);
      await row("capture", "p1", 0.005, 100);
      await row("chat", "c1", 1, 1000, new Date("2026-10-01T00:00:00Z"));
      const report = await realisedMarkupReport(sql, now);
      const story = report.rows.find(r => r.feature === "story")!;
      assert.equal(story.runs, 50); assert.equal(story.unchargedRuns, 10);
      assert.ok(Math.abs(story.markup! - 2.4) < 1e-9); assert.equal(story.verdict, "below");
      const chat = report.rows.find(r => r.feature === "chat")!;
      assert.equal(chat.runs, 49); assert.equal(chat.verdict, "too_few");
      assert.ok(Math.abs(report.rows.find(r => r.feature === "capture")!.markup! - 14) < 1e-9);
      // November so far: 50×0.0007 + 49×0.0001; the October row and the capture row are not in it.
      assert.ok(Math.abs(report.assistantMonthCostUsd - 0.0399) < 1e-9);
    });

    await t.test("the table is closed to clients", async () => {
      const tables = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${[...ASSISTANT_TABLES]})`;
      assert.equal(tables.length, ASSISTANT_TABLES.length);
      assert.ok(tables.every(table => table.relrowsecurity));
      const policies = await sql`SELECT 1 FROM pg_policies WHERE tablename = ANY(${[...ASSISTANT_TABLES]})`;
      assert.equal(policies.length, 0);
    });
  } finally {
    await sql.end();
  }
});
