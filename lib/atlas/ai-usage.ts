// Token + cost accounting for OpenAI calls, feeding user_atlas_ai_usage (read by
// the admin 圖鑑數據 page). Kept free of server-only imports so it can be tested.

// USD per 1M tokens (input, output). Longest-prefix entries ("-mini" /
// "-nano") must come before their base model. Unknown models just skip the
// estimate.
const MODEL_PRICES_PER_MTOK: Array<[prefix: string, input: number, output: number]> = [
  ["gpt-4o-mini", 0.15, 0.6],
  ["gpt-4o", 2.5, 10],
  ["gpt-4.1-mini", 0.4, 1.6],
  ["gpt-4.1-nano", 0.1, 0.4],
  ["gpt-4.1", 2, 8],
  ["gpt-5-mini", 0.25, 2],
  ["gpt-5-nano", 0.05, 0.4],
  ["gpt-5", 1.25, 10],
];

export function estimateOpenAiCostUsd(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | undefined {
  const price = MODEL_PRICES_PER_MTOK.find(([prefix]) => model.startsWith(prefix));
  if (!price || (inputTokens == null && outputTokens == null)) return undefined;
  const usd = ((inputTokens ?? 0) * price[1] + (outputTokens ?? 0) * price[2]) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

export interface AiCallUsage {
  modelId: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
}

export interface AiUsageSummary {
  calls: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | undefined;
}

/// Collects the usage of several model calls that make up one logical pass,
/// so the pass is logged as a single row.
export function createAiUsageTally() {
  const calls: AiCallUsage[] = [];
  return {
    add(call: AiCallUsage) {
      calls.push(call);
    },
    summary(): AiUsageSummary | null {
      if (calls.length === 0) return null;
      let cost: number | undefined;
      for (const c of calls) {
        const one = estimateOpenAiCostUsd(c.modelId, c.inputTokens, c.outputTokens);
        if (one != null) cost = (cost ?? 0) + one;
      }
      return {
        calls: calls.length,
        model: calls[0].modelId,
        inputTokens: calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
        outputTokens: calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
        estimatedCostUsd: cost == null ? undefined : Math.round(cost * 1e6) / 1e6,
      };
    },
  };
}

export type AiUsageTally = ReturnType<typeof createAiUsageTally>;
