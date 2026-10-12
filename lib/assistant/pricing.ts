// What one 助手 answer costs, in 罐頭點數.
//
// The price follows the tokens the model actually used, between a floor and a
// ceiling. The ceiling is what makes a usage-based price sayable in advance —
// the app can tell someone "1–5 點" before they send, which a pure per-token
// price cannot. Kept free of server-only imports so it can be tested.

/** Claude Haiku 5.5, prompts up to 100K tokens. USD per 1M tokens. */
export const ASSISTANT_MODEL = "claude-haiku-5-5";

export const ASSISTANT_PRICING = {
  version: "assistant-2026-10",
  inputUsdPerMTok: 0.1,
  outputUsdPerMTok: 0.5,
  /** Cache reads are 0.1x input; 5-minute cache writes are 1.25x. */
  cacheReadUsdPerMTok: 0.01,
  cacheWriteUsdPerMTok: 0.125,
  /** Model cost is multiplied by this before it becomes points. */
  markup: 3,
  /**
   * What a point is worth: the cheapest rate a point is sold at (7,000 for
   * US$4.99), before the store's cut. Using the lowest rate keeps every pack
   * above cost.
   */
  pointUsd: 0.0007,
  minPoints: 1,
  maxPoints: 5,
} as const;

export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function assistantCostUsd(usage: AssistantUsage): number {
  const p = ASSISTANT_PRICING;
  return (
    usage.inputTokens * p.inputUsdPerMTok +
    usage.outputTokens * p.outputUsdPerMTok +
    (usage.cacheReadTokens ?? 0) * p.cacheReadUsdPerMTok +
    (usage.cacheWriteTokens ?? 0) * p.cacheWriteUsdPerMTok
  ) / 1_000_000;
}

/** Points for one answer: cost × markup, rounded up, held to the floor and ceiling. */
export function assistantPoints(usage: AssistantUsage): number {
  const p = ASSISTANT_PRICING;
  const raw = Math.ceil((assistantCostUsd(usage) * p.markup) / p.pointUsd);
  if (!Number.isFinite(raw)) return p.maxPoints;
  return Math.min(p.maxPoints, Math.max(p.minPoints, raw));
}
