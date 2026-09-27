// Pins how an App Store lifetime (non-consumable) transaction is written
// (docs/MEMBERSHIP_SERVER_DESIGN.md §5, phase 2).
//
// THE RED LINES:
//   - A product we don't recognise is never written anywhere. The old mapper
//     turned every non-Pro product into tier 'free' on the SUBSCRIPTION row, so
//     a lifetime purchase would have downgraded a paying Pro subscriber.
//   - A purchase Apple has charged for is never dropped: a legacy_pro / grant
//     holding is superseded by it, so a later refund still has a row to revoke.
//   - Ordering and account binding reuse the subscription rules (signedDate,
//     appAccountToken — ADR-0005) rather than a second copy of them.

import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransaction } from "../lib/billing/appstore";
import { decideLifetimeWrite, type LifetimeIncoming } from "../lib/atlas/lifetime-decision";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const t0 = new Date("2026-10-01T00:00:00Z");
const later = new Date("2026-10-02T00:00:00Z");
// Apple only counts a revocation that has already happened.
const revokedMs = Date.now() - 60_000;

const incoming = (over: Partial<LifetimeIncoming> = {}): LifetimeIncoming => ({
  transactionId: "tx-1",
  signedAt: t0,
  appAccountToken: USER,
  revoked: false,
  ...over,
});

// ---- classifyTransaction ----

const base = {
  transactionId: "tx-1",
  originalTransactionId: "otx-1",
  signedDate: t0.getTime(),
  appAccountToken: USER,
};

test("a Pro product is a subscription", () => {
  const c = classifyTransaction({ ...base, productId: "app.tuji.pro.monthly", expiresDate: later.getTime() + 9e10 });
  assert.equal(c.kind, "subscription");
});

test("the lifetime product is a lifetime holding, revoked when Apple says so", () => {
  const live = classifyTransaction({ ...base, productId: "app.tuji.lifetime" });
  assert.equal(live.kind, "lifetime");
  assert.equal(live.kind === "lifetime" && live.holding.revoked, false);
  const refunded = classifyTransaction({ ...base, productId: "app.tuji.lifetime", revocationDate: revokedMs });
  assert.equal(refunded.kind === "lifetime" && refunded.holding.revoked, true);
});

test("an unknown product is unknown — never mapped to a free subscription", () => {
  const c = classifyTransaction({ ...base, productId: "app.tuji.something.else" });
  assert.equal(c.kind, "unknown");
});

test("a refunded subscription carries its revocation time", () => {
  const c = classifyTransaction({
    ...base,
    productId: "app.tuji.pro.yearly",
    expiresDate: later.getTime() + 9e10,
    revocationDate: revokedMs,
  });
  assert.equal(c.kind, "subscription");
  if (c.kind === "subscription") {
    assert.equal(c.entitlement.tier, "free");
    assert.equal(c.entitlement.revokedAt?.getTime(), revokedMs);
  }
});

// ---- decideLifetimeWrite ----

test("a first purchase by an account with nothing is inserted", () => {
  assert.deepEqual(decideLifetimeWrite({ userId: USER, incoming: incoming(), txnRow: null, userLive: null }), {
    action: "insert",
    supersede: false,
  });
});

test("a purchase supersedes a legacy_pro or grant holding instead of being dropped", () => {
  for (const source of ["legacy_pro", "grant"] as const) {
    assert.deepEqual(
      decideLifetimeWrite({ userId: USER, incoming: incoming(), txnRow: null, userLive: { source } }),
      { action: "insert", supersede: true },
    );
  }
});

test("a second App Store lifetime for the same account is refused", () => {
  assert.deepEqual(
    decideLifetimeWrite({ userId: USER, incoming: incoming(), txnRow: null, userLive: { source: "appstore" } }),
    { action: "already_owned" },
  );
});

test("an exact replay is a duplicate; an older payload is stale", () => {
  const txnRow = { userId: USER, revoked: false, transactionId: "tx-1", signedAt: t0 };
  assert.equal(decideLifetimeWrite({ userId: USER, incoming: incoming(), txnRow, userLive: { source: "appstore" } }).action, "duplicate");
  const newer = { ...txnRow, signedAt: later };
  assert.equal(
    decideLifetimeWrite({ userId: USER, incoming: incoming({ transactionId: "tx-0" }), txnRow: newer, userLive: { source: "appstore" } }).action,
    "stale",
  );
});

test("a refund revokes the live row", () => {
  const txnRow = { userId: USER, revoked: false, transactionId: "tx-1", signedAt: t0 };
  assert.deepEqual(
    decideLifetimeWrite({
      userId: USER,
      incoming: incoming({ transactionId: "tx-1r", signedAt: later, revoked: true }),
      txnRow,
      userLive: { source: "appstore" },
    }),
    { action: "revoke" },
  );
});

test("a refund for a purchase we never recorded writes nothing", () => {
  assert.deepEqual(
    decideLifetimeWrite({ userId: USER, incoming: incoming({ revoked: true }), txnRow: null, userLive: null }),
    { action: "ignore" },
  );
});

test("a token for another account is refused, and an untokened first claim too", () => {
  assert.equal(
    decideLifetimeWrite({ userId: USER, incoming: incoming({ appAccountToken: OTHER }), txnRow: null, userLive: null }).action,
    "account_mismatch",
  );
  assert.equal(
    decideLifetimeWrite({ userId: USER, incoming: incoming({ appAccountToken: null }), txnRow: null, userLive: null }).action,
    "unbound_legacy",
  );
});

test("a token-proven purchase held by another account moves to this one", () => {
  const txnRow = { userId: OTHER, revoked: false, transactionId: "tx-1", signedAt: t0 };
  assert.deepEqual(
    decideLifetimeWrite({ userId: USER, incoming: incoming({ transactionId: "tx-2", signedAt: later }), txnRow, userLive: null }),
    { action: "transfer", supersede: false },
  );
});

// ---- Both entry points route by product before writing ----
import { readFileSync } from "node:fs";

for (const route of ["verify", "appstore-notifications"]) {
  test(`${route} classifies before it writes, and never maps a transaction straight to the subscription`, () => {
    const src = readFileSync(new URL(`../app/api/billing/${route}/route.ts`, import.meta.url), "utf8");
    assert.ok(src.includes("classifyTransaction("), "must route by product");
    assert.ok(!src.includes("entitlementFromTransaction("), "must not bypass classification");
    assert.ok(
      src.indexOf('kind === "unknown"') < src.indexOf("upsertAtlasEntitlement({"),
      "unknown products must be turned away before the subscription upsert",
    );
    assert.ok(src.includes("revokedAt: entitlement.revokedAt"), "refunds must reach storekit_revoked_at");
  });
}
