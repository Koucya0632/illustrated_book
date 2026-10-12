import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAllCardWords } from "@/lib/data";
import { getSql } from "@/lib/db";
import { CreditError, userCreditConfig } from "../credits/policy";
import { createCreditWallet } from "../credits/wallet";
import { hitRateLimit } from "../ratelimit";
import { AssistantError } from "./contracts";
import { createAssistantHandler } from "./http";
import { createAssistantModel } from "./model";
import { createAssistantUsageLog } from "./usage";

/** Off unless switched on and given a key — a deploy without either answers 404. */
const enabled = () => process.env.ASSISTANT_AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY);

let model: ReturnType<typeof createAssistantModel> | undefined;

export const handleAssistantRequest = createAssistantHandler({
  currentUserId: getCurrentUserIdFast,
  config: userCreditConfig,
  enabled,
  wallet: () => {
    const sql = getSql();
    if (!sql) throw new CreditError("credits_unavailable");
    return createCreditWallet(sql);
  },
  rateLimit: async userId => {
    const envLimit = Number(process.env.ASSISTANT_AI_DAILY_GLOBAL);
    const global = Number.isSafeInteger(envLimit) && envLimit > 0 ? envLimit : 5000;
    for (const rule of [
      { bucket: `assistant:user-minute:${userId}`, windowSeconds: 60, limit: 10 },
      { bucket: `assistant:user-day:${userId}`, windowSeconds: 86_400, limit: 300 },
      { bucket: "assistant:global", windowSeconds: 86_400, limit: global },
    ]) {
      const result = await hitRateLimit({ ...rule, failClosed: true });
      if (!result.available) throw new AssistantError("assistant_unavailable");
      if (!result.ok) throw new AssistantError("rate_limited", result.retryAfterSeconds);
    }
  },
  loadWords: async ({ wordIds, uiLanguage, learningDirection }) => {
    if (!wordIds.length) return [];
    const wanted = new Set(wordIds);
    return (await getAllCardWords(uiLanguage, learningDirection))
      .filter(word => wanted.has(word.id))
      .map(word => ({ id: word.id, word: word.word, reading: word.reading, meaning: word.chinese }));
  },
  ask: request => (model ??= createAssistantModel())(request),
  record: entry => {
    const sql = getSql();
    if (!sql) throw new CreditError("credits_unavailable");
    return createAssistantUsageLog(sql)(entry);
  },
  reportError: () => console.error("[assistant] request failed"),
});
