import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxNotificationHandler } from "../lib/credits/sandbox-notifications-http";

test("sandbox notification routing verifies both signatures before selecting the configured review account", async () => {
  const id = "4fca3953-f983-4a80-8d17-d421aa412027", calls: string[] = [];
  let token = id, environment = "Sandbox", valid = true, forwardOk = true;
  const handler = createSandboxNotificationHandler({
    verifyNotification: async () => { calls.push("outer"); if (!valid) throw Error("invalid signature"); return {
      data: { environment, bundleId: "app.tuji.ios", signedTransactionInfo: "inner-jws" },
    }; },
    verifyTransaction: async () => { calls.push("inner"); return { environment, bundleId: "app.tuji.ios", appAccountToken: token }; },
    reviewUsers: () => [id],
    receiveReview: async signed => { assert.equal(signed, "original-jws"); calls.push("review"); return new Response(); },
    forwardTest: async signed => { assert.equal(signed, "original-jws"); calls.push("test"); return new Response(null, { status: forwardOk ? 200 : 503 }); },
  });
  const request = () => new Request("https://api.test/notifications", { method: "POST", body: JSON.stringify({ signedPayload: "original-jws" }) });
  assert.equal((await handler(request())).status, 200); assert.deepEqual(calls.splice(0), ["outer", "inner", "review"]);
  token = "another-account";
  assert.equal((await handler(request())).status, 200); assert.deepEqual(calls.splice(0), ["outer", "inner", "test"]);
  forwardOk = false; assert.equal((await handler(request())).status, 503); calls.splice(0);
  environment = "Production"; assert.equal((await handler(request())).status, 400); assert.deepEqual(calls.splice(0), ["outer"]);
  valid = false; assert.equal((await handler(request())).status, 503); assert.deepEqual(calls, ["outer"]);
});
