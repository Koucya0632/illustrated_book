import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createAdminCreditGrantsHandler } from "../lib/credits/admin-grants-http";
import { adminGrantInput, type createAdminCreditGrants } from "../lib/credits/admin-grants";
import { CreditError } from "../lib/credits/policy";

const user = randomUUID(), body = { requestKey: randomUUID(), amount: 1000, reason: "辨識補償" };
function setup(authorized = true, fail = false) {
  const calls: unknown[] = [];
  const handler = createAdminCreditGrantsHandler({ authorized: async () => authorized, environment: () => "production",
    grants: () => ({ read: async (a: unknown) => { calls.push(a); return { available: "0", reserved: "0", grants: [] }; },
      grant: async (a: unknown, raw: unknown, actor: unknown) => {
        if (!adminGrantInput.safeParse(raw).success) throw new CreditError("invalid_credit_request");
        if (fail) throw new Error("private database detail");
        calls.push({ account: a, body: raw, actor }); return { granted: true, amount: 1000 };
      } }) as unknown as ReturnType<typeof createAdminCreditGrants>, reportError: () => calls.push("reported") });
  return { handler, calls };
}
test("credit gifting rejects unauthorized access and cross-site requests before any database access", async () => {
  const no = setup(false);
  for (const method of ["GET", "POST"]) {
    assert.equal((await no.handler(new Request("https://tuji.test/api/admin/grants", { method }), user)).status, 401);
  }
  assert.equal(no.calls.length, 0);
  const yes = setup();
  const deniedHeaders: Record<string, string>[] = [{ origin: "https://evil.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of deniedHeaders) {
    assert.equal((await yes.handler(new Request("https://tuji.test/api/admin/grants", {
      method: "POST", headers, body: JSON.stringify(body),
    }), user)).status, 403);
  }
  assert.equal(yes.calls.length, 0);
});
test("gifting uses server identity and environment and rejects payload overrides", async () => {
  const { handler, calls } = setup();
  const response = await handler(new Request("https://tuji.test/api/admin/grants?environment=sandbox", {
    method: "POST", body: JSON.stringify(body),
  }), user);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls[0], { account: { userId: user, environment: "production" }, body, actor: "admin" });
  for (const override of [{ actor: "other" }, { environment: "sandbox" }, { userId: randomUUID() }, { source: "purchase" }]) {
    assert.equal((await handler(new Request("https://tuji.test/api/admin/grants", {
      method: "POST", body: JSON.stringify({ ...body, ...override }),
    }), user)).status, 400);
  }
  assert.equal(calls.length, 1);
});
test("gifting rejects invalid quantities, reasons, identifiers, large bodies and hides internal errors", async () => {
  const { handler, calls } = setup();
  const invalid = ["{", "x".repeat(4097), ...[0, -1, 1.5, "1000", 2147483648].map(amount => JSON.stringify({ ...body, amount })),
    JSON.stringify({ ...body, reason: " " }), JSON.stringify({ ...body, reason: "x".repeat(501) })];
  for (const raw of invalid) {
    assert.equal((await handler(new Request("https://tuji.test/api/admin/grants", { method: "POST", body: raw }), user)).status, 400);
  }
  assert.equal((await handler(new Request("https://tuji.test/api/admin/grants"), "bad")).status, 400);
  assert.equal(calls.length, 0);
  const failure = setup(true, true);
  const response = await failure.handler(new Request("https://tuji.test/api/admin/grants", { method: "POST", body: JSON.stringify(body) }), user);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "credits_unavailable" });
});
