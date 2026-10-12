import type postgres from "postgres";
import type { CreditAccount } from "../credits/wallet";
import { ASSISTANT_MODEL, ASSISTANT_PRICING, assistantCostUsd, type AssistantUsage } from "./pricing";

export interface AssistantUsageRecord {
  account: CreditAccount;
  requestId: string;
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
      (request_id, user_id, environment, model, in_scope, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, estimated_cost_usd, points_charged, pricing_version, created_at)
      VALUES (${record.requestId}, ${record.account.userId}, ${record.account.environment}, ${ASSISTANT_MODEL},
        ${record.inScope}, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.cacheReadTokens ?? 0},
        ${usage.cacheWriteTokens ?? 0}, ${assistantCostUsd(usage).toFixed(6)}, ${record.charged},
        ${ASSISTANT_PRICING.version}, ${clock()})`;
  };
}
