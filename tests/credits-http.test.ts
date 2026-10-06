import assert from "node:assert/strict";
import test from "node:test";
import { createCreditHandler } from "../lib/credits/http";
import { creditConfig } from "../lib/credits/policy";
import type { createCreditWallet } from "../lib/credits/wallet";

function setup(options: { user?: string | null; mode?: string; fail?: boolean; readEnabled?: boolean } = {}) {
  const calls: unknown[] = [];
  const wallet = {
    readWallet: async (account: unknown) => {
      calls.push(account);
      if (options.fail) throw new Error("sensitive database details");
      return { available: 1000 };
    },
    claimBenefit: async (...args: unknown[]) => { calls.push(args); return { amount: 10 }; },
  } as unknown as ReturnType<typeof createCreditWallet>;
  const handler = createCreditHandler({
    currentUserId: async () => options.user === undefined ? "server-user" : options.user,
    config: () => creditConfig({ AI_CREDITS_MODE: options.mode ?? "live", AI_CREDITS_ENVIRONMENT: "sandbox",
      AI_CREDITS_READ_ENABLED: String(options.readEnabled ?? false) }),
    wallet: () => { calls.push("database"); return wallet; }, reportError: () => calls.push("error"),
  });
  return { handler, calls };
}

test("unauthenticated, off and shadow requests never touch the wallet", async () => {
  for (const options of [{ user: null }, { mode: "off" }, { mode: "shadow" }]) {
    const { handler, calls } = setup(options);
    const response = await handler(new Request("https://tuji.test/api/credits/wallet"), "wallet");
    assert.equal(response.status, options.user === null ? 401 : 404);
    assert.equal(calls.length, 0);
  }
});

test("wallet account comes from authentication and server environment", async () => {
  const { handler, calls } = setup();
  const response = await handler(new Request("https://tuji.test/api/credits/wallet?userId=attacker&environment=production"), "wallet");
  assert.equal(response.status, 200);
  assert.deepEqual(calls[1], { userId: "server-user", environment: "sandbox" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("pausing credits can preserve wallet reads while rejecting new benefit claims", async () => {
  const { handler, calls } = setup({ mode: "off", readEnabled: true });
  const response = await handler(new Request("https://tuji.test/api/credits/wallet"), "wallet");
  assert.equal(response.status, 200);
  const before = calls.length;
  const claim = await handler(new Request("https://tuji.test/api/credits/check-in", { method: "POST" }), "check_in");
  assert.equal(claim.status, 404);
  assert.equal(calls.length, before);
});

test("claim ignores client dates and amounts and denies cross-site browser mutations", async () => {
  const { handler, calls } = setup();
  const response = await handler(new Request("https://tuji.test/api/credits/check-in", {
    method: "POST", headers: { origin: "https://tuji.test" }, body: JSON.stringify({ amount: 999999, day: "2099-01-01" }),
  }), "check_in");
  assert.equal(response.status, 200);
  assert.equal((calls[1] as unknown[])[1], "check_in");
  const before = calls.length;
  const deniedHeaders: Record<string, string>[] = [
    { origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" }, { origin: "null" },
  ];
  for (const headers of deniedHeaders) {
    const denied = await handler(new Request("https://tuji.test/api/credits/check-in", { method: "POST", headers }), "check_in");
    assert.equal(denied.status, 403);
  }
  assert.equal(calls.length, before);
});

test("database failures return unavailable and never expose database errors", async () => {
  const { handler } = setup({ fail: true });
  const response = await handler(new Request("https://tuji.test/api/credits/wallet"), "wallet");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "credits_unavailable" });
});
