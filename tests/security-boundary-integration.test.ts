import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("billing writers persist ordering and account-binding fields", () => {
  const entitlement = readFileSync(new URL("../lib/atlas/entitlement.ts", import.meta.url), "utf8");
  assert.match(entitlement, /pg_advisory_xact_lock/);
  assert.match(entitlement, /decideStoreKitState/);
  assert.match(entitlement, /decideStoreKitBinding/);
  assert.match(entitlement, /storekit_signed_at/);

  const purchase = readFileSync(
    new URL("../../tuji-ios/Tuji/Core/Billing/StoreKitService.swift", import.meta.url),
    "utf8",
  );
  assert.match(purchase, /product\.purchase\(options: \[\.appAccountToken\(user\.id\)\]\)/);

  const answerRoute = readFileSync(
    new URL("../app/api/study/answer/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(answerRoute, /studyAnswerOwnerMatches\(body\.ownerUserId, userId\)/);
});

test("anonymous writes and admin login use fail-closed rate limits", () => {
  for (const relative of ["../app/api/events/route.ts", "../app/api/auth/login/route.ts"]) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /failClosed: true/);
    assert.match(source, /rate\.available/);
    assert.match(source, /readLimitedJson/);
  }
});

test("database schema enforces analytics field ceilings", () => {
  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  assert.match(migration, /events_payload_lengths_chk/);
  assert.match(migration, /char_length\(coalesce\(session_id, ''\)\) <= 128/);
});
