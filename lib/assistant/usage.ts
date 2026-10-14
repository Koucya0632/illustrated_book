import type postgres from "postgres";
import type { CreditAccount } from "../credits/wallet";
import { ASSISTANT_MODEL, ASSISTANT_PRICING, assistantCostUsd, type AssistantUsage } from "./pricing";

export interface AssistantUsageRecord {
  account: CreditAccount;
  requestId: string;
  /** Which paid step produced it. Absent means 問 AI, the first one. */
  feature?: "ask" | "story";
  /** The step's price list. Absent means 問 AI's. */
  pricingVersion?: string;
  /** Whether the result was chargeable: an in-scope answer, a delivered story. */
  inScope: boolean;
  usage: AssistantUsage;
  /** Points actually taken from the wallet for this answer; 0 when it was free. */
  charged: number;
}

/** Writes one `assistant_usage` row. The model, the price list and the cost are stamped here. */
export function createAssistantUsageLog(sql: postgres.Sql, clock: () => Date = () => new Date()) {
  return async (record: AssistantUsageRecord): Promise<void> => {
    const { usage } = record;
    await sql`INSERT INTO assistant_usage
      (request_id, user_id, environment, feature, model, in_scope, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, estimated_cost_usd, points_charged, pricing_version, created_at)
      VALUES (${record.requestId}, ${record.account.userId}, ${record.account.environment},
        ${record.feature ?? "ask"}, ${ASSISTANT_MODEL},
        ${record.inScope}, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.cacheReadTokens ?? 0},
        ${usage.cacheWriteTokens ?? 0}, ${assistantCostUsd(usage).toFixed(6)}, ${record.charged},
        ${record.pricingVersion ?? ASSISTANT_PRICING.version}, ${clock()})`;
  };
}
