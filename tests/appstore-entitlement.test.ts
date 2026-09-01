import assert from "node:assert/strict";
import test from "node:test";
import { entitlementFromTransaction } from "../lib/billing/appstore";

const futureExpiry = Date.now() + 86_400_000;
const signedDate = Date.now();

for (const productId of ["app.tuji.pro.quarterly", "app.tuji.pro.semiannual"]) {
  test(`${productId} grants an active Pro entitlement`, () => {
    const entitlement = entitlementFromTransaction({
      productId,
      transactionId: "transaction-id",
      expiresDate: futureExpiry,
      originalTransactionId: "original-transaction-id",
      signedDate,
      appAccountToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    assert.equal(entitlement.tier, "pro");
    assert.equal(entitlement.source, "appstore");
    assert.equal(entitlement.originalTransactionId, "original-transaction-id");
    assert.equal(entitlement.transactionId, "transaction-id");
    assert.equal(entitlement.signedAt.getTime(), signedDate);
    assert.equal(entitlement.appAccountToken, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
}

test("transactions without identity and ordering fields are rejected", () => {
  assert.throws(
    () => entitlementFromTransaction({ productId: "app.tuji.pro.monthly" }),
    /identity\/order fields required/,
  );
});
