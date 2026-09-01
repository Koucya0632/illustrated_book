import assert from "node:assert/strict";
import test from "node:test";
import {
  decideStoreKitBinding,
  decideStoreKitState,
  normalizeStoreKitAccountToken,
} from "../lib/billing/storekit-state";

const older = new Date("2026-01-01T00:00:00.000Z");
const newer = new Date("2026-01-02T00:00:00.000Z");
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("StoreKit state accepts newer state and rejects an older replay", () => {
  const stored = { tier: "free" as const, transactionId: "refund", signedAt: newer };
  assert.equal(
    decideStoreKitState(stored, { tier: "pro", transactionId: "purchase", signedAt: older }),
    "stale",
  );
  assert.equal(
    decideStoreKitState(stored, { tier: "pro", transactionId: "renewal", signedAt: new Date("2026-01-03") }),
    "apply",
  );
});

test("exact StoreKit replay is idempotent and an ambiguous tie cannot upgrade", () => {
  const stored = { tier: "free" as const, transactionId: "refund", signedAt: newer };
  assert.equal(
    decideStoreKitState(stored, { tier: "free", transactionId: "refund", signedAt: newer }),
    "duplicate",
  );
  assert.equal(
    decideStoreKitState(stored, { tier: "pro", transactionId: "other", signedAt: newer }),
    "stale",
  );
});

test("a same-time downgrade is allowed but a same-time upgrade is not", () => {
  const stored = { tier: "pro" as const, transactionId: "purchase", signedAt: newer };
  assert.equal(
    decideStoreKitState(stored, { tier: "free", transactionId: "refund", signedAt: newer }),
    "apply",
  );
});

test("a legacy row without an ordering baseline cannot be upgraded by replay", () => {
  assert.equal(
    decideStoreKitState(
      { tier: "free", transactionId: null, signedAt: null },
      { tier: "pro", transactionId: "old-purchase", signedAt: newer },
    ),
    "stale",
  );
  assert.equal(
    decideStoreKitState(
      { tier: "pro", transactionId: null, signedAt: null },
      { tier: "pro", transactionId: "active-refresh", signedAt: newer },
    ),
    "apply",
  );
});

test("new purchases are bound to appAccountToken", () => {
  assert.equal(
    decideStoreKitBinding({ authenticatedUserId: userA, appAccountToken: userA, existingUserId: userB }),
    "allow",
  );
  assert.equal(
    decideStoreKitBinding({ authenticatedUserId: userB, appAccountToken: userA, existingUserId: userA }),
    "account_mismatch",
  );
});

test("legacy untokened purchases require an existing immutable account binding", () => {
  assert.equal(
    decideStoreKitBinding({ authenticatedUserId: userA, appAccountToken: null, existingUserId: null }),
    "unbound_legacy",
  );
  assert.equal(
    decideStoreKitBinding({ authenticatedUserId: userA, appAccountToken: null, existingUserId: userA }),
    "allow",
  );
  assert.equal(
    decideStoreKitBinding({ authenticatedUserId: userB, appAccountToken: null, existingUserId: userA }),
    "already_bound",
  );
});

test("appAccountToken normalization accepts UUIDs only", () => {
  assert.equal(normalizeStoreKitAccountToken(userA.toUpperCase()), userA);
  assert.equal(normalizeStoreKitAccountToken("not-a-uuid"), null);
});
