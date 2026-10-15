import { getCategoriesFromDb } from "@/lib/categories-db";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAllCardWords } from "@/lib/data";
import { getSql } from "@/lib/db";
import { AssistantError } from "../assistant/contracts";
import { rateLimiter } from "../assistant/server";
import { createAssistantUsageLog } from "../assistant/usage";
import { CreditError, userCreditConfig } from "../credits/policy";
import { createCreditWallet } from "../credits/wallet";
import { TopicChatError } from "./contracts";
import { createTopicChatModel, type TopicChatModel } from "./model";
import { createTopicChatHandler } from "./service";
import { createTopicChatStore } from "./store";

/** A category with fewer words than this cannot carry a conversation. */
export const MIN_TOPIC_WORDS = 6;

/** Off unless switched on and given a key — a deploy without either answers 404. */
const enabled = () => process.env.TOPIC_CHAT_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY);

function sqlOrThrow() {
  const sql = getSql();
  if (!sql) throw new CreditError("credits_unavailable");
  return sql;
}

let model: TopicChatModel | undefined;
const freeLimit = rateLimiter("topic-chat-free", 8, 150, "TOPIC_CHAT_FREE_DAILY_GLOBAL", 5000);
const replyLimit = rateLimiter("topic-chat-reply", 12, 400, "TOPIC_CHAT_REPLY_DAILY_GLOBAL", 10000);

export const handleTopicChatRequest = createTopicChatHandler({
  currentUserId: getCurrentUserIdFast,
  config: userCreditConfig,
  enabled,
  wallet: () => createCreditWallet(sqlOrThrow()),
  store: () => createTopicChatStore(sqlOrThrow()),
  model: () => (model ??= createTopicChatModel()),
  loadTopic: async (topicId, uiLanguage, direction) => {
    const category = (await getCategoriesFromDb(uiLanguage)).find(c => c.id === topicId);
    if (!category || topicId === "community") return null;
    const words = (await getAllCardWords(uiLanguage, direction)).filter(word => word.category === topicId);
    if (words.length < MIN_TOPIC_WORDS) return null;
    return {
      id: topicId,
      name: category.nameZh,
      nameEn: category.name || category.nameZh,
      words: words.map(word => ({ id: word.id, word: word.word, reading: word.reading, meaning: word.chinese })),
    };
  },
  topicNames: async uiLanguage => new Map((await getCategoriesFromDb(uiLanguage)).map(c => [c.id, c.nameZh])),
  rateLimit: async (userId, bucket) => {
    try {
      await (bucket === "reply" ? replyLimit : freeLimit)(userId);
    } catch (error) {
      if (!(error instanceof AssistantError)) throw error;
      throw new TopicChatError(error.code === "rate_limited" ? "rate_limited" : "assistant_unavailable", error.retryAfterSeconds);
    }
  },
  record: entry => createAssistantUsageLog(sqlOrThrow())(entry),
  reportError: () => console.error("[topic-chat] request failed"),
});
