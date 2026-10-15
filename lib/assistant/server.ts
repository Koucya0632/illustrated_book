import { getAtlasItem, listStorySavedItems } from "@/lib/atlas-db";
import { pickAtlasGloss } from "@/lib/atlas/gloss";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAllCardWords } from "@/lib/data";
import { getSql } from "@/lib/db";
import { toZhHans } from "@/lib/opencc";
import { targetLanguageFor } from "@/lib/settings";
import { CreditError, userCreditConfig } from "../credits/policy";
import { createCreditWallet } from "../credits/wallet";
import { hitRateLimit } from "../ratelimit";
import { AssistantError } from "./contracts";
import { createAssistantHandler } from "./http";
import { createAssistantModel } from "./model";
import type { PaidDependencies } from "./paid";
import { createStoryHandler } from "./story/http";
import { createStoryModel, type StoryWord } from "./story/model";
import { createAssistantUsageLog } from "./usage";

/** Off unless switched on and given a key — a deploy without either answers 404. */
const enabled = () => process.env.ASSISTANT_AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY);

let model: ReturnType<typeof createAssistantModel> | undefined;
let storyModel: ReturnType<typeof createStoryModel> | undefined;

function sqlOrThrow() {
  const sql = getSql();
  if (!sql) throw new CreditError("credits_unavailable");
  return sql;
}

/** Per person per minute, per person per day, and the whole site per day (overridable by env). */
function rateLimiter(prefix: string, perMinute: number, perDay: number, globalEnv: string, globalDefault: number) {
  return async (userId: string) => {
    const envLimit = Number(process.env[globalEnv]);
    const global = Number.isSafeInteger(envLimit) && envLimit > 0 ? envLimit : globalDefault;
    for (const rule of [
      { bucket: `${prefix}:user-minute:${userId}`, windowSeconds: 60, limit: perMinute },
      { bucket: `${prefix}:user-day:${userId}`, windowSeconds: 86_400, limit: perDay },
      { bucket: `${prefix}:global`, windowSeconds: 86_400, limit: global },
    ]) {
      const result = await hitRateLimit({ ...rule, failClosed: true });
      if (!result.available) throw new AssistantError("assistant_unavailable");
      if (!result.ok) throw new AssistantError("rate_limited", result.retryAfterSeconds);
    }
  };
}

const shared: Omit<PaidDependencies, "rateLimit" | "reportError"> = {
  currentUserId: getCurrentUserIdFast,
  config: userCreditConfig,
  enabled,
  wallet: () => createCreditWallet(sqlOrThrow()),
  record: entry => createAssistantUsageLog(sqlOrThrow())(entry),
};

export const handleAssistantRequest = createAssistantHandler({
  ...shared,
  rateLimit: rateLimiter("assistant", 10, 300, "ASSISTANT_AI_DAILY_GLOBAL", 5000),
  loadWords: async ({ wordIds, uiLanguage, learningDirection }) => {
    if (!wordIds.length) return [];
    const wanted = new Set(wordIds);
    return (await getAllCardWords(uiLanguage, learningDirection))
      .filter(word => wanted.has(word.id))
      .map(word => ({ id: word.id, word: word.word, reading: word.reading, meaning: word.chinese }));
  },
  ask: request => (model ??= createAssistantModel())(request),
  reportError: () => console.error("[assistant] request failed"),
});

export const handleStoryRequest = createStoryHandler({
  ...shared,
  rateLimit: rateLimiter("assistant-story", 3, 50, "ASSISTANT_STORY_DAILY_GLOBAL", 2000),
  loadWords: async ({ wordIds, uiLanguage, learningDirection }, userId) => {
    const official = new Set(wordIds.filter(id => !id.startsWith("atlas:") && !id.startsWith("saved:")));
    const found = new Map<string, StoryWord>();
    if (official.size) {
      for (const word of await getAllCardWords(uiLanguage, learningDirection)) {
        if (official.has(word.id)) found.set(word.id, { id: word.id, word: word.word, reading: word.reading, meaning: word.chinese });
      }
    }
    // Only the person's own cards, in the language they are learning now.
    const target = targetLanguageFor(learningDirection);
    for (const id of wordIds.filter(id => id.startsWith("atlas:"))) {
      const item = await getAtlasItem(userId, id.slice("atlas:".length));
      if (!item || item.target_language !== target) continue;
      const gloss = pickAtlasGloss(item, uiLanguage);
      found.set(id, {
        id, word: item.lemma, reading: item.reading ?? undefined,
        meaning: uiLanguage === "zh-Hans" ? toZhHans(gloss) : gloss,
      });
    }
    // 收進 cards: saved, still public, author not blocked — see listStorySavedItems.
    const slugs = wordIds.filter(id => id.startsWith("saved:")).map(id => id.slice("saved:".length));
    for (const row of await listStorySavedItems(userId, slugs, target)) {
      const id = `saved:${row.public_slug}`;
      found.set(id, {
        id, word: row.lemma, reading: row.source_reading ?? undefined,
        meaning: uiLanguage === "zh-Hans" ? toZhHans(row.display_zh_hant) : row.display_zh_hant,
      });
    }
    return wordIds.flatMap(id => found.get(id) ?? []);
  },
  write: (request, onPart) => (storyModel ??= createStoryModel())(request, onPart),
  reportError: () => console.error("[assistant-story] request failed"),
});
