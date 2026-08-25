// Pins the 補充 spend ceiling in lib/atlas/enrich.ts.
//
// THE RED LINE: one 補充 pass is 3-4 paid model calls, and the decision to spend
// them must be finite per item. It used to be spelled out at each call site, and
// the spelling on the GET path — `backfill_status !== 'filled'` — was true
// FOREVER once an item failed, because a failure writes 'failed' and 'failed' is
// not 'filled'. A reliably-failing item therefore re-ran the whole paid pass on
// every 詳情 open, indefinitely, through ordinary navigation.
//
// These tests exist so the ceiling cannot regress into a rate (a per-minute cap
// still bills forever) or into two disagreeing sources of truth.
// See docs/adr/0011 in tuji-ios.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ATLAS_ENRICH_VERSION,
  atlasEnrichMaxAttempts,
  nextBackfillAttempt,
  shouldEnrichAtlasItem,
} from "../lib/atlas/enrich-policy";
import type { AtlasItemRow } from "../lib/atlas/types";

const MAX = atlasEnrichMaxAttempts();
const STALE = ATLAS_ENRICH_VERSION - 1;

function item(over: Partial<AtlasItemRow>): AtlasItemRow {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    backfill_status: "pending",
    backfill_attempts: 0,
    backfill_attempts_version: ATLAS_ENRICH_VERSION,
    enrichment: { enrichVersion: ATLAS_ENRICH_VERSION },
    ...over,
  } as unknown as AtlasItemRow;
}

test("the default budget is finite and leaves room to retry", () => {
  assert.ok(MAX >= 1, "a zero default would silently disable 補充");
  assert.ok(Number.isFinite(MAX));
});

test("a filled item on the current recipe never costs money again", () => {
  assert.equal(shouldEnrichAtlasItem(item({ backfill_status: "filled" })), false);
});

test("a fresh item is worth one pass", () => {
  assert.equal(shouldEnrichAtlasItem(item({})), true);
});

test("a failed item is retried while it still has budget", () => {
  assert.equal(
    shouldEnrichAtlasItem(item({ backfill_status: "failed", backfill_attempts: MAX - 1 })),
    true,
  );
});

// The regression this whole change exists for.
test("a failed item stops costing money once the budget is spent", () => {
  assert.equal(
    shouldEnrichAtlasItem(item({ backfill_status: "failed", backfill_attempts: MAX })),
    false,
  );
});

test("a skipped item never costs money", () => {
  assert.equal(
    shouldEnrichAtlasItem(item({ backfill_status: "skipped", backfill_attempts: MAX })),
    false,
  );
});

test("a new recipe revives a skipped item and gives it a fresh budget", () => {
  assert.equal(
    shouldEnrichAtlasItem(
      item({
        backfill_status: "skipped",
        backfill_attempts: MAX,
        backfill_attempts_version: STALE,
        enrichment: { enrichVersion: STALE },
      }),
    ),
    true,
  );
});

test("a new recipe re-enriches a filled item", () => {
  assert.equal(
    shouldEnrichAtlasItem(
      item({ backfill_status: "filled", enrichment: { enrichVersion: STALE } }),
    ),
    true,
  );
});

// A failure never stamps enrichVersion, so an item failing under the CURRENT
// recipe reads as "stale" forever. If staleness short-circuited the budget, the
// ceiling would never bind — which is exactly how the first design of this fix
// would have failed.
test("staleness does not override a spent budget on the current recipe", () => {
  assert.equal(
    shouldEnrichAtlasItem(
      item({
        backfill_status: "failed",
        backfill_attempts: MAX,
        backfill_attempts_version: ATLAS_ENRICH_VERSION,
        enrichment: { enrichVersion: STALE },
      }),
    ),
    false,
  );
});

test("the last attempt lands the item in skipped, not failed", () => {
  const mid = nextBackfillAttempt(item({ backfill_attempts: 0 }));
  assert.equal(mid.attempts, 1);
  assert.equal(mid.status, MAX <= 1 ? "skipped" : "failed");

  const last = nextBackfillAttempt(item({ backfill_attempts: MAX - 1 }));
  assert.equal(last.attempts, MAX);
  assert.equal(last.status, "skipped");
});

test("counting a failure under a new recipe restarts the budget", () => {
  const next = nextBackfillAttempt(
    item({ backfill_attempts: MAX, backfill_attempts_version: STALE }),
  );
  assert.equal(next.attempts, 1, "a new recipe must not inherit the old count");
  assert.equal(next.version, ATLAS_ENRICH_VERSION);
});

test("ATLAS_ENRICH_MAX_ATTEMPTS=0 turns 補充 off without a deploy", () => {
  const prev = process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
  process.env.ATLAS_ENRICH_MAX_ATTEMPTS = "0";
  try {
    assert.equal(atlasEnrichMaxAttempts(), 0);
    assert.equal(shouldEnrichAtlasItem(item({})), false);
  } finally {
    if (prev === undefined) delete process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
    else process.env.ATLAS_ENRICH_MAX_ATTEMPTS = prev;
  }
});
