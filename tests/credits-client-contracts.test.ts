import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceRejected } from "../lib/credits/client-contracts";

test("unknown acceptance outcomes retain the same paid request for recovery", () => {
  for (const code of ["credits_disabled", "credits_unavailable", "unauthorized", "forbidden", "timeout", "credits_not_enrolled"]) {
    assert.equal(acceptanceRejected(code), false, code);
  }
  for (const code of ["quote_expired", "capacity_full", "insufficient_credits", "image_changed", "idempotency_conflict"]) {
    assert.equal(acceptanceRejected(code), true, code);
  }
});
