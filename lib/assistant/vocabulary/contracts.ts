import { z } from "zod";
import { usagePoints } from "../pricing";
import type { AssistantUsage } from "../pricing";

export const VOCABULARY_VERSION = "vocabulary-2026-10-v1";
export const modes = ["lookup", "analysis", "mnemonic"] as const;
export type VocabularyMode = typeof modes[number];
export const PRICES = {
  lookup: { minPoints: 1, maxPoints: 5 },
  analysis: { minPoints: 1, maxPoints: 10 },
  mnemonic: { minPoints: 1, maxPoints: 5 },
} as const;
export const pointsFor = (mode: VocabularyMode, usage: AssistantUsage) => usagePoints(usage, PRICES[mode]);
const text = (max: number) => z.string().trim().min(1).max(max);
export const inputSchema = z.object({
  requestId: z.string().uuid().transform(value => value.toLowerCase()),
  mode: z.enum(modes), query: text(120).regex(/[\p{L}\p{N}]/u),
  context: z.string().trim().max(800).default(""),
  selectedSense: z.string().trim().max(300).default(""),
  uiLanguage: z.enum(["zh-Hant", "zh-Hans", "ja", "en"]),
  learningDirection: z.enum(["zh-en", "zh-ja"]),
  pricingVersion: text(80), maxPoints: z.number().int().min(1).max(10),
}).strict();
export type VocabularyInput = z.infer<typeof inputSchema>;

export const lineSchema = z.object({
  text: text(500), reading: text(700).nullable(), translation: text(700).nullable(), note: text(500).nullable(),
}).strict();
const headwordSchema = z.object({ text: text(120), reading: text(200).nullable(), partOfSpeech: text(80), meaning: text(300) }).strict();
const senseSchema = z.object({ term: text(120), meaning: text(300), explanation: text(600), relevant: z.boolean() }).strict();
export const lookupSchema = z.object({
  mode: z.literal("lookup"), headword: headwordSchema,
  senses: z.array(senseSchema).min(1).max(3),
  expressions: z.array(lineSchema).min(1).max(3),
  related: z.array(z.object({ term: text(120), relation: text(400) }).strict()).max(3),
}).strict();
export const analysisSchema = z.object({
  mode: z.literal("analysis"), headword: headwordSchema,
  comparisons: z.array(z.object({ term: text(120), difference: text(700), whenToUse: text(500), examples: z.array(lineSchema).min(1).max(2) }).strict()).max(3),
  usage: z.array(z.object({ title: text(100), explanation: text(700) }).strict()).min(1).max(3),
  examples: z.array(lineSchema).min(1).max(3),
  collocations: z.array(z.object({ phrase: text(180), meaning: text(400), pattern: text(300) }).strict()).min(1).max(4),
}).strict();
export const mnemonicSchema = z.object({
  mode: z.literal("mnemonic"), headword: headwordSchema,
  association: text(1000), technique: text(700), retelling: text(300), example: lineSchema,
  quiz: z.object({ question: text(400), answer: text(300), hint: text(400) }).strict(),
}).strict();
export const contentSchema = z.discriminatedUnion("mode", [lookupSchema, analysisSchema, mnemonicSchema]);
export type VocabularyContent = z.infer<typeof contentSchema>;
export const candidateSchema = z.object({ term: text(120), meaning: text(300) }).strict();
export const modelReplySchema = z.object({
  outcome: z.enum(["completed", "clarification", "invalid"]),
  message: z.string().max(600), candidates: z.array(candidateSchema).max(3),
  content: contentSchema.nullable(),
}).strict();
export type VocabularyReply = z.infer<typeof modelReplySchema>;
export type VocabularyStatus = "pending" | "completed" | "clarification" | "failed" | "deleted";
export interface VocabularyRecord {
  id: string; status: VocabularyStatus; input: VocabularyInput | null;
  result: VocabularyReply | null; charged: number; favorite: boolean;
  createdAt: string; templateVersion: string; error: string | null;
}
export class VocabularyError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
