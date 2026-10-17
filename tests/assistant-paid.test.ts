import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { creditConfig, CreditError } from "../lib/credits/policy";
import type { CreditBalance, CreditTransaction } from "../lib/credits/wallet";
import { AssistantError } from "../lib/assistant/contracts";
import { createPaidHandler } from "../lib/assistant/paid";
import { assistantCostUsd, usagePoints } from "../lib/assistant/pricing";
import type { AssistantUsageRecord } from "../lib/assistant/usage";

// The rules every paid 助手 step shares (lib/assistant/paid.ts), exercised
// through a minimal step. Each step's own behaviour is tested in its own file.

// --- pricing ---------------------------------------------------------------

const pricePoints = (usage: Parameters<typeof usagePoints>[0]) => usagePoints(usage, { minPoints: 1, maxPoints: 5 });

test("a typical result costs two points at three times cost", () => {
  const usage = { inputTokens: 2000, outputTokens: 300 };
  assert.equal(Math.round(assistantCostUsd(usage) * 1e6), 350);
  assert.equal(pricePoints(usage), 2);
});

test("points stay between the floor and the ceiling whatever the tokens", () => {
  assert.equal(pricePoints({ inputTokens: 0, outputTokens: 0 }), 1);
  assert.equal(pricePoints({ inputTokens: 10, outputTokens: 5 }), 1);
  assert.equal(pricePoints({ inputTokens: 90_000, outputTokens: 2048 }), 5);
  assert.equal(pricePoints({ inputTokens: Number.NaN, outputTokens: 1 }), 5);
});

test("more tokens never cost fewer points", () => {
  let previous = 0;
  for (let output = 0; output <= 3000; output += 100) {
    const points = pricePoints({ inputTokens: 1500, outputTokens: output });
    assert.ok(points >= previous);
    previous = points;
  }
});

test("cached input is priced below fresh input", () => {
  const fresh = assistantCostUsd({ inputTokens: 1000, outputTokens: 0 });
  const cached = assistantCostUsd({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1000 });
  assert.ok(cached < fresh);
});

// --- handler ---------------------------------------------------------------

const balance = (available: number, extra: Partial<CreditBalance> = {}) =>
  ({ available, reconciliationRequired: false, ...extra }) as CreditBalance;

interface Reply { answer: string; inScope: boolean; usage: { inputTokens: number; outputTokens: number } }

interface Options {
  user?: string | null; mode?: string; enabled?: boolean; available?: number; enrolled?: boolean;
  reply?: Partial<Reply>; askFails?: Error; limited?: boolean; chargeFails?: CreditError;
  reconciliation?: boolean; recordFails?: boolean;
}

interface Body { requestId: string; question: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object") return null;
  const { requestId, question, ...extra } = raw as Record<string, unknown>;
  if (Object.keys(extra).length || typeof requestId !== "string" || !UUID.test(requestId)) return null;
  if (typeof question !== "string" || !question.trim() || question.length > 500) return null;
  return { requestId: requestId.toLowerCase(), question };
}

function setup(options: Options = {}) {
  const asked: Body[] = [];
  const charges: Array<{ key: string; points: number }> = [];
  const records: AssistantUsageRecord[] = [];
  let available = options.available ?? 100;
  const handler = createPaidHandler<Body>({
    currentUserId: async () => options.user === undefined ? "server-user" : options.user,
    config: () => creditConfig({ AI_CREDITS_MODE: options.mode ?? "live", AI_CREDITS_ENVIRONMENT: "sandbox" }),
    enabled: () => options.enabled ?? true,
    wallet: () => ({
      readWallet: async () => {
        if (options.enrolled === false) throw new CreditError("credits_not_enrolled");
        return balance(available, { reconciliationRequired: options.reconciliation ?? false });
      },
      transact: async (_account, run) => {
        let reserved: { key: string; points: number } | undefined;
        return run({
          reserve: async (key: string, points: number) => {
            if (options.chargeFails) throw options.chargeFails;
            reserved = { key, points };
            return { operationKey: key, amount: points, state: "reserved" };
          },
          settle: async (key: string) => {
            charges.push(reserved!);
            available -= reserved!.points;
            return { operationKey: key, amount: reserved!.points, state: "committed", wallet: balance(available) };
          },
        } as unknown as CreditTransaction);
      },
    }),
    rateLimit: async () => { if (options.limited) throw new AssistantError("rate_limited", 30); },
    record: async entry => {
      if (options.recordFails) throw new Error("private database details");
      records.push(entry);
    },
    reportError: () => {},
  }, {
    feature: "story",
    pricingVersion: "test-pricing",
    pricing: { minPoints: 1, maxPoints: 5 },
    maxBodyBytes: 4096,
    parse,
    chargeKey: requestId => `test:${requestId}`,
    produce: async body => {
      asked.push(body);
      if (options.askFails) throw options.askFails;
      const reply: Reply = { answer: "答案", inScope: true, usage: { inputTokens: 2000, outputTokens: 300 }, ...options.reply };
      return {
        usage: reply.usage, billable: reply.inScope, points: pricePoints(reply.usage),
        body: { answer: reply.answer, inScope: reply.inScope },
      };
    },
  });
  return { handler, asked, charges, records };
}

const question = (data: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  new Request("https://tuji.test/api/assistant/test", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ requestId: randomUUID(), question: "蘋果和梨差在哪？", ...data }),
  });
const offer = () => new Request("https://tuji.test/api/assistant/test");

test("nothing is asked or charged for a caller who is signed out, off, or not enrolled", async () => {
  for (const [options, status] of [
    [{ user: null }, 401], [{ mode: "off" }, 404], [{ mode: "shadow" }, 404], [{ enabled: false }, 404],
    [{ enrolled: false }, 403],
  ] as Array<[Options, number]>) {
    const { handler, asked, charges } = setup(options);
    assert.equal((await handler(question(), "run")).status, status);
    assert.equal((await handler(offer(), "offer")).status, status);
    assert.equal(asked.length, 0);
    assert.equal(charges.length, 0);
  }
});

test("the offer states the price range and the balance without asking the model", async () => {
  const { handler, asked } = setup({ available: 42 });
  const response = await handler(offer(), "offer");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { minPoints: 1, maxPoints: 5, available: 42 });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(asked.length, 0);
});

test("a billable result is charged by its tokens, once, under the request id", async () => {
  const { handler, charges, records } = setup({ available: 100 });
  const requestId = randomUUID();
  const response = await handler(question({ requestId }), "run");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: "答案", inScope: true, charged: 2, available: 98, minPoints: 1, maxPoints: 5,
  });
  assert.deepEqual(charges, [{ key: `test:${requestId}`, points: 2 }]);
  assert.deepEqual(records, [{
    account: { userId: "server-user", environment: "sandbox" }, requestId, feature: "story",
    pricingVersion: "test-pricing", inScope: true, usage: { inputTokens: 2000, outputTokens: 300 }, charged: 2,
  }]);
});

test("a result that is not billable is returned and costs nothing", async () => {
  const { handler, charges } = setup({ reply: { inScope: false, answer: "我只能幫忙語言學習。" } });
  const body = await (await handler(question(), "run")).json();
  assert.equal(body.inScope, false);
  assert.equal(body.charged, 0);
  assert.equal(body.available, 100);
  assert.equal(charges.length, 0);
});

test("an answer that cost nothing is still recorded: it cost the same to produce", async () => {
  const { handler, records } = setup({ reply: { inScope: false } });
  await handler(question(), "run");
  assert.equal(records.length, 1);
  assert.equal(records[0].inScope, false);
  assert.equal(records[0].charged, 0);
});

test("a failed usage write does not take the answer away", async () => {
  const { handler, charges } = setup({ recordFails: true });
  const response = await handler(question(), "run");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, "答案");
  assert.equal(body.charged, 2);
  assert.equal(charges.length, 1);
});

test("nothing is recorded when the model was never reached", async () => {
  for (const options of [{ available: 4 }, { limited: true }, { askFails: new AssistantError("assistant_unavailable") }]) {
    const { handler, records } = setup(options);
    await handler(question(), "run");
    assert.equal(records.length, 0);
  }
});

test("fewer points than the ceiling refuses before the model is called", async () => {
  const { handler, asked } = setup({ available: 4 });
  const response = await handler(question(), "run");
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "insufficient_credits", minPoints: 1, maxPoints: 5 });
  assert.equal(asked.length, 0);
});

test("a wallet under refund review refuses before the model is called", async () => {
  const { handler, asked } = setup({ reconciliation: true });
  assert.equal((await handler(question(), "run")).status, 503);
  assert.equal(asked.length, 0);
});

test("a rate-limited caller is told when to retry and is not charged", async () => {
  const { handler, asked, charges } = setup({ limited: true });
  const response = await handler(question(), "run");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.equal(asked.length + charges.length, 0);
});

test("a failed model call charges nothing", async () => {
  for (const [error, status] of [
    [new AssistantError("assistant_unavailable"), 503], [new AssistantError("rate_limited"), 429],
    [new Error("private upstream details"), 503],
  ] as Array<[Error, number]>) {
    const { handler, charges } = setup({ askFails: error });
    const response = await handler(question(), "run");
    assert.equal(response.status, status);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private/);
    assert.equal(charges.length, 0);
  }
});

test("an answer survives a charge that lost a race or was already made", async () => {
  for (const code of ["insufficient_credits", "idempotency_conflict"] as const) {
    const { handler } = setup({ chargeFails: new CreditError(code) });
    const response = await handler(question(), "run");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.answer, "答案");
    assert.equal(body.charged, 0);
  }
});

test("a wallet failure during the charge is not swallowed", async () => {
  const { handler } = setup({ chargeFails: new CreditError("credits_unavailable") });
  assert.equal((await handler(question(), "run")).status, 503);
});

test("malformed requests are rejected before the model is called", async () => {
  for (const data of [
    { question: "" }, { question: "x".repeat(501) }, { requestId: "not-a-uuid" }, { extra: true },
  ]) {
    const { handler, asked } = setup();
    assert.equal((await handler(question(data), "run")).status, 400, JSON.stringify(data));
    assert.equal(asked.length, 0);
  }
});

test("a cross-site question is refused", async () => {
  const { handler, asked } = setup();
  assert.equal((await handler(question({}, { "sec-fetch-site": "cross-site" }), "run")).status, 403);
  assert.equal((await handler(question({}, { origin: "https://evil.test" }), "run")).status, 403);
  assert.equal(asked.length, 0);
});
