import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";
import { createPlayApi, type PlayApi, type ProductPurchase } from "../lib/billing/play";
import { classifyPlayPurchase, PlayPurchaseError } from "../lib/billing/play-purchase";
import { deliverPlayPurchase, sweepPlayVoided, type PlayDeliveryDeps } from "../lib/billing/play-delivery";
import { decideLifetimeWrite } from "../lib/atlas/lifetime-decision";
import { creditGrantKey } from "../lib/credits/store-contracts";

const user = randomUUID();
const ORDER = "GPA.3301-2345-6789-01234";
const purchase = (patch: Partial<ProductPurchase> = {}): ProductPurchase => ({
  purchaseTimeMillis: "1791025200000", purchaseState: 0, consumptionState: 0, acknowledgementState: 0,
  orderId: ORDER, quantity: 1, obfuscatedExternalAccountId: user, ...patch,
});
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof PlayPurchaseError ? e.code : String(e); }
  return "none";
};

test("a Play lifetime order maps to a holding keyed play:<orderId>, bound to the obfuscated account", () => {
  const c = classifyPlayPurchase("app.tuji.lifetime", purchase(), user);
  assert.equal(c.kind, "lifetime");
  if (c.kind !== "lifetime") return;
  assert.equal(c.holding.originalTransactionId, `play:${ORDER}`);
  assert.equal(c.holding.appAccountToken, user);
  assert.equal(c.holding.signedAt.getTime(), 1791025200000);
  assert.equal(c.acknowledged, false);
});

test("a point pack maps to a credit snapshot; a license tester's purchase is sandbox", () => {
  const real = classifyPlayPurchase("app.tuji.credits.4000", purchase(), user);
  const tester = classifyPlayPurchase("app.tuji.credits.4000", purchase({ purchaseType: 0 }), user);
  assert.equal(real.kind === "credits" && real.snapshot.environment, "production");
  assert.equal(tester.kind === "credits" && tester.snapshot.environment, "sandbox");
  assert.equal(real.kind === "credits" && real.snapshot.transactionId, ORDER);
});

test("nothing is granted for a pending, canceled, foreign, unbound, or unknown purchase", () => {
  assert.equal(code(() => classifyPlayPurchase("app.tuji.lifetime", purchase({ purchaseState: 2 }), user)), "purchase_pending");
  assert.equal(code(() => classifyPlayPurchase("app.tuji.lifetime", purchase({ purchaseState: 1 }), user)), "purchase_not_active");
  assert.equal(code(() => classifyPlayPurchase("app.tuji.lifetime", purchase({ obfuscatedExternalAccountId: randomUUID() }), user)), "purchase_account_mismatch");
  assert.equal(code(() => classifyPlayPurchase("app.tuji.lifetime", purchase({ obfuscatedExternalAccountId: undefined }), user)), "purchase_account_mismatch");
  assert.equal(code(() => classifyPlayPurchase("app.tuji.pro.monthly", purchase(), user)), "unsupported_product");
  assert.equal(code(() => classifyPlayPurchase("app.tuji.lifetime", purchase({ orderId: "12345" }), user)), "invalid_purchase");
});

test("a Play order's ledger key cannot collide with an Apple transaction", () => {
  assert.equal(creditGrantKey(ORDER), `play:${ORDER}`);
  assert.equal(creditGrantKey("2000000123"), "apple:2000000123");
});

test("a paid lifetime from either store blocks a second paid one", () => {
  const input = (source: "appstore" | "play") => ({
    userId: user,
    incoming: { transactionId: ORDER, signedAt: new Date(), appAccountToken: user, revoked: false },
    txnRow: null,
    userLive: { source },
  });
  assert.equal(decideLifetimeWrite(input("appstore")).action, "already_owned");
  assert.equal(decideLifetimeWrite(input("play")).action, "already_owned");
});

function fakeApi(p: ProductPurchase, log: string[]): PlayApi {
  return {
    packageName: "app.tuji.android",
    getProductPurchase: async () => p,
    acknowledgeProductPurchase: async () => { log.push("ack"); },
    consumeProductPurchase: async () => { log.push("consume"); },
    listVoidedPurchases: async () => [],
  };
}
const deps = (p: ProductPurchase, log: string[], lifetimeStatus = "insert"): PlayDeliveryDeps => ({
  api: fakeApi(p, log),
  applyLifetime: async () => { log.push("grant"); return { status: lifetimeStatus as never }; },
  applyCredits: async (_u, s) => { log.push("grant"); return { deliveryAck: true, status: "credited", transactionId: s.transactionId, environment: s.environment }; },
});

test("grant first, then acknowledge: a failed grant leaves Google to refund", async () => {
  const log: string[] = [];
  await deliverPlayPurchase(deps(purchase(), log), user, "app.tuji.lifetime", "tok");
  assert.deepEqual(log, ["grant", "ack"]);

  const failing: string[] = [];
  const d = deps(purchase(), failing);
  d.applyLifetime = async () => { throw new Error("db down"); };
  await assert.rejects(deliverPlayPurchase(d, user, "app.tuji.lifetime", "tok"));
  assert.deepEqual(failing, []);
});

test("a duplicate lifetime is never acknowledged, so Google refunds it", async () => {
  const log: string[] = [];
  const r = await deliverPlayPurchase(deps(purchase(), log, "already_owned"), user, "app.tuji.lifetime", "tok");
  assert.deepEqual(log, ["grant"]);
  assert.equal(r.kind === "lifetime" && r.acknowledged, false);
});

test("a re-sent purchase that is already acknowledged or consumed is not acknowledged again", async () => {
  const log: string[] = [];
  await deliverPlayPurchase(deps(purchase({ acknowledgementState: 1 }), log, "duplicate"), user, "app.tuji.lifetime", "tok");
  await deliverPlayPurchase(deps(purchase({ consumptionState: 1 }), log), user, "app.tuji.credits.1000", "tok");
  assert.deepEqual(log, ["grant", "grant"]);
});

test("a point pack is consumed after it is credited", async () => {
  const log: string[] = [];
  await deliverPlayPurchase(deps(purchase(), log), user, "app.tuji.credits.1000", "tok");
  assert.deepEqual(log, ["grant", "consume"]);
});

test("the voided sweep revokes a lifetime, refunds points, and skips what was never granted", async () => {
  const voidedAt = new Date(1791025300000);
  const revoked: unknown[] = [], refunded: unknown[] = [];
  const result = await sweepPlayVoided({
    api: { ...fakeApi(purchase(), []), listVoidedPurchases: async () => [
      { purchaseToken: "a", orderId: "GPA.0000-0000-0000-00001", voidedAt },
      { purchaseToken: "b", orderId: "GPA.0000-0000-0000-00002", voidedAt },
      { purchaseToken: "c", orderId: "GPA.0000-0000-0000-00003", voidedAt },
      { purchaseToken: "d", orderId: null, voidedAt },
    ] },
    findLifetime: async key => key.endsWith("00001") ? { userId: user, productId: "app.tuji.lifetime" } : null,
    applyLifetime: async (_u, h) => { revoked.push(h); return { status: "revoke" }; },
    findCredits: async id => id.endsWith("00002") ? [{ environment: "production", userId: user, productId: "app.tuji.credits.1000", quantity: 1 }] : [],
    refundCredits: async s => { refunded.push(s); },
  }, new Date(0));
  assert.deepEqual(result, { seen: 4, lifetime: 1, credits: 1, unknown: 2, failed: 0 });
  assert.equal((revoked[0] as { revoked: boolean }).revoked, true);
  assert.equal((refunded[0] as { refundFraction: number; signedAt: number }).refundFraction, 100000);
  assert.equal((refunded[0] as { signedAt: number }).signedAt, voidedAt.getTime());
});

test("the API client signs a service-account JWT once and reuses the token", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const calls: string[] = [];
  const api = createPlayApi({
    credentials: JSON.stringify({ client_email: "play@tuji.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
        assert.match(String(init?.body), /assertion=[\w-]+\.[\w-]+\.[\w-]+/);
        return Response.json({ access_token: "at", expires_in: 3600 });
      }
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer at");
      return Response.json(purchase());
    }) as typeof fetch,
  });
  await api.getProductPurchase("app.tuji.lifetime", "t1");
  await api.getProductPurchase("app.tuji.lifetime", "t2");
  assert.equal(calls.filter(u => u.includes("oauth2")).length, 1);
  assert.match(calls[1], /applications\/app\.tuji\.android\/purchases\/products\/app\.tuji\.lifetime\/tokens\/t1$/);
});

test("voided purchases parse Google's real shape, where kind is the resource name", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const api = createPlayApi({
    credentials: JSON.stringify({ client_email: "play@tuji.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }),
    fetchImpl: (async (url: string) => {
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "at", expires_in: 3600 });
      assert.match(String(url), /voidedpurchases\?startTime=\d+&type=0/);
      return Response.json({
        voidedPurchases: [{
          kind: "androidpublisher#voidedPurchase", purchaseToken: "tok", purchaseTimeMillis: "1791025200000",
          voidedTimeMillis: "1791025500000", orderId: "GPA.3301-2345-6789-01234", voidedSource: 2, voidedReason: 0,
        }],
      });
    }) as typeof fetch,
  });
  const voided = await api.listVoidedPurchases(new Date(0));
  assert.deepEqual(voided, [{ purchaseToken: "tok", orderId: "GPA.3301-2345-6789-01234", voidedAt: new Date(1791025500000) }]);
});
