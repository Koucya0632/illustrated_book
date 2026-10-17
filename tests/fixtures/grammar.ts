import { randomUUID } from "node:crypto";
import { inputSchema, modelReplySchema, GRAMMAR_VERSION, PRICES, type GrammarMode, type GrammarReply } from "../../lib/assistant/grammar/contracts";
export const sampleInput = (mode: GrammarMode = "explain", overrides: Record<string, unknown> = {}) => inputSchema.parse({
  requestId: randomUUID(), mode, query: "〜たことがある", context: "", compareWith: "", focus: "",
  difficulty: "basic", practiceType: "mixed", sourceRecordId: null, uiLanguage: "zh-Hant",
  learningDirection: "zh-ja", pricingVersion: GRAMMAR_VERSION, maxPoints: PRICES[mode].maxPoints, ...overrides,
});
export const sampleUsage = { inputTokens: 2500, outputTokens: 1500 };
const line = (text: string, reading: string | null, translation: string, note: string | null = null) =>
  ({ text, reading, translation, note });

function question(index: number, kind: "choice" | "context") {
  const answer = ["a", "b", "c", "d"][index % 4];
  return {
    id: `q${index + 1}`, kind,
    context: kind === "context" ? "朋友問你有沒有去過北海道，你去年去過一次。" : null,
    prompt: kind === "context" ? "最自然的回答是哪一句？" : "日本に（　）ことがあります。",
    options: ["a", "b", "c", "d"].map(id => ({ id, text: id === answer ? "行った" : `行く${id}` })),
    solution: kind === "context" ? "行った" : "日本に行ったことがあります。",
    answer,
    explanations: ["a", "b", "c", "d"].map(optionId => ({ optionId,
      reason: optionId === answer ? "經驗要用た形接ことがある。" : "辭書形接ことがある是「有時會」。" })),
    point: "說經驗：動詞た形＋ことがある。",
  };
}

export function sampleReply(mode: GrammarMode = "explain"): GrammarReply {
  const content = mode === "explain" ? {
    mode, summary: { name: "〜たことがある", meaning: "表示曾經有過的經驗", explanation: "說自己或別人過去做過某件事的經驗。", highlight: null },
    structure: { formula: "動詞た形 ＋ ことがある", parts: [{ part: "動詞た形", role: "過去做過的動作" }, { part: "ことがある", role: "表示有這樣的經驗" }],
      breakdown: null, forms: "行く → 行った、食べる → 食べた" },
    rules: [{ title: "說的是經驗", explanation: "不用在昨天剛做的事。" }, { title: "否定", explanation: "〜たことがない 表示從來沒有。" }],
    examples: [line("日本に行ったことがあります。", "にほんにいったことがあります。", "我去過日本。", "最基本的經驗句。"),
      line("寿司を食べたことがない。", "すしをたべたことがない。", "我沒吃過壽司。", "否定形。"),
      line("富士山に登ったことがありますか。", null, "你爬過富士山嗎？", "問對方的經驗。")],
    scenes: [{ situation: "自我介紹", use: "說自己去過的地方。", avoid: null },
      { situation: "聊旅行", use: "問對方有沒有去過。", avoid: "說今天早上做的事不用這個句型。" }],
  } : mode === "compare" ? {
    mode, a: { name: "〜たことがある", meaning: "曾經有過的經驗" }, b: { name: "〜ことがある", meaning: "有時會發生" },
    chosenBecause: "兩者只差一個た形，初學者很容易混淆。", summary: "前者說過去的經驗，後者說偶爾會發生的事。",
    similarity: { shared: "都用ことがある結尾。", aFocus: "過去有沒有經驗。", bFocus: "現在偶爾會發生。", interchangeable: "not" },
    dimensions: [{ aspect: "接續", a: "動詞た形", b: "動詞辭書形" }, { aspect: "意思", a: "經驗", b: "有時候" },
      { aspect: "時間", a: "過去", b: "習慣、現在" }],
    pitfalls: [{ wrong: "昨日、映画を見たことがある。", fixed: "昨日、映画を見た。", kind: "meaning", reason: "昨天的單一事件不是經驗。" }],
    substitutions: [{ situation: "談吃納豆", a: line("納豆を食べたことがある。", null, "我吃過納豆。"),
      b: line("納豆を食べることがある。", null, "我有時會吃納豆。"), verdict: "not", explanation: "換了意思就變了。" }],
  } : {
    mode, focus: "〜たことがある", difficulty: "basic" as const,
    questions: [question(0, "choice"), question(1, "choice"), question(2, "choice"), question(3, "context"), question(4, "context")],
    takeaways: ["經驗用た形＋ことがある。"],
  };
  return modelReplySchema.parse({ outcome: "completed", message: "", candidates: [], content });
}
