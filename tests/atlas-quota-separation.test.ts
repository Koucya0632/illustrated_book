// Pins the creation/consumption quota split (docs/COMMUNITY_ATLAS_PLAN.md §4.1).
//
// THE RED LINE: saving community content must never consume the creation slots
// (Free = 3). If it did, a free user who saves a few of other people's photos
// would be locked out of making their own — which destroys the free tier's
// value proposition and, with it, the community's supply of contributors.
//
// These tests cover the *policy* layer (limits + gates). The structural half of
// the guarantee is that saves are stored in atlas_saves, never user_atlas_items,
// which getAtlasUsage() counts for atlasSlots — see the queries in
// lib/atlas/entitlement.ts and the DDL comment in scripts/migrate.ts.

import assert from "node:assert/strict";
import test from "node:test";
import { atlasLimitsForTier } from "../lib/atlas/entitlement";

test("saved-items limit is a separate, far larger budget than creation slots", () => {
  const free = atlasLimitsForTier("free");
  assert.equal(free.atlasSlotsLimit, 3);
  // Generous by design: the free tier's appeal is other people's content.
  assert.ok(
    free.savedItemsLimit > free.atlasSlotsLimit * 100,
    `free savedItemsLimit (${free.savedItemsLimit}) must dwarf creation slots (${free.atlasSlotsLimit})`,
  );
});

test("both tiers expose an independent saved-items limit", () => {
  for (const tier of ["free", "pro"] as const) {
    const limits = atlasLimitsForTier(tier);
    assert.equal(
      typeof limits.savedItemsLimit,
      "number",
      `${tier} must define savedItemsLimit`,
    );
    assert.ok(limits.savedItemsLimit > 0);
    assert.notEqual(
      limits.savedItemsLimit,
      limits.atlasSlotsLimit,
      `${tier}: saving must not be governed by the creation limit`,
    );
  }
});

test("Pro sells creation capacity, not the right to consume", () => {
  const free = atlasLimitsForTier("free");
  const pro = atlasLimitsForTier("pro");
  // The upgrade lever is creation + AI.
  assert.ok(pro.atlasSlotsLimit > free.atlasSlotsLimit);
  assert.ok(pro.primaryAiSoftLimitMonthly > free.primaryAiSoftLimitMonthly);
  assert.ok(pro.precisionAiLimitMonthly > free.precisionAiLimitMonthly);
  // Consumption stays usable on free — it must not be squeezed to force upgrades.
  assert.ok(
    free.savedItemsLimit >= 1000,
    "free consumption budget must stay generous",
  );
});

test("env can tune the saved-items limits without touching creation slots", () => {
  const prev = process.env.ATLAS_FREE_SAVED_ITEMS;
  process.env.ATLAS_FREE_SAVED_ITEMS = "2500";
  try {
    const free = atlasLimitsForTier("free");
    assert.equal(free.savedItemsLimit, 2500);
    assert.equal(free.atlasSlotsLimit, 3);
  } finally {
    if (prev === undefined) delete process.env.ATLAS_FREE_SAVED_ITEMS;
    else process.env.ATLAS_FREE_SAVED_ITEMS = prev;
  }
});
