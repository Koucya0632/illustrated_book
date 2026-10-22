import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;

const number = (field: string) =>
  `CASE WHEN jsonb_typeof(a.usage->'${field}') = 'number' THEN (a.usage->>'${field}')::numeric END`;

/**
 * The 用量紀錄 row of settled 識別操作 (CONTEXT.md): one per operation, its
 * recognition and supplement attempts summed — the person bought one
 * recognition, so its retries are its cost — carrying the points it kept after
 * any compensation. Recomputed whole from the attempts, so repeating it, at a
 * later settlement or as a backfill, only brings the row up to date.
 */
function upsert(sql: Sql, which: postgres.PendingQuery<postgres.Row[]>) {
  return sql`INSERT INTO assistant_usage (request_id, user_id, environment, feature, model, in_scope,
      input_tokens, output_tokens, estimated_cost_usd, points_charged, pricing_version, created_at)
    SELECT o.id, o.user_id, o.environment, 'capture',
      coalesce(o.result->'recognition'->>'model', o.staged_result->>'model', 'unknown'),
      o.state = 'committed',
      coalesce(u.input_tokens, 0), coalesce(u.output_tokens, 0), coalesce(u.cost_usd, 0),
      CASE WHEN o.state = 'committed' AND o.fulfillment_state <> 'compensated' THEN o.points ELSE 0 END,
      o.price_version, o.created_at
    FROM ai_operations o
    CROSS JOIN LATERAL (
      SELECT round(sum(${sql.unsafe(number("inputTokens"))}))::int AS input_tokens,
        round(sum(${sql.unsafe(number("outputTokens"))}))::int AS output_tokens,
        round(sum(${sql.unsafe(number("estimatedCostUsd"))}), 6) AS cost_usd
      FROM (SELECT usage FROM ai_operation_attempts WHERE operation_id = o.id
        UNION ALL SELECT usage FROM ai_fulfillment_attempts WHERE operation_id = o.id) a
    ) u
    WHERE o.state IN ('committed', 'released') AND ${which}
    ON CONFLICT (request_id) WHERE feature = 'capture' DO UPDATE SET
      model = EXCLUDED.model, in_scope = EXCLUDED.in_scope,
      input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
      estimated_cost_usd = EXCLUDED.estimated_cost_usd, points_charged = EXCLUDED.points_charged`;
}

/**
 * Called inside the transaction that settles the operation or its included
 * supplement. Like 助手's row, a failed write never costs the person the
 * settlement: it rolls back to its savepoint and is only logged — the next
 * settlement or a backfill rewrites the row.
 */
export async function recordCaptureUsage(sql: postgres.TransactionSql, operationId: string): Promise<void> {
  try {
    await sql.savepoint(sp => upsert(sp, sp`o.id = ${operationId}`));
  } catch (error) {
    console.error("[capture-usage] write failed", operationId, error);
  }
}

/**
 * Every settled operation that has no row: those settled before 用量紀錄
 * covered 拍照做卡, and any whose write failed. Run on each deploy.
 */
export async function backfillCaptureUsage(sql: postgres.Sql): Promise<number> {
  const rows = await upsert(sql, sql`NOT EXISTS (SELECT 1 FROM assistant_usage r
    WHERE r.feature = 'capture' AND r.request_id = o.id)`);
  return rows.count;
}
