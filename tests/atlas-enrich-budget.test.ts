// The 補充 attempt budget (docs/adr/0011, 0016 in tuji-ios). The number is
// read by the fulfillment service; what happens when it runs out is pinned
// against Postgres in tests/ai-operations-postgres.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { atlasEnrichMaxAttempts } from "../lib/atlas/enrich-policy";

function withEnv(value: string | undefined, run: () => void) {
  const previous = process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
  if (value === undefined) delete process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
  else process.env.ATLAS_ENRICH_MAX_ATTEMPTS = value;
  try { run(); } finally {
    if (previous === undefined) delete process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
    else process.env.ATLAS_ENRICH_MAX_ATTEMPTS = previous;
  }
}

test("the default budget is finite and leaves room to retry", () => {
  withEnv(undefined, () => assert.equal(atlasEnrichMaxAttempts(), 3));
  withEnv("", () => assert.equal(atlasEnrichMaxAttempts(), 3));
});

test("ATLAS_ENRICH_MAX_ATTEMPTS=0 turns 補充 off without a deploy", () => {
  withEnv("0", () => assert.equal(atlasEnrichMaxAttempts(), 0));
});

test("a nonsense value falls back to the default rather than to unlimited", () => {
  for (const bad of ["-1", "many", "Infinity"]) withEnv(bad, () => assert.equal(atlasEnrichMaxAttempts(), 3));
});
