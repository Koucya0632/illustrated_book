import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRefundReviewHandler } from "../lib/credits/refund-review-http";
import { refundResolutionInput, RefundReviewError, type createRefundReview } from "../lib/credits/refund-review";

const user = randomUUID(), body = { requestKey: randomUUID(), transactionId: "123", expectedEventAt: "2026-10-05T00:00:00.000Z",
  expectedRefundPoints: 1000, expectedConsumedPoints: 100, reason: "已人工處理" };
function setup(authorized = true, fail = false) {
  const calls: unknown[] = [];
  const handler = createRefundReviewHandler({ authorized: async () => authorized, environment: () => "production",
    review: () => ({ readCases: async (a: unknown) => { calls.push(a); return []; },
      resolve: async (a: unknown, raw: unknown, actor: unknown) => {
        if (!refundResolutionInput.safeParse(raw).success) throw new RefundReviewError("invalid_request");
        if (fail) throw new Error("private database detail");
        calls.push({ account: a, body: raw, actor }); return { resolved: true, duplicate: false, points: 100 };
      } }) as unknown as ReturnType<typeof createRefundReview>, reportError: () => calls.push("reported") });
  return { handler, calls };
}
test("refund admin API rejects unauthenticated access and cross-site writes before reading refund records", async () => {
  const no = setup(false);
  assert.equal((await no.handler(new Request("https://tuji.test/api/admin/refunds"),user)).status,401);
  assert.equal(no.calls.length,0);
  const yes = setup();
  const deniedHeaders: Record<string, string>[] = [{ origin: "https://evil.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of deniedHeaders) {
    assert.equal((await yes.handler(new Request("https://tuji.test/api/admin/refunds",{method:"POST",headers,body:JSON.stringify(body)}),user)).status,403);
  }
  assert.equal(yes.calls.length,0);
});
test("admin identity and environment come from the server; body cannot override them", async () => {
  const {handler,calls}=setup();
  const request=new Request("https://tuji.test/api/admin/refunds?environment=sandbox",{method:"POST",body:JSON.stringify(body)});
  const response=await handler(request,user);
  assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(calls[0],{account:{userId:user,environment:"production"},body,actor:"admin"});
  for(const override of [{actor:"someone"},{environment:"sandbox"},{amount:9999},{userId:randomUUID()}]){
    assert.equal((await handler(new Request("https://tuji.test/api/admin/refunds",{method:"POST",body:JSON.stringify({...body,...override})}),user)).status,400);
  }
  assert.equal(calls.length,1);
});
test("refund API bounds bodies, rejects malformed identifiers and never exposes database errors", async () => {
  const {handler,calls}=setup();
  for(const raw of ["{",JSON.stringify({...body,reason:" "}),"x".repeat(4097)]){
    assert.equal((await handler(new Request("https://tuji.test/api/admin/refunds",{method:"POST",body:raw}),user)).status,400);
  }
  assert.equal((await handler(new Request("https://tuji.test/api/admin/refunds"),"bad")).status,400);
  assert.equal(calls.length,0);
  const failure=setup(true,true);
  const response=await failure.handler(new Request("https://tuji.test/api/admin/refunds",{method:"POST",body:JSON.stringify(body)}),user);
  assert.equal(response.status,503); assert.deepEqual(await response.json(),{error:"credits_unavailable"});
});
