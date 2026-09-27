// Pins the phase-1 membership schema in scripts/migrate.ts
// (docs/MEMBERSHIP_SERVER_DESIGN.md §2). Static, like the other migrate tests:
// the DDL only ever runs in a production deploy, so a regression here would
// otherwise surface as a failed deploy or a silently-missing column.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrate = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");

test("lifetime holdings live in their own table, at most one live row per user", () => {
  assert.match(migrate, /CREATE TABLE IF NOT EXISTS user_lifetime_entitlements/);
  assert.match(migrate, /source IN \('appstore','legacy_pro','grant'\)/);
  assert.match(
    migrate,
    /CREATE UNIQUE INDEX IF NOT EXISTS user_lifetime_live_idx\s+ON user_lifetime_entitlements\(user_id\) WHERE revoked_at IS NULL/,
  );
});

test("the subscription row can record a refund, so refunds earn no grace", () => {
  assert.match(migrate, /ALTER TABLE user_entitlements ADD COLUMN IF NOT EXISTS storekit_revoked_at TIMESTAMPTZ/);
});

test("the ledger accepts 'lifetime', guarded on the definition not the name", () => {
  assert.match(migrate, /pg_get_constraintdef\(oid\) LIKE '%lifetime%'/);
  assert.match(migrate, /CHECK \(to_tier IN \('free','lifetime','pro'\)\)/);
});
