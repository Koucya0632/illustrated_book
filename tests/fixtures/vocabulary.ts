import { randomUUID } from "node:crypto";
import { inputSchema, VOCABULARY_VERSION, PRICES, type VocabularyMode, type VocabularyReply } from "../../lib/assistant/vocabulary/contracts";
export const sampleInput = (mode: VocabularyMode = "lookup", overrides: Record<string, unknown> = {}) => inputSchema.parse({
  requestId: randomUUID(), mode, query: "borrow", context: "", selectedSense: "", uiLanguage: "zh-Hant",
  learningDirection: "zh-en", pricingVersion: VOCABULARY_VERSION, maxPoints: PRICES[mode].maxPoints, ...overrides,
});
export const sampleUsage = { inputTokens: 2000, outputTokens: 900 };
export function sampleReply(mode: VocabularyMode = "lookup"): VocabularyReply {
  const headword = { text: "borrow", reading: null, partOfSpeech: "動詞", meaning: "借入，暫時拿來使用後歸還。" };
  const line = { text: "Can I borrow your pen?", reading: null, translation: "我可以借你的筆嗎？", note: "借用對方的物品。" };
  const content = mode === "lookup" ? { mode, headword,
    senses: [{ term: "borrow", meaning: "借入", explanation: "主詞是借用物品的人。", relevant: true }], expressions: [line],
    related: [{ term: "lend", relation: "借出：主詞是提供物品的人。" }] }
    : mode === "analysis" ? { mode, headword,
      comparisons: [{ term: "lend", difference: "borrow 是借入，lend 是借出。", whenToUse: "借用別人的東西用 borrow。", examples: [line] }],
      usage: [{ title: "borrow ... from", explanation: "from 後面接出借者。" }], examples: [line],
      collocations: [{ phrase: "borrow a book", meaning: "借一本書", pattern: "borrow + 物品" }] }
      : { mode, headword, association: "想像一本書從朋友手上來到你手裡，之後你會還回去。", technique: "用動作方向記：borrow 是借進來。",
        retelling: "我把書借進來，就是 borrow。", example: line,
        quiz: { question: "向朋友借筆，選 borrow 還是 lend？", answer: "borrow", hint: "想想筆來到誰手上。" } };
  return { outcome: "completed", message: "", candidates: [], content };
}
