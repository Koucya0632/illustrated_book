// Pins the two-source union rule in lib/atlas/entitlement.ts.
//
// THE RED LINE: a manual grant and an App Store subscription must never be able
// to shorten or erase each other. They used to share one row, which meant:
//   - compensating a paying subscriber overwrote their real expiry with the
//     compensation date — sometimes moving it EARLIER; and
//   - Apple's next renewal notification then overwrote the compensation away.
// Both failures were silent. These tests exist so the union rule cannot quietly
// regress back into "last writer wins".
//
// The rule under test is pure (resolveEntitlement), which is why it was split
// out of the query — this is the logic that decides whether a paying customer
// keeps the access they bought.

import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntitlement } from "../lib/atlas/entitlement";

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

test("no subscription and no grant is free", () => {
  const e = resolveEntitlement({
    sub_tier: null,
    sub_expires_at: null,
    grant_expires_at: null,
  });
  assert.equal(e.tier, "free");
  assert.equal(e.expiresAt, null);
});

test("a missing row (never had an entitlement) is free, not a crash", () => {
  assert.equal(resolveEntitlement(null).tier, "free");
});

test("a live subscription alone is Pro", () => {
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: future(20),
    grant_expires_at: null,
  });
  assert.equal(e.tier, "pro");
  assert.equal(e.grantExpiresAt, null);
});

test("a live grant alone is Pro even with no subscription row", () => {
  const e = resolveEntitlement({
    sub_tier: null,
    sub_expires_at: null,
    grant_expires_at: future(30),
  });
  assert.equal(e.tier, "pro");
  assert.equal(e.subscriptionExpiresAt, null);
});

test("an expired subscription lapses back to free", () => {
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: past(1),
    grant_expires_at: null,
  });
  assert.equal(e.tier, "free");
  assert.equal(e.expiresAt, null);
  // The lapsed date is still reported, so the admin page can explain WHY.
  assert.notEqual(e.subscriptionExpiresAt, null);
});

test("compensating a subscriber never shortens their subscription", () => {
  // Subscriber paid through day 300; we comp them 30 days for an outage.
  const subscriptionEnd = future(300);
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: subscriptionEnd,
    grant_expires_at: future(30),
  });
  assert.equal(e.tier, "pro");
  assert.equal(
    e.expiresAt,
    subscriptionEnd,
    "the later of the two must win — a short comp must not cut a long subscription",
  );
});

test("a grant outlasting the subscription carries the user past it", () => {
  const grantEnd = future(400);
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: future(10),
    grant_expires_at: grantEnd,
  });
  assert.equal(e.expiresAt, grantEnd);
});

test("a grant survives the subscription lapsing", () => {
  // This is the case Apple's renewal used to erase.
  const grantEnd = future(60);
  const e = resolveEntitlement({
    sub_tier: "free",
    sub_expires_at: past(5),
    grant_expires_at: grantEnd,
  });
  assert.equal(e.tier, "pro");
  assert.equal(e.expiresAt, grantEnd);
});

test("a subscription survives a grant being revoked", () => {
  // Revocation clears grant_expires_at (the query filters revoked rows out).
  const subscriptionEnd = future(90);
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: subscriptionEnd,
    grant_expires_at: null,
  });
  assert.equal(e.tier, "pro", "revoking a comp must never cancel someone's purchase");
  assert.equal(e.expiresAt, subscriptionEnd);
});

test("an unbounded subscription outlasts any dated grant", () => {
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: null,
    grant_expires_at: future(30),
  });
  assert.equal(e.tier, "pro");
  assert.equal(e.expiresAt, null, "null expiry means no expiry, not 'expires now'");
});

test("both sources are reported separately, not merged away", () => {
  // The admin page needs to tell a comped account from a paying one; a single
  // merged date cannot answer that.
  const e = resolveEntitlement({
    sub_tier: "pro",
    sub_expires_at: future(10),
    grant_expires_at: future(20),
  });
  assert.notEqual(e.subscriptionExpiresAt, null);
  assert.notEqual(e.grantExpiresAt, null);
  assert.notEqual(e.subscriptionExpiresAt, e.grantExpiresAt);
});
