// Pins the three-tier membership rule (docs/MEMBERSHIP_SERVER_DESIGN.md §2–3).
//
// Pro and lifetime are independent sources that are never merged: Pro wins
// while live, lifetime is what's left when Pro ends, and nothing needs to be
// written for that fallback to happen. The 7-day grace is DERIVED from when
// Pro naturally ended, so repeated expiry notifications can't reset it — and a
// refunded subscription or revoked grant never earns one.

import assert from "node:assert/strict";
import test from "node:test";
import { PRO_GRACE_DAYS, resolveMembership, type MembershipSources } from "../lib/atlas/membership";

const NOW = new Date("2026-10-15T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const none: MembershipSources = {
  proLive: false,
  proExpiresAt: null,
  lastNaturalProEndAt: null,
  lifetime: null,
};
const lifetime = { source: "appstore" as const, acquiredAt: days(-100) };

test("nothing at all is free, and can buy either product", () => {
  const m = resolveMembership(none, NOW);
  assert.equal(m.tier, "free");
  assert.equal(m.lifetime, null);
  assert.equal(m.graceEndsAt, null);
  assert.equal(m.canPurchaseLifetime, true);
  assert.equal(m.canPurchasePro, true);
});

test("lifetime alone is lifetime, and can't buy lifetime again", () => {
  const m = resolveMembership({ ...none, lifetime }, NOW);
  assert.equal(m.tier, "lifetime");
  assert.deepEqual(m.lifetime, lifetime);
  assert.equal(m.canPurchaseLifetime, false);
  assert.equal(m.canPurchasePro, true);
});

test("live Pro wins over lifetime and reports its expiry", () => {
  const m = resolveMembership({ ...none, proLive: true, proExpiresAt: days(20), lifetime }, NOW);
  assert.equal(m.tier, "pro");
  assert.equal(m.proExpiresAt, days(20));
  assert.equal(m.canPurchasePro, false);
  assert.equal(m.graceEndsAt, null, "no grace while Pro is live");
});

test("Pro that ended naturally 3 days ago leaves lifetime with 4 days of grace", () => {
  const m = resolveMembership({ ...none, lastNaturalProEndAt: days(-3), lifetime }, NOW);
  assert.equal(m.tier, "lifetime");
  assert.equal(m.graceEndsAt, days(4));
  assert.equal(m.proExpiresAt, null);
});

test("the grace is 7 days, and gone once they have passed", () => {
  assert.equal(PRO_GRACE_DAYS, 7);
  const m = resolveMembership({ ...none, lastNaturalProEndAt: days(-8), lifetime }, NOW);
  assert.equal(m.graceEndsAt, null);
});

test("a free user whose Pro ended gets no grace — there is no 20-slot tier to fall to", () => {
  const m = resolveMembership({ ...none, lastNaturalProEndAt: days(-3) }, NOW);
  assert.equal(m.tier, "free");
  assert.equal(m.graceEndsAt, null);
});

test("no natural end (refund / revoked grant filtered upstream) means no grace", () => {
  const m = resolveMembership({ ...none, lastNaturalProEndAt: null, lifetime }, NOW);
  assert.equal(m.graceEndsAt, null);
});

// ---- The row → sources step, where "refunds earn no grace" actually lives ----
import { membershipSourcesFromRow } from "../lib/atlas/membership";

const FREE = { tier: "free" as const, expiresAt: null };
const row = {
  sub_tier: null as string | null,
  sub_expires_at: null as string | Date | null,
  sub_revoked_at: null as string | Date | null,
  grant_ended_at: null as string | Date | null,
  lifetime_source: null as string | null,
  lifetime_acquired_at: null as string | Date | null,
};

test("a subscription that lapsed on its date is a natural end", () => {
  const s = membershipSourcesFromRow({ ...row, sub_tier: "free", sub_expires_at: days(-5) }, FREE, NOW);
  assert.equal(s.proLive, false);
  assert.equal(s.lastNaturalProEndAt, days(-5));
});

test("a refunded subscription is not a natural end, even after its date passes", () => {
  const s = membershipSourcesFromRow(
    { ...row, sub_tier: "free", sub_expires_at: days(-5), sub_revoked_at: days(-20) },
    FREE,
    NOW,
  );
  assert.equal(s.lastNaturalProEndAt, null);
});

test("the later of a lapsed subscription and a lapsed grant wins", () => {
  const s = membershipSourcesFromRow(
    { ...row, sub_tier: "free", sub_expires_at: days(-9), grant_ended_at: days(-2) },
    FREE,
    NOW,
  );
  assert.equal(s.lastNaturalProEndAt, days(-2));
});

test("Pro liveness comes from the caller's union result, not re-derived here", () => {
  const s = membershipSourcesFromRow(row, { tier: "pro", expiresAt: days(40) }, NOW);
  assert.equal(s.proLive, true);
  assert.equal(s.proExpiresAt, days(40));
});

test("a live lifetime row is carried through with ISO timestamps", () => {
  const s = membershipSourcesFromRow(
    { ...row, lifetime_source: "legacy_pro", lifetime_acquired_at: new Date(days(-1)) },
    FREE,
    NOW,
  );
  assert.deepEqual(s.lifetime, { source: "legacy_pro", acquiredAt: days(-1) });
});
