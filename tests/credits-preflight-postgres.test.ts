import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { preflightCredits } from "../lib/credits/preflight";
import { creditMigrationSql } from "../lib/credits/migration-plan";
import { createCreditWallet } from "../lib/credits/wallet";
import { creditConfig } from "../lib/credits/policy";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;
test("read-only cutover inventory against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const database = "preflight_" + randomUUID().replaceAll("-", "");
  let sql: postgres.Sql | undefined;
  try {
    await admin.unsafe(`CREATE DATABASE ${database}`);
    url.pathname = "/" + database;
    sql = postgres(url.toString(), { max: 2, onnotice: () => {} });
    const db = sql;
    await t.test("before migration missing tables remain explicit and unavailable counts are null", async () => {
      const report = await preflightCredits(db, "sandbox");
      assert.equal(report.databaseChecksPassed, false);
      assert.ok(report.schema.missingTables.includes("credit_accounts"));
      assert.ok(report.schema.missingTables.includes("user_lifetime_entitlements"));
      assert.equal(report.memberships, null);
      assert.equal(report.credits, null);
      assert.equal(report.work, null);
    });

    await db`CREATE SCHEMA auth`;
    await db`CREATE TABLE auth.users (id UUID PRIMARY KEY)`;
    await db`CREATE TABLE words (id TEXT PRIMARY KEY)`;
    // The columns check-in reads; production's table is in scripts/migrate.ts.
    await db`CREATE TABLE study_logs (user_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
    const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
    for (const table of ["user_atlas_images", "user_atlas_recognition_jobs", "user_atlas_candidates", "user_atlas_items",
      "user_entitlements", "user_entitlement_grants", "user_lifetime_entitlements", "atlas_ai_reservations"]) {
      const statement = migration.match(new RegExp("`(CREATE TABLE IF NOT EXISTS " + table + " \\([\\s\\S]*?)`"))?.[1];
      assert.ok(statement, `missing actual DDL for ${table}`);
      await db.unsafe(statement);
    }
    await db`ALTER TABLE user_entitlements ADD COLUMN IF NOT EXISTS storekit_revoked_at TIMESTAMPTZ`;
    const users = { eligible: randomUUID(), pro: randomUUID(), grantPro: randomUUID(),
      expired: randomUUID(), revoked: randomUUID(), proOnly: randomUUID() };
    for (const userId of Object.values(users)) await db`INSERT INTO auth.users(id) VALUES (${userId})`;
    for (const [name, userId] of Object.entries(users).filter(([name]) => name !== "proOnly")) {
      await db`INSERT INTO user_lifetime_entitlements(user_id,source,reason,revoked_at)
        VALUES (${userId}, ${name === "pro" ? "appstore" : "grant"}, 'isolated inventory fixture',
          ${name === "revoked" ? new Date("2000-01-01") : null})`;
    }
    for (const userId of [users.pro, users.proOnly]) {
      await db`INSERT INTO user_entitlements(user_id,tier,expires_at) VALUES (${userId},'pro','2099-01-01')`;
    }
    await db`INSERT INTO user_entitlements(user_id,tier,expires_at) VALUES (${users.expired},'pro','2000-01-01')`;
    await db`INSERT INTO user_entitlement_grants(user_id,reason,granted_by,expires_at)
      VALUES (${users.grantPro}, 'isolated test', 'isolated inventory operator', '2099-01-01')`;
    await db`INSERT INTO user_entitlement_grants(user_id,reason,granted_by,expires_at,revoked_at)
      VALUES (${users.expired}, 'revoked grant', 'isolated inventory operator', '2099-01-01','2000-01-01')`;
    async function addCards(userId: string, count: number, deleted = false) {
      const image = randomUUID();
      await db`INSERT INTO user_atlas_images(id,user_id,original_path,thumb_path,recognition_path,mime_type,byte_size,sha256)
        VALUES (${image},${userId},'fixture/original','fixture/thumb','fixture/recognition','image/webp',100,${image})`;
      await db`INSERT INTO user_atlas_items(user_id,image_id,primary_label,lemma,display_zh_hant,correction_source,deleted_at)
        SELECT ${userId},${image},'cat','cat','貓','manual',${deleted ? new Date("2000-01-01") : null}
        FROM generate_series(1,${count})`;
    }
    await addCards(users.eligible, 201);
    await addCards(users.expired, 200);
    await addCards(users.expired, 5, true);
    await db`INSERT INTO atlas_ai_reservations(user_id,operation,created_at)
      VALUES (${users.eligible},'primary','2000-01-01')`;

    await t.test("legacy inventory works before credits migration and counts live sources without assuming store environment", async () => {
      const report = await preflightCredits(db, "production");
      assert.equal(report.databaseChecksPassed, false);
      const m = report.memberships!;
      assert.equal(m.scope, "shared_entitlements_environment_unclassified");
      assert.equal(m.lifetimeAccounts, "4");
      assert.equal(m.activeProAccounts, "3");
      assert.equal(m.activeSubscriptionProAccounts, "2");
      assert.equal(m.activeGrantProAccounts, "1");
      assert.equal(m.lifetimeWithActivePro, "2");
      assert.equal(m.legacyLifetimeWithActivePro, "2");
      assert.equal(m.activeProWithoutLifetime, "1");
      assert.equal(m.replaceableLifetimeAccounts, "4");
      assert.equal(m.pendingReplacementAccounts, "4");
      assert.equal(m.atCapacityAccounts, "1");
      assert.equal(m.overCapacityAccounts, "1");
      assert.equal(m.legacyReservationRows, "1");
      assert.equal(m.monthlyEligibleAccountsWithoutCurrentGrant, "4");
      assert.deepEqual(m.lifetimeBySource, [{ source: "appstore", accounts: "1" }, { source: "grant", accounts: "3" }]);
      assert.ok(report.reviewItems.includes("active_pro_missing_lifetime_holding"));
      assert.equal(report.credits, null);
    });

    await t.test("a failed offline migration publishes no partial tables", async () => {
      const connection = await db.reserve();
      try {
        const faulty = creditMigrationSql().replace("COMMIT;", "SELECT preflight_injected_missing_function();\nCOMMIT;");
        await assert.rejects(connection.unsafe(faulty));
        await connection.unsafe("ROLLBACK");
      } finally { connection.release(); }
      const report = await preflightCredits(db, "sandbox");
      assert.ok(report.schema.missingTables.includes("credit_accounts"));
      assert.ok(report.schema.missingTables.includes("ai_operations"));
      assert.equal(report.credits, null);
    });

    await t.test("the offline migration applies and reruns without changing legacy entitlements or content", async () => {
      const [before] = await db`SELECT
        (SELECT count(*)::text FROM user_lifetime_entitlements) AS lifetime,
        (SELECT count(*)::text FROM user_atlas_items) AS items`;
      const connection = await db.reserve();
      try {
        await connection.unsafe(creditMigrationSql());
        await connection.unsafe(creditMigrationSql());
      } finally { connection.release(); }
      const report = await preflightCredits(db, "sandbox");
      assert.equal(report.databaseChecksPassed, true);
      assert.equal(report.credits!.accounts, "0");
      assert.equal(report.memberships!.pendingReplacementAccounts, "4");
      const [after] = await db`SELECT
        (SELECT count(*)::text FROM user_lifetime_entitlements) AS lifetime,
        (SELECT count(*)::text FROM user_atlas_items) AS items`;
      assert.deepEqual(after, before);
    });
    for (const [userId, environment] of [[users.eligible, "sandbox"], [users.expired, "production"]] as const) {
      await db`INSERT INTO credit_accounts(user_id,environment) VALUES (${userId},${environment})`;
      await db`INSERT INTO credit_user_policies(user_id,environment,billing_mode) VALUES (${userId},${environment},'credits')`;
    }
    const account = { userId: users.eligible, environment: "sandbox" as const };
    const oldWallet = createCreditWallet(db, () => new Date("2000-01-01"));
    await oldWallet.grant(account, { key: "old-expired-month", source: "monthly", amount: 1000, expiresAt: new Date("2001-01-01") });

    async function financialSnapshot() {
      const [snapshot] = await db`SELECT
        (SELECT sum(remaining)::text FROM credit_lots) AS remaining,
        (SELECT sum(wallet_version)::text FROM credit_accounts) AS versions,
        (SELECT count(*)::text FROM credit_ledger) AS entries,
        (SELECT count(*)::text FROM credit_benefit_claims) AS claims,
        (SELECT count(*)::text FROM credit_user_policies) AS policies,
        (SELECT count(*)::text FROM credit_policy_events) AS policy_events,
        (SELECT count(*)::text FROM atlas_ai_reservations) AS legacy_reservations`;
      return snapshot;
    }
    await t.test("inventory does not expire old gifts, enroll accounts, grant monthly credits or remove stale reservations", async () => {
      const before = await financialSnapshot();
      const report = await preflightCredits(db, "sandbox");
      assert.equal(report.databaseChecksPassed, true);
      assert.equal(report.memberships!.alreadyCreditsLifetimeAccounts, "1");
      assert.equal(report.memberships!.pendingReplacementAccounts, "3");
      assert.equal(report.memberships!.monthlyEligibleAccountsWithoutCurrentGrant, "4");
      assert.deepEqual(await financialSnapshot(), before);
      const text = JSON.stringify(report);
      for (const id of Object.values(users)) assert.ok(!text.includes(id));
      assert.ok(!text.includes("isolated inventory fixture"));
    });

    await t.test("credits policy and monthly claims are separated by environment", async () => {
      const wallet = createCreditWallet(db);
      await wallet.claimBenefit(account, "monthly", creditConfig({
        AI_CREDITS_MODE: "live", AI_CREDITS_ENVIRONMENT: "sandbox", AI_CREDITS_MONTHLY_ENABLED: "true",
      }));
      const sandbox = await preflightCredits(db, "sandbox"), production = await preflightCredits(db, "production");
      assert.equal(sandbox.memberships!.alreadyCreditsLifetimeAccounts, "1");
      assert.equal(production.memberships!.alreadyCreditsLifetimeAccounts, "1");
      assert.equal(sandbox.memberships!.monthlyEligibleAccountsWithoutCurrentGrant, "3");
      assert.equal(production.memberships!.monthlyEligibleAccountsWithoutCurrentGrant, "4");
      assert.equal(production.memberships!.legacyReservationRows, "1");
    });

    await t.test("work and refunds are aggregated in the requested environment and private payloads stay out", async () => {
      for (const environment of ["sandbox", "production"] as const) {
        const userId = environment === "sandbox" ? users.eligible : users.expired;
        const id = randomUUID(), quote = randomUUID();
        const deadline = new Date(environment === "sandbox" ? "2000-01-01" : "2099-01-01");
        await db`INSERT INTO ai_quotes(id,user_id,environment,input,image_sha256,request_hash,points,price_version,expires_at,created_at)
          VALUES (${quote},${userId},${environment},'{}','fixture','fixture',100,'fixture','2099-01-01',now())`;
        await db`INSERT INTO ai_operations(id,user_id,environment,quote_id,idempotency_key,request_hash,image_id,job_id,
          input,image_sha256,requires_slot,points,price_version,state,reconcile_until,created_at,updated_at)
          VALUES (${id},${userId},${environment},${quote},${id},'fixture',${randomUUID()},${randomUUID()},
            '{}','fixture',false,100,'fixture','running',${deadline},now(),now())`;
        await db`INSERT INTO ai_fulfillments(operation_id,state,next_attempt_at,deadline_at,created_at,updated_at)
          VALUES (${id},'pending',now(),${deadline},now(),now())`;
        await db`INSERT INTO credit_image_uploads(id,user_id,environment,sha256,byte_size,width,height,original_path,thumb_path,
          state,lease_until,expires_at,created_at)
          VALUES (${randomUUID()},${userId},${environment},${id},100,1,1,'private-path','private-thumb','pending',${deadline},'2099-01-01',now())`;
        await db`INSERT INTO credit_store_notifications(environment,notification_id,payload_hash,payload,next_attempt_at,created_at)
          VALUES (${environment},${randomUUID()},'fixture',${db.json({ secret: "private-signed-payload" })},${deadline},now())`;
      }
      await db`INSERT INTO credit_store_transactions(environment,transaction_id,user_id,product_id,quantity,points,
        catalog_version,last_event_at,refund_points,withdrawn_points,consumed_points)
        VALUES ('sandbox','private-transaction',${users.eligible},'app.tuji.credits.1000',1,1000,'fixture',now(),500,200,300)`;
      const sandbox = await preflightCredits(db, "sandbox"), production = await preflightCredits(db, "production");
      assert.deepEqual(sandbox.work, {
        activeOperations: "1", overdueOperations: "1", activeFulfillments: "1", overdueFulfillments: "1",
        pendingNotifications: "1", dueNotificationRetries: "1", pendingUploads: "1", overdueUploadLeases: "1",
      });
      assert.deepEqual(production.work, {
        activeOperations: "1", overdueOperations: "0", activeFulfillments: "1", overdueFulfillments: "0",
        pendingNotifications: "1", dueNotificationRetries: "0", pendingUploads: "1", overdueUploadLeases: "0",
      });
      assert.equal(sandbox.credits!.refundRestrictedAccounts, "1");
      assert.equal(production.credits!.refundRestrictedAccounts, "0");
      assert.ok(!JSON.stringify(sandbox).includes("private-"));
    });

    await t.test("partial migration cannot present unavailable membership counts as zero", async () => {
      await db`ALTER TABLE user_entitlements RENAME COLUMN storekit_revoked_at TO old_revoked_at`;
      try {
        const report = await preflightCredits(db, "sandbox");
        assert.equal(report.databaseChecksPassed, false);
        assert.ok(report.schema.missingInventoryColumns.includes("user_entitlements.storekit_revoked_at"));
        assert.equal(report.memberships, null);
      } finally { await db`ALTER TABLE user_entitlements RENAME COLUMN old_revoked_at TO storekit_revoked_at`; }
    });

    await t.test("disabled RLS and public client policy prevent passing the database checks", async () => {
      await db`ALTER TABLE credit_ledger DISABLE ROW LEVEL SECURITY`;
      await db`CREATE POLICY preflight_public ON credit_accounts FOR SELECT TO PUBLIC USING (true)`;
      try {
        const report = await preflightCredits(db, "sandbox");
        assert.equal(report.databaseChecksPassed, false);
        assert.deepEqual(report.schema.rlsDisabled, ["credit_ledger"]);
        assert.deepEqual(report.schema.clientPoliciesPresent, ["credit_accounts"]);
      } finally {
        await db`ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY`;
        await db`DROP POLICY preflight_public ON credit_accounts`;
      }
    });

    await t.test("a reader filtered by RLS cannot falsely report empty credits and memberships", async () => {
      const readerName = "reader_" + randomUUID().replaceAll("-", "");
      const password = randomUUID();
      await db.unsafe(`CREATE ROLE ${readerName} LOGIN PASSWORD '${password}'`);
      await db.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${readerName}`);
      const readerUrl = new URL(url);
      readerUrl.username = readerName; readerUrl.password = password;
      const reader = postgres(readerUrl.toString(), { max: 1, onnotice: () => {} });
      try {
        const report = await preflightCredits(reader, "sandbox");
        assert.equal(report.databaseChecksPassed, false);
        assert.ok(report.schema.unreadableTables.includes("credit_accounts"));
        assert.equal(report.credits, null);
        assert.equal(report.memberships, null);
        assert.equal(report.work, null);
      } finally { await reader.end(); }
    });

    await t.test("invalid environment fails before inventory queries", async () => {
      await assert.rejects(preflightCredits(db, "invalid" as "sandbox"), /Invalid credit environment/);
    });
  } finally {
    if (sql) await sql.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  }
});
