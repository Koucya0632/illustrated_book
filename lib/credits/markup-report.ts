import type postgres from "postgres";
import { ASSISTANT_PRICING } from "../assistant/pricing";

/** Below this many runs a feature's 實際倍率 is shown but not judged. */
export const MARKUP_MIN_RUNS = 50;
export const MARKUP_WINDOW_DAYS = 30;

export interface MarkupRow {
  feature: string;
  pricingVersion: string;
  runs: number;
  /** Runs the model made that took no points: off-topic, a dropped word, a retry, a release, a compensation. */
  unchargedRuns: number;
  costUsd: number;
  points: number;
  /** null when nothing was spent on the model. */
  markup: number | null;
  verdict: "ok" | "below" | "too_few";
}

/**
 * 實際倍率 (CONTEXT.md) per feature × price list, read from 用量紀錄: the points
 * taken, valued at the cheapest rate a point is sold at, over what every run
 * cost — the uncharged ones included. Production only; read against the
 * designed markup. Also this UTC month's 助手 cost, to hold against the
 * Anthropic bill: 拍照做卡 is left out of that figure because its providers
 * bill separately.
 */
export async function realisedMarkupReport(sql: postgres.Sql, now = new Date()) {
  const since = new Date(now.getTime() - MARKUP_WINDOW_DAYS * 24 * 60 * 60_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return sql.begin("isolation level repeatable read read only", async tx => {
    const rows = await tx`SELECT feature, pricing_version, count(*) AS runs,
        count(*) FILTER (WHERE points_charged = 0) AS uncharged_runs,
        coalesce(sum(estimated_cost_usd), 0) AS cost_usd, coalesce(sum(points_charged), 0) AS points
      FROM assistant_usage WHERE environment = 'production' AND created_at >= ${since} AND created_at <= ${now}
      GROUP BY feature, pricing_version ORDER BY feature, pricing_version`;
    const [month] = await tx`SELECT coalesce(sum(estimated_cost_usd), 0) AS cost_usd FROM assistant_usage
      WHERE environment = 'production' AND feature <> 'capture' AND created_at >= ${monthStart} AND created_at <= ${now}`;
    return {
      generatedAt: now.toISOString(), windowDays: MARKUP_WINDOW_DAYS, minRuns: MARKUP_MIN_RUNS,
      target: ASSISTANT_PRICING.markup, pointUsd: ASSISTANT_PRICING.pointUsd,
      monthStart: monthStart.toISOString(), assistantMonthCostUsd: Number(month.cost_usd),
      rows: rows.map((row): MarkupRow => {
        const runs = Number(row.runs), costUsd = Number(row.cost_usd), points = Number(row.points);
        const markup = costUsd > 0 ? (points * ASSISTANT_PRICING.pointUsd) / costUsd : null;
        const verdict = runs < MARKUP_MIN_RUNS ? "too_few" : markup !== null && markup < ASSISTANT_PRICING.markup ? "below" : "ok";
        return { feature: String(row.feature), pricingVersion: String(row.pricing_version), runs,
          unchargedRuns: Number(row.uncharged_runs), costUsd, points, markup, verdict };
      }),
    };
  });
}
