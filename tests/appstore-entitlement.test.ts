import assert from "node:assert/strict";
import test from "node:test";
import { entitlementFromTransaction } from "../lib/billing/appstore";

const futureExpiry = Date.now() + 86_400_000;

for (const productId of ["app.tuji.pro.quarterly", "app.tuji.pro.semiannual"]) {
  test(`${productId} grants an active Pro entitlement`, () => {
    const entitlement = entitlementFromTransaction({
      productId,
      expiresDate: futureExpiry,
      originalTransactionId: "original-transaction-id",
    });

    assert.equal(entitlement.tier, "pro");
    assert.equal(entitlement.source, "appstore");
    assert.equal(entitlement.originalTransactionId, "original-transaction-id");
  });
}
