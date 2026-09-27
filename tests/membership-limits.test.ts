// Pins the limits table and the policy switch (docs/MEMBERSHIP_SERVER_DESIGN.md
// §4, phase 3).
//
// THE RED LINE: flipping MEMBERSHIP_POLICY is the cutover, so v1 must be
// byte-for-byte the limits that shipped before the three tiers existed, and
// v2 must be exactly what docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §0 promises
// publicly (0/20/300 slots, 0/10/200 ordinary, 0/0/30 precision).

import assert from "node:assert/strict";
import test from "node:test";
import { limitsFor, upgradeTarget } from "../lib/atlas/membership-limits";

test("v1 is the pre-membership Free/Pro, and lifetime changes nothing", () => {
  const free = limitsFor("free", "v1");
  assert.equal(free.atlasSlotsLimit, 3);
  assert.equal(free.primaryAiSoftLimitMonthly, 30);
  assert.equal(free.precisionAiLimitMonthly, 0);
  assert.equal(free.savedItemsLimit, 1000);
  assert.deepEqual(limitsFor("lifetime", "v1"), free);

  const pro = limitsFor("pro", "v1");
  assert.equal(pro.atlasSlotsLimit, 300);
  assert.equal(pro.primaryAiSoftLimitMonthly, 500);
  assert.equal(pro.precisionAiLimitMonthly, 30);
  assert.equal(pro.savedItemsLimit, 5000);
});

test("v2 is the published three-tier table", () => {
  const rows = (["free", "lifetime", "pro"] as const).map((t) => {
    const l = limitsFor(t, "v2");
    return [l.atlasSlotsLimit, l.primaryAiSoftLimitMonthly, l.precisionAiLimitMonthly];
  });
  assert.deepEqual(rows, [
    [0, 0, 0],
    [20, 10, 0],
    [300, 200, 30],
  ]);
});

test("v2 non-members cannot save community items; members can", () => {
  assert.equal(limitsFor("free", "v2").savedItemsLimit, 0);
  assert.ok(limitsFor("lifetime", "v2").savedItemsLimit > 0);
  assert.ok(limitsFor("pro", "v2").savedItemsLimit >= limitsFor("lifetime", "v2").savedItemsLimit);
});

test("ads stay false everywhere — released clients still decode the field", () => {
  for (const p of ["v1", "v2"] as const)
    for (const t of ["free", "lifetime", "pro"] as const)
      assert.equal(limitsFor(t, p).adsRequiredForCardGeneration, false);
});

test("the upgrade a limit points at: v1 free→pro; v2 free→lifetime, lifetime→pro, pro→none", () => {
  assert.equal(upgradeTarget("free", "v1"), "pro");
  assert.equal(upgradeTarget("pro", "v1"), null);
  assert.equal(upgradeTarget("free", "v2"), "lifetime");
  assert.equal(upgradeTarget("lifetime", "v2"), "pro");
  assert.equal(upgradeTarget("pro", "v2"), null);
});
