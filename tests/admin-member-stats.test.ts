import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { loadMembershipCounts } from "../lib/admin/member-stats";

// Temporary tables shadow the catalog tables; no persistent account data is written.
test("membership statistics deduplicate grants and keep permanent holders out of free", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const sql = postgres(process.env.TEST_DATABASE_URL!, { ssl: "require", prepare: false, max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx`CREATE TEMP TABLE profiles (id text PRIMARY KEY) ON COMMIT DROP`;
      await tx`CREATE TEMP TABLE user_entitlements (user_id text, tier text, expires_at timestamptz) ON COMMIT DROP`;
      await tx`CREATE TEMP TABLE user_entitlement_grants (user_id text, revoked_at timestamptz, expires_at timestamptz) ON COMMIT DROP`;
      await tx`CREATE TEMP TABLE user_lifetime_entitlements (user_id text, source text, revoked_at timestamptz) ON COMMIT DROP`;
      await tx`INSERT INTO profiles VALUES ('free'), ('paid'), ('gift-pro'), ('lifetime'), ('both'), ('revoked'), ('expired')`;
      await tx`INSERT INTO user_entitlements VALUES ('paid', 'pro', now() + interval '1 day'), ('both', 'pro', NULL), ('expired', 'pro', now() - interval '1 day')`;
      await tx`INSERT INTO user_entitlement_grants VALUES ('paid', NULL, now() + interval '1 day'), ('gift-pro', NULL, now() + interval '2 days'), ('gift-pro', NULL, now() + interval '3 days'), ('revoked', now(), now() + interval '1 day'), ('expired', NULL, now() - interval '1 day')`;
      await tx`INSERT INTO user_lifetime_entitlements VALUES ('lifetime', 'grant', NULL), ('both', 'appstore', NULL), ('revoked', 'grant', now()), ('expired', 'legacy_pro', NULL)`;
      assert.deepEqual(await loadMembershipCounts(tx), {
        total: 7, pro: 3, paid: 2, lifetime: 2, free: 2,
        lifetimeHoldings: 3, lifetimePurchased: 1, lifetimeGranted: 2,
      });
    });
  } finally {
    await sql.end();
  }
});
