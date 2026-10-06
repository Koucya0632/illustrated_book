import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { createAiHandler } from "../lib/ai-operations/http";
import type { AiOperations } from "../lib/ai-operations/service";
import { creditConfig, CreditError } from "../lib/credits/policy";
import { isCreditAccount } from "../lib/credits/legacy-guard";

function setup(options: { mode?: string; user?: string | null; enabled?: boolean; read?: boolean; fail?: boolean; acceptState?: string; fulfillmentState?: string } = {}) {
  const calls: unknown[] = [];
  const dispatched: unknown[] = [];
  const operations = {
    quote: async (...args: unknown[]) => { calls.push(args); return { id: randomUUID(), points: 100 }; },
    accept: async (...args: unknown[]) => { calls.push(args); if (args[3] === false) throw new CreditError("credits_disabled"); return { id: "op-1", state: options.acceptState ?? "reserved" }; },
    read: async (...args: unknown[]) => { calls.push(args); if (options.fail) throw new Error("private database details"); return { state: "committed" }; },
    cancel: async (...args: unknown[]) => { calls.push(args); return { state: "released" }; },
    confirm: async (...args: unknown[]) => { calls.push(args); return { item: {}, operation: { fulfillmentState: options.fulfillmentState ?? "pending" } }; },
  } as unknown as AiOperations;
  const handler = createAiHandler({
    currentUserId: async () => options.user === undefined ? "server-user" : options.user,
    config: () => creditConfig({ AI_CREDITS_MODE: options.mode ?? "live", AI_CREDITS_ENVIRONMENT: "sandbox",
      AI_CREDITS_READ_ENABLED: String(options.read ?? false) }),
    enabled: () => options.enabled ?? true,
    operations: () => operations, reportError: () => {},
    dispatch: (...args) => { dispatched.push(args); },
  });
  return { handler, calls, dispatched };
}
const post = (data: unknown, headers: Record<string, string> = {}) => new Request("https://tuji.test/api/ai/operations", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data),
});

test("AI endpoints reject unauthenticated or disabled new work before database use", async () => {
  for (const options of [{ user: null }, { mode: "off" }, { mode: "shadow" }, { enabled: false }]) {
    const { handler, calls } = setup(options);
    const response = await handler(post({}), "quote");
    assert.equal(response.status, options.user === null ? 401 : 404);
    assert.equal(calls.length, 0);
  }
});

test("acceptance is 202 and takes identity and environment from the server", async () => {
  const { handler, calls } = setup();
  const id = randomUUID();
  const response = await handler(post({ quoteId: id }, { "idempotency-key": "client-operation" }), "accept");
  assert.equal(response.status, 202);
  assert.deepEqual(calls[0], [{ userId: "server-user", environment: "sandbox" }, id, "client-operation", true]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("client amounts, dates, wrong operation IDs, oversized and malformed requests are rejected", async () => {
  const { handler, calls } = setup();
  for (const data of [{ quoteId: randomUUID(), points: 1 }, { quoteId: randomUUID(), userId: "attacker" }, {}, { quoteId: "bad" }]) {
    assert.equal((await handler(post(data), "accept")).status, 400);
  }
  assert.equal((await handler(post({}), "read", "bad")).status, 400);
  assert.equal((await handler(post({ quoteId: randomUUID() }, { "content-length": "5000" }), "accept")).status, 400);
  assert.equal((await handler(new Request("https://tuji.test/api/ai/operations", { method: "POST", body: "{" }), "accept")).status, 400);
  assert.equal(calls.length, 0);
});

test("cross-site mutations are rejected and pause still permits saved result reads and cancellation", async () => {
  const { handler, calls } = setup({ mode: "off", read: true });
  const id = randomUUID();
  assert.equal((await handler(post({}), "read", id)).status, 200);
  assert.equal((await handler(post({}), "cancel", id)).status, 200);
  assert.equal((await handler(post({ quoteId: randomUUID() }), "accept")).status, 404);
  const before = calls.length;
  assert.equal((await handler(post({}, { origin: "https://evil.test" }), "cancel", id)).status, 403);
  assert.equal(calls.length, before);
});

test("oversized chunked AI requests stop reading before database access", async () => {
  const { handler, calls } = setup();
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(5000)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://tuji.test/api/ai/operations", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  assert.equal((await handler(request, "accept")).status, 400);
  assert.equal(cancelled, true);
  assert.equal(calls.length, 0);
});

test("database errors fail closed without exposing connection details", async () => {
  const { handler } = setup({ fail: true });
  const response = await handler(post({}), "read", randomUUID());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "credits_unavailable" });
});

test("legacy fallback requires missing schema and disabled features; database outages are rejected", async () => {
  const off = creditConfig({}), live = creditConfig({ AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "production" });
  assert.equal(await isCreditAccount(null, "user", off), false);
  await assert.rejects(isCreditAccount(null, "user", live), (error: unknown) => error instanceof CreditError && error.code === "credits_unavailable");
  const missing = (async () => { throw { code: "42P01" }; }) as unknown as postgres.Sql;
  assert.equal(await isCreditAccount(missing, "user", off), false);
  await assert.rejects(isCreditAccount(missing, "user", live));
  const unavailable = (async () => { throw { code: "08006" }; }) as unknown as postgres.Sql;
  await assert.rejects(isCreditAccount(unavailable, "user", off));
});

test("new work starts right after the response instead of waiting for the cron tick", async () => {
  const account = { userId: "server-user", environment: "sandbox" };
  const accepted = setup();
  await accepted.handler(post({ quoteId: randomUUID() }, { "idempotency-key": "k" }), "accept");
  assert.deepEqual(accepted.dispatched, [["operation", account, "op-1"]]);

  // A replayed key returns work that is already running or done; nothing new to start.
  const replay = setup({ acceptState: "committed" });
  await replay.handler(post({ quoteId: randomUUID() }, { "idempotency-key": "k" }), "accept");
  assert.deepEqual(replay.dispatched, []);

  const id = randomUUID();
  const confirmed = setup();
  await confirmed.handler(post({ candidateId: randomUUID() }), "confirm", id);
  assert.deepEqual(confirmed.dispatched, [["fulfillment", account, id]]);

  const done = setup({ fulfillmentState: "completed" });
  await done.handler(post({ candidateId: randomUUID() }), "confirm", id);
  assert.deepEqual(done.dispatched, []);
});
