import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { creditSnapshot } from "../lib/credits/store-contracts";
import { verifyTransaction, verifyNotification, BillingVerificationError } from "../lib/billing/verifier";

const tx = () => ({ transactionId: "123456", productId: "app.tuji.credits.1000", appAccountToken: randomUUID(),
  environment: "Sandbox", type: "Consumable", quantity: 1, signedDate: 1791025200000 });
test("credit transaction mapper requires signed identity, token, environment, type and quantity", () => {
  assert.equal(creditSnapshot(tx()).environment, "sandbox");
  for (const patch of [{ type: "Non-Consumable" }, { environment: "LocalTesting" }, { quantity: undefined },
    { quantity: 1.5 }, { appAccountToken: undefined }, { transactionId: "sql-string" }, { signedDate: NaN }, { productId: "unknown" }]) {
    assert.throws(() => creditSnapshot({ ...tx(), ...patch }), { message: "invalid_credit_transaction" });
  }
});
test("partial refund milliunits and reversal are validated independently from purchases", () => {
  const t = { ...tx(), revocationDate: 1791025200010, revocationType: "REFUND_PRORATED", revocationPercentage: 40000 };
  assert.equal(creditSnapshot(t).refundFraction, 40000);
  assert.throws(() => creditSnapshot({ ...t, revocationPercentage: 100001 }));
  assert.throws(() => creditSnapshot({ ...t, revocationPercentage: undefined }));
  assert.throws(() => creditSnapshot(t, { type: "REFUND_REVERSED", signedAt: 1791025200020 }));
  assert.equal(creditSnapshot(tx(), { type: "REFUND_REVERSED", signedAt: 1791025200020 }).kind, "reverse");
});
test("strict credit verification rejects decode-only fallback even if development opt-in is true", async () => {
  const previous = process.env.APPSTORE_ALLOW_UNVERIFIED;
  process.env.APPSTORE_ALLOW_UNVERIFIED = "true";
  const signed = (value: unknown) => `e30.${Buffer.from(JSON.stringify(value)).toString("base64url")}.fake`;
  try {
    await assert.rejects(verifyTransaction(signed(tx()), true), BillingVerificationError);
    await assert.rejects(verifyNotification(signed({ data: { environment: "Sandbox" } }), true), BillingVerificationError);
    await assert.rejects(verifyTransaction(signed({ ...tx(), environment: "LocalTesting" }), true));
  } finally {
    if (previous === undefined) delete process.env.APPSTORE_ALLOW_UNVERIFIED; else process.env.APPSTORE_ALLOW_UNVERIFIED = previous;
  }
});
