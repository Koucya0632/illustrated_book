import type postgres from "postgres";
import { refundReviewCondition } from "./refund-review";

/** One read-only snapshot. Estimates include known attempts, including retries. */
export async function creditOperationsReport(sql: postgres.Sql, now = new Date(), dailyBudgetUsd = 10) {
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd <= 0) throw new Error("invalid budget");
  return sql.begin("isolation level repeatable read read only", async tx => {
    const rows = await tx`WITH environments(environment) AS (VALUES ('production'), ('sandbox')),
      attempts AS (
        SELECT o.environment,a.usage,a.started_at FROM ai_operation_attempts a JOIN ai_operations o ON o.id=a.operation_id
        UNION ALL
        SELECT o.environment,a.usage,a.started_at FROM ai_fulfillment_attempts a JOIN ai_operations o ON o.id=a.operation_id
      ) SELECT e.environment,
        (SELECT count(*) FROM ai_operations o WHERE o.environment=e.environment AND o.state IN ('reserved','running','reconciling')) AS operations_pending,
        (SELECT count(*) FROM ai_operations o WHERE o.environment=e.environment AND o.state IN ('reserved','running','reconciling') AND o.created_at < ${now}::timestamptz-INTERVAL '5 minutes') AS operations_delayed,
        (SELECT count(*) FROM ai_fulfillments f JOIN ai_operations o ON o.id=f.operation_id WHERE o.environment=e.environment AND f.state IN ('pending','running','reconciling')) AS fulfillments_pending,
        (SELECT count(*) FROM ai_fulfillments f JOIN ai_operations o ON o.id=f.operation_id WHERE o.environment=e.environment AND f.state IN ('pending','running','reconciling') AND f.created_at < ${now}::timestamptz-INTERVAL '5 minutes') AS fulfillments_delayed,
        (SELECT count(*) FROM credit_store_notifications n WHERE n.environment=e.environment AND n.state='pending') AS notifications_pending,
        (SELECT count(*) FROM credit_store_notifications n WHERE n.environment=e.environment AND n.state='pending' AND (n.attempts>=3 OR n.created_at < ${now}::timestamptz-INTERVAL '10 minutes')) AS notifications_delayed,
        (SELECT count(DISTINCT t.user_id) FROM credit_store_transactions t WHERE t.environment=e.environment AND ${refundReviewCondition(tx)}) AS refund_review_accounts,
        (SELECT count(*) FROM attempts a WHERE a.environment=e.environment AND a.started_at >= ${now}::timestamptz-INTERVAL '24 hours') AS attempts_24h,
        (SELECT count(*) FROM attempts a WHERE a.environment=e.environment AND a.started_at >= ${now}::timestamptz-INTERVAL '24 hours' AND jsonb_typeof(a.usage->'estimatedCostUsd') IS DISTINCT FROM 'number') AS attempts_without_cost,
        (SELECT coalesce(sum(CASE WHEN jsonb_typeof(a.usage->'estimatedCostUsd')='number' THEN (a.usage->>'estimatedCostUsd')::numeric ELSE 0 END),0) FROM attempts a WHERE a.environment=e.environment AND a.started_at >= ${now}::timestamptz-INTERVAL '24 hours') AS estimated_cost_usd
      FROM environments e`;
    return { generatedAt: now.toISOString(), windowHours: 24, dailyBudgetUsd,
      environments: rows.map(row => {
        const keys = ["operations_pending", "operations_delayed", "fulfillments_pending", "fulfillments_delayed",
          "notifications_pending", "notifications_delayed", "refund_review_accounts", "attempts_24h",
          "attempts_without_cost", "estimated_cost_usd"] as const;
        const values = Object.fromEntries(keys.map(key => [key, Number(row[key])])) as Record<typeof keys[number], number>;
        if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) throw new Error("invalid report");
        return { environment: String(row.environment), ...values,
          alert: values.operations_delayed > 0 || values.fulfillments_delayed > 0 || values.notifications_delayed > 0 || values.estimated_cost_usd >= dailyBudgetUsd };
      }),
    };
  });
}
