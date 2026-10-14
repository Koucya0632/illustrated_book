import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { migrateCreditSchema } from "../lib/credits/schema";
import { ASSISTANT_TABLES, migrateAssistantSchema } from "../lib/assistant/schema";
import { createAssistantUsageLog } from "../lib/assistant/usage";

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
    await migrateAssistantSchema(sql);
    // The same migration must be safe to run a second time.
    await migrateAssistantSchema(sql);

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

    await t.test("usage belongs to a credit account and goes when the account does", async () => {
      const stranger = { userId: randomUUID(), environment: "sandbox" as const };
      await assert.rejects(record({ account: stranger, requestId: randomUUID(), inScope: true,
        usage: { inputTokens: 1, outputTokens: 1 }, charged: 1 }));
      await sql`DELETE FROM credit_accounts WHERE user_id = ${userId}`;
      const [{ count }] = await sql`SELECT count(*)::int FROM assistant_usage WHERE user_id = ${userId}`;
      assert.equal(count, 0);
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
