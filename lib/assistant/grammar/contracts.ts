import { z } from "zod";
import { usagePoints } from "../pricing";
import type { AssistantUsage } from "../pricing";

export const GRAMMAR_VERSION = "grammar-2026-10-v1";
export const modes = ["explain", "compare", "practice"] as const;
export type GrammarMode = typeof modes[number];
// Ceilings from sampled token use (scripts/sample-grammar.ts); a practice set is the longest card.
export const PRICES = {
  explain: { minPoints: 1, maxPoints: 8 },
  compare: { minPoints: 1, maxPoints: 10 },
  practice: { minPoints: 1, maxPoints: 20 },
} as const;
export const MAX_POINTS = Math.max(...Object.values(PRICES).map(price => price.maxPoints));
export const pointsFor = (mode: GrammarMode, usage: AssistantUsage) => usagePoints(usage, PRICES[mode]);
const text = (max: number) => z.string().trim().min(1).max(max);
export const inputSchema = z.object({
  requestId: z.string().uuid().transform(value => value.toLowerCase()),
  mode: z.enum(modes),
  /** A grammar point, a pattern, a whole sentence or a question about one. */
  query: text(800).regex(/[\p{L}\p{N}]/u),
  context: z.string().trim().max(800).default(""),
  /** 近似語法: B, when the person named it. Empty lets Moira pick a real look-alike. */
  compareWith: z.string().trim().max(120).default(""),
  /** The grammar point chosen from a clarification. */
  focus: z.string().trim().max(120).default(""),
  difficulty: z.enum(["basic", "advanced"]).default("basic"),
  practiceType: z.enum(["mixed", "choice", "context"]).default("mixed"),
  /** The card a next step was drafted from, so the path can be traced back. */
  sourceRecordId: z.string().uuid().transform(value => value.toLowerCase()).nullable().default(null),
  uiLanguage: z.enum(["zh-Hant", "zh-Hans", "ja", "en"]),
  learningDirection: z.enum(["zh-en", "zh-ja"]),
  pricingVersion: text(80), maxPoints: z.number().int().min(1).max(MAX_POINTS),
}).strict();
export type GrammarInput = z.infer<typeof inputSchema>;

export const lineSchema = z.object({
  text: text(500), reading: text(700).nullable(), translation: text(700).nullable(), note: text(500).nullable(),
}).strict();
const pointSchema = z.object({ name: text(120), meaning: text(300) }).strict();

export const explanationSchema = z.object({
  mode: z.literal("explain"),
  summary: z.object({ name: text(120), meaning: text(300), explanation: text(600),
    /** The part of the pasted sentence this card is about. */
    highlight: text(200).nullable() }).strict(),
  structure: z.object({
    formula: text(200),
    parts: z.array(z.object({ part: text(120), role: text(300) }).strict()).min(1).max(5),
    /** The pasted sentence, taken apart with the formula. */
    breakdown: text(600).nullable(),
    forms: text(600).nullable(),
  }).strict(),
  rules: z.array(z.object({ title: text(100), explanation: text(600) }).strict()).min(2).max(4),
  examples: z.array(lineSchema).length(3),
  scenes: z.array(z.object({ situation: text(200), use: text(500), avoid: text(500).nullable() }).strict()).length(2),
}).strict();

export const verdicts = ["interchangeable", "conditional", "not"] as const;
export const comparisonSchema = z.object({
  mode: z.literal("compare"),
  a: pointSchema, b: pointSchema,
  /** Why Moira chose B when the person named only A; null when they named both. */
  chosenBecause: text(300).nullable(),
  summary: text(400),
  similarity: z.object({ shared: text(500), aFocus: text(400), bFocus: text(400),
    interchangeable: z.enum(verdicts) }).strict(),
  dimensions: z.array(z.object({ aspect: text(60), a: text(400), b: text(400) }).strict()).min(3).max(4),
  pitfalls: z.array(z.object({ wrong: text(300), fixed: text(300),
    kind: z.enum(["grammar", "meaning", "register", "unnatural"]), reason: text(500) }).strict()).min(1).max(2),
  substitutions: z.array(z.object({ situation: text(200), a: lineSchema, b: lineSchema,
    verdict: z.enum(verdicts), explanation: text(500) }).strict()).min(1).max(2),
}).strict();

export const questionSchema = z.object({
  id: text(20), kind: z.enum(["choice", "context"]),
  /** 語境判斷: who, when and why. Null for a single-sentence choice. */
  context: text(500).nullable(),
  prompt: text(400),
  options: z.array(z.object({ id: text(8), text: text(300) }).strict()).length(4),
  /** The prompt with the right option in place, written before the key so the key is checked against it. */
  solution: text(500),
  answer: text(8),
  explanations: z.array(z.object({ optionId: text(8), reason: text(500) }).strict()).length(4),
  point: text(300),
}).strict();
export const practiceSchema = z.object({
  mode: z.literal("practice"),
  focus: text(200),
  difficulty: z.enum(["basic", "advanced"]),
  questions: z.array(questionSchema).length(5),
  takeaways: z.array(text(300)).min(1).max(3),
}).strict();
export const contentSchema = z.discriminatedUnion("mode", [explanationSchema, comparisonSchema, practiceSchema]);
export type GrammarContent = z.infer<typeof contentSchema>;
/** A clarification offers grammar points to focus on; choosing one only fills the draft. */
export const candidateSchema = z.object({ focus: text(120), description: text(300) }).strict();
export const modelReplySchema = z.object({
  outcome: z.enum(["completed", "clarification", "invalid"]),
  message: z.string().max(600), candidates: z.array(candidateSchema).max(3),
  content: contentSchema.nullable(),
}).strict();
export type GrammarReply = z.infer<typeof modelReplySchema>;
export type GrammarStatus = "pending" | "completed" | "clarification" | "failed" | "deleted";
export interface GrammarRecord {
  id: string; status: GrammarStatus; input: GrammarInput | null;
  result: GrammarReply | null; charged: number; favorite: boolean;
  createdAt: string; templateVersion: string; error: string | null;
}
export class GrammarError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
