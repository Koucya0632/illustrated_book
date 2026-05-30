import "server-only";
import { generateObject } from "ai";
import { z } from "zod";

// AI-powered zh-Hant → ja translation for dictionary content. Mirrors the
// shape of lib/enrich.ts — runs through the Vercel AI Gateway using a
// "creator/model" string and AI_GATEWAY_API_KEY. Model overridable via
// TRANSLATE_MODEL.
const MODEL = process.env.TRANSLATE_MODEL || "anthropic/claude-sonnet-4-6";

// ---- Per-word batch translation (definition + etymology + note + examples) ----

export interface TranslateWordInput {
  word: string;
  chineseDef: string;
  etymology?: string;
  note?: string;
  examples: { en: string; zh: string }[];
}

export const TranslatedWordSchema = z.object({
  definition: z.string().describe("Japanese translation of the Chinese definition"),
  etymology: z
    .string()
    .nullable()
    .optional()
    .describe("Japanese translation of the etymology — null if no etymology was provided"),
  note: z
    .string()
    .nullable()
    .optional()
    .describe("Japanese translation of the note — null if no note was provided"),
  examples: z
    .array(z.string())
    .describe("Japanese translations of each example sentence, in the same order as the input"),
});

export type TranslatedWord = z.infer<typeof TranslatedWordSchema>;

const WORD_SYSTEM =
  "You translate Traditional Chinese (zh-Hant) text into natural, idiomatic Japanese for a picture " +
  "dictionary used by Japanese-speaking English learners. Output concise, natural Japanese using the " +
  "conventional everyday vocabulary (e.g., 冰箱 → 冷蔵庫, 廚房 → キッチン, 微波爐 → 電子レンジ). " +
  "Definitions should be short noun phrases or single words, matching dictionary style. Example " +
  "translations should be natural Japanese sentences that convey the same meaning as the Chinese, " +
  "not literal word-for-word translations. If the etymology or note input is empty, return null " +
  "for that field.";

export async function translateWordToJa(input: TranslateWordInput): Promise<TranslatedWord> {
  const exampleLines = input.examples
    .map((e, i) => `${i + 1}. EN: ${e.en}\n   ZH: ${e.zh}`)
    .join("\n");
  const { object } = await generateObject({
    model: MODEL,
    schema: TranslatedWordSchema,
    system: WORD_SYSTEM,
    prompt:
      `English word: ${input.word}\n` +
      `Chinese definition (zh-Hant): ${input.chineseDef}\n` +
      (input.etymology ? `Etymology (zh-Hant): ${input.etymology}\n` : "Etymology: (none)\n") +
      (input.note ? `Note (zh-Hant): ${input.note}\n` : "Note: (none)\n") +
      (exampleLines ? `Examples:\n${exampleLines}\n` : "Examples: (none)\n") +
      `\nReturn: definition (ja), etymology (ja or null), note (ja or null), ` +
      `examples (array of ja strings, one per example, same order).`,
  });
  return object;
}

// ---- Category name translation ----

const CategoryNameSchema = z.object({
  name: z.string().describe("Japanese category name"),
});

const CATEGORY_SYSTEM =
  "Translate Traditional Chinese category names for an everyday picture dictionary into the " +
  "conventional Japanese term used in menus and signage (e.g., 廚房 → キッチン, 浴室 → バスルーム, " +
  "街上 → 街, 超市 → スーパー, 調味料 → 調味料). Return a single short noun, no punctuation.";

export async function translateCategoryToJa(input: {
  nameZh: string;
  description?: string;
}): Promise<{ name: string }> {
  const { object } = await generateObject({
    model: MODEL,
    schema: CategoryNameSchema,
    system: CATEGORY_SYSTEM,
    prompt:
      `Chinese category (zh-Hant): ${input.nameZh}` +
      (input.description ? `\nContext: ${input.description}` : ""),
  });
  return object;
}
