import type postgres from "postgres";
import { CREDIT_TABLES } from "./schema";
import { AI_OPERATION_TABLES } from "../ai-operations/schema";
import { CREDIT_POLICY, type CreditEnvironment } from "./policy";
import { refundReviewCondition } from "./refund-review";

const BASE_COLUMNS = {
  user_lifetime_entitlements: ["user_id", "revoked_at", "source"],
  user_entitlements: ["user_id", "tier", "expires_at", "storekit_revoked_at"],
  user_entitlement_grants: ["user_id", "revoked_at", "expires_at"],
  user_atlas_items: ["user_id", "deleted_at"],
  atlas_ai_reservations: ["user_id", "created_at"],
} as const;
const INVENTORY_COLUMNS = {
  credit_accounts: ["user_id", "environment"],
  credit_user_policies: ["user_id", "environment", "billing_mode"],
  credit_benefit_claims: ["user_id", "environment", "kind", "period"],
  credit_store_transactions: ["user_id", "environment", "refund_points", "withdrawn_points"],
  credit_refund_resolutions: ["user_id", "environment", "transaction_id", "refund_event_at", "refund_points", "resolved_points"],
  credit_store_notifications: ["environment", "state", "next_attempt_at"],
  ai_operations: ["id", "environment", "state", "reconcile_until"],
  ai_fulfillments: ["operation_id", "state", "deadline_at"],
  credit_image_uploads: ["environment", "state", "lease_until"],
} as const;
const NEW_TABLES = [...CREDIT_TABLES, ...AI_OPERATION_TABLES];
const ALL_TABLES = [...Object.keys(BASE_COLUMNS), ...NEW_TABLES];

export interface CreditPreflight {
  formatVersion: 1;
  environment: CreditEnvironment;
  checkedAt: string;
  readOnly: true;
  databaseChecksPassed: boolean;
  schema: {
    missingTables: string[];
    missingInventoryColumns: string[];
    rlsDisabled: string[];
    clientPoliciesPresent: string[];
    unreadableTables: string[];
  };
  // Legacy entitlements have no trustworthy store environment column.
  // Never label these totals as verified production purchasers.
  memberships: null | {
    scope: "shared_entitlements_environment_unclassified";
    lifetimeAccounts: string;
    lifetimeBySource: { source: string; accounts: string }[];
    activeProAccounts: string;
    activeSubscriptionProAccounts: string;
    activeGrantProAccounts: string;
    lifetimeWithActivePro: string;
    activeProWithoutLifetime: string;
    legacyLifetimeWithActivePro: string;
    replaceableLifetimeAccounts: string;
    alreadyCreditsLifetimeAccounts: string;
    pendingReplacementAccounts: string;
    atCapacityAccounts: string;
    overCapacityAccounts: string;
    legacyReservationRows: string;
    monthlyEligibleAccountsWithoutCurrentGrant: string;
  };
  credits: null | { accounts: string; refundRestrictedAccounts: string };
  work: null | {
    activeOperations: string;
    overdueOperations: string;
    activeFulfillments: string;
    overdueFulfillments: string;
    pendingNotifications: string;
    dueNotificationRetries: string;
    pendingUploads: string;
    overdueUploadLeases: string;
  };
  reviewItems: string[];
}

/** Read-only inventory, including before migration. Never calls the mutating wallet read. */
export async function preflightCredits(sql: postgres.Sql, environment: CreditEnvironment): Promise<CreditPreflight> {
  if (!["sandbox", "production"].includes(environment)) throw new Error("Invalid credit environment");
  return sql.begin("isolation level repeatable read read only", async tx => {
    await tx`SET LOCAL search_path TO public`;
    const [snapshot] = await tx`SELECT now() AS now`;
    const rows = await tx`SELECT c.relname AS name, c.relrowsecurity AS rls,
      has_table_privilege(c.oid, 'SELECT') AND (
        NOT c.relrowsecurity OR r.rolsuper OR r.rolbypassrls OR
        (c.relowner = r.oid AND NOT c.relforcerowsecurity)
      ) AS readable,
      ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.oid
        AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
      EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND
        (0::oid = ANY(p.polroles) OR EXISTS (
          SELECT 1 FROM pg_roles client WHERE client.rolname IN ('anon','authenticated')
          AND (client.oid = ANY(p.polroles) OR EXISTS (
            SELECT 1 FROM unnest(p.polroles) role_id WHERE role_id <> 0
              AND pg_has_role(client.oid, role_id, 'MEMBER')
          ))
        ))) AS client_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.rolname = current_user
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname = ANY(${ALL_TABLES}::text[])
      ORDER BY c.relname`;
    const byTable = new Map(rows.map(row => [row.name as string, row]));
    const requiredColumns: Record<string, readonly string[]> = { ...BASE_COLUMNS, ...INVENTORY_COLUMNS };
    const schema = {
      missingTables: ALL_TABLES.filter(name => !byTable.has(name)),
      missingInventoryColumns: Object.entries(requiredColumns).flatMap(([name, columns]) =>
        byTable.has(name) ? columns.filter(column => !byTable.get(name)!.columns.includes(column)).map(column => `${name}.${column}`) : []),
      rlsDisabled: NEW_TABLES.filter(name => byTable.has(name) && !byTable.get(name)!.rls),
      clientPoliciesPresent: NEW_TABLES.filter(name => byTable.get(name)?.client_policy === true),
      unreadableTables: ALL_TABLES.filter(name => byTable.has(name) && !byTable.get(name)!.readable),
    };
    const canRead = (name: string) => byTable.get(name)?.readable === true &&
      !(requiredColumns[name] ?? []).some(column => !byTable.get(name)!.columns.includes(column));
    const report: CreditPreflight = {
      formatVersion: 1, environment, checkedAt: snapshot.now.toISOString(), readOnly: true,
      databaseChecksPassed: Object.values(schema).every(values => values.length === 0),
      schema, memberships: null, credits: null, work: null, reviewItems: [],
    };
    if (Object.keys(BASE_COLUMNS).every(canRead) &&
        ["credit_user_policies", "credit_benefit_claims"].every(name => !byTable.has(name) || canRead(name))) {
      const creditPolicy = canRead("credit_user_policies")
        ? tx`EXISTS (SELECT 1 FROM credit_user_policies c WHERE c.user_id = l.user_id
            AND c.environment = ${environment} AND c.billing_mode = 'credits')`
        : tx`false`;
      const monthlyClaim = canRead("credit_benefit_claims")
        ? tx`EXISTS (SELECT 1 FROM credit_benefit_claims b WHERE b.user_id = m.user_id
            AND b.environment = ${environment} AND b.kind = 'monthly'
            AND b.period = ${snapshot.now.toISOString().slice(0, 7)})`
        : tx`false`;
      const [counts] = await tx`WITH lifetime AS (
        SELECT DISTINCT user_id FROM user_lifetime_entitlements WHERE revoked_at IS NULL
      ), subscription_pro AS (
        SELECT user_id FROM user_entitlements WHERE tier = 'pro' AND storekit_revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > ${snapshot.now})
      ), grant_pro AS (
        SELECT DISTINCT user_id FROM user_entitlement_grants
          WHERE revoked_at IS NULL AND expires_at > ${snapshot.now}
      ), pro AS (
        SELECT user_id FROM subscription_pro UNION SELECT user_id FROM grant_pro
      ), members AS (
        SELECT l.user_id, p.user_id IS NOT NULL AS pro, ${creditPolicy} AS credits
        FROM lifetime l LEFT JOIN pro p USING(user_id)
      ), items AS (
        SELECT user_id, count(*) AS count FROM user_atlas_items WHERE deleted_at IS NULL GROUP BY user_id
      ) SELECT
        count(*)::text AS lifetime,
        (SELECT count(*)::text FROM pro) AS pro,
        (SELECT count(*)::text FROM subscription_pro) AS subscription_pro,
        (SELECT count(*)::text FROM grant_pro) AS grant_pro,
        count(*) FILTER (WHERE m.pro)::text AS lifetime_pro,
        (SELECT count(*)::text FROM pro p WHERE NOT EXISTS (SELECT 1 FROM lifetime l WHERE l.user_id = p.user_id)) AS pro_without_lifetime,
        count(*) FILTER (WHERE m.pro AND NOT m.credits)::text AS legacy_pro,
        count(*)::text AS replaceable,
        count(*) FILTER (WHERE m.credits)::text AS credits,
        count(*) FILTER (WHERE NOT m.credits)::text AS pending,
        count(*) FILTER (WHERE coalesce(i.count,0) = ${CREDIT_POLICY.lifetimeAtlasSlots})::text AS full,
        count(*) FILTER (WHERE coalesce(i.count,0) > ${CREDIT_POLICY.lifetimeAtlasSlots})::text AS over,
        (SELECT count(*)::text FROM atlas_ai_reservations r JOIN members m USING(user_id)
          WHERE NOT m.credits) AS reservations,
        count(*) FILTER (WHERE NOT (${monthlyClaim}))::text AS monthly_pending
        FROM members m LEFT JOIN items i USING(user_id)`;
      const sources = await tx`SELECT coalesce(source,'unknown') AS source, count(DISTINCT user_id)::text AS accounts
        FROM user_lifetime_entitlements WHERE revoked_at IS NULL GROUP BY source ORDER BY source`;
      report.memberships = {
        scope: "shared_entitlements_environment_unclassified",
        lifetimeAccounts: counts.lifetime,
        lifetimeBySource: sources.map(row => ({ source: row.source, accounts: row.accounts })),
        activeProAccounts: counts.pro, activeSubscriptionProAccounts: counts.subscription_pro,
        activeGrantProAccounts: counts.grant_pro, lifetimeWithActivePro: counts.lifetime_pro,
        activeProWithoutLifetime: counts.pro_without_lifetime,
        legacyLifetimeWithActivePro: counts.legacy_pro, replaceableLifetimeAccounts: counts.replaceable,
        alreadyCreditsLifetimeAccounts: counts.credits, pendingReplacementAccounts: counts.pending,
        atCapacityAccounts: counts.full, overCapacityAccounts: counts.over,
        legacyReservationRows: counts.reservations, monthlyEligibleAccountsWithoutCurrentGrant: counts.monthly_pending,
      };
      if (counts.pro_without_lifetime !== "0") report.reviewItems.push("active_pro_missing_lifetime_holding");
      if (counts.over !== "0") report.reviewItems.push("existing_content_over_capacity");
      if (counts.reservations !== "0") report.reviewItems.push("legacy_reservations_may_include_stale_rows");
    } else report.reviewItems.push("membership_inventory_unavailable");

    if (["credit_accounts", "credit_store_transactions", "credit_refund_resolutions"].every(canRead)) {
      const [credit] = await tx`SELECT
        (SELECT count(*)::text FROM credit_accounts WHERE environment = ${environment}) AS accounts,
        (SELECT count(DISTINCT t.user_id)::text FROM credit_store_transactions t
          WHERE t.environment = ${environment} AND ${refundReviewCondition(tx)}) AS restricted`;
      report.credits = { accounts: credit.accounts, refundRestrictedAccounts: credit.restricted };
      if (credit.restricted !== "0") report.reviewItems.push("refund_manual_review");
    }
    if (["ai_operations", "ai_fulfillments", "credit_store_notifications", "credit_image_uploads"].every(canRead)) {
      const [work] = await tx`SELECT
        (SELECT count(*)::text FROM ai_operations WHERE environment = ${environment}
          AND state IN ('reserved','running','reconciling')) AS operations,
        (SELECT count(*)::text FROM ai_operations WHERE environment = ${environment}
          AND state IN ('reserved','running','reconciling') AND reconcile_until <= ${snapshot.now}) AS overdue_operations,
        (SELECT count(*)::text FROM ai_fulfillments f JOIN ai_operations o ON o.id = f.operation_id
          WHERE o.environment = ${environment} AND f.state IN ('pending','running','reconciling')) AS fulfillments,
        (SELECT count(*)::text FROM ai_fulfillments f JOIN ai_operations o ON o.id = f.operation_id
          WHERE o.environment = ${environment} AND f.state IN ('pending','running','reconciling')
            AND f.deadline_at <= ${snapshot.now}) AS overdue_fulfillments,
        (SELECT count(*)::text FROM credit_store_notifications WHERE environment = ${environment} AND state = 'pending') AS notifications,
        (SELECT count(*)::text FROM credit_store_notifications WHERE environment = ${environment} AND state = 'pending'
          AND next_attempt_at <= ${snapshot.now}) AS due_notifications,
        (SELECT count(*)::text FROM credit_image_uploads WHERE environment = ${environment} AND state = 'pending') AS uploads,
        (SELECT count(*)::text FROM credit_image_uploads WHERE environment = ${environment} AND state = 'pending'
          AND lease_until <= ${snapshot.now}) AS overdue_uploads`;
      report.work = {
        activeOperations: work.operations, overdueOperations: work.overdue_operations,
        activeFulfillments: work.fulfillments, overdueFulfillments: work.overdue_fulfillments,
        pendingNotifications: work.notifications, dueNotificationRetries: work.due_notifications,
        pendingUploads: work.uploads, overdueUploadLeases: work.overdue_uploads,
      };
      if ([work.overdue_operations, work.overdue_fulfillments, work.due_notifications, work.overdue_uploads].some(count => count !== "0")) {
        report.reviewItems.push("worker_backlog_requires_review");
      }
    }
    return report;
  }) as Promise<CreditPreflight>;
}
