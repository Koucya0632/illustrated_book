import { generateObject } from "ai";
import { z } from "zod";

// AI-powered zh-Hant → ja translation for dictionary content. Mirrors the
// shape of lib/enrich.ts — runs through the Vercel AI Gateway using a
// "creator/model" string and AI_GATEWAY_API_KEY. Model overridable via
// TRANSLATE_MODEL.
const MODEL = process.env.TRANSLATE_MODEL || "anthropic/claude-sonnet-4-6";

// ---- Per-word batch translation (definition + etymology + note + examples) ----

export interface TranslateWordInput {
  englishWord: string;
  chineseTerm: string;
  chineseDefinition: string;
  etymology?: string;
  note?: string;
  examples: { en: string; zh: string }[];
}

export const TranslatedWordSchema = z.object({
  term: z.string().describe("Concise standard Japanese dictionary headword"),
  reading: z
    .string()
    .describe("Hiragana reading of the Japanese headword, with no punctuation"),
  definition: z
    .string()
    .describe("A natural Japanese explanatory definition, not merely the headword"),
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
  "You create Japanese learning content for Traditional-Chinese-speaking learners. Output natural " +
  "Japanese using conventional everyday vocabulary (e.g., 冰箱 → 冷蔵庫, 廚房 → キッチン). The term " +
  "must be a short dictionary headword. The definition must be a concise explanatory Japanese " +
  "sentence or phrase that explains the concept and must not merely repeat the term. Example " +
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
      `English reference word: ${input.englishWord}\n` +
      `Chinese headword/short meaning (zh-Hant): ${input.chineseTerm}\n` +
      `Chinese explanatory definition (zh-Hant): ${input.chineseDefinition}\n` +
      (input.etymology ? `Etymology (zh-Hant): ${input.etymology}\n` : "Etymology: (none)\n") +
      (input.note ? `Note (zh-Hant): ${input.note}\n` : "Note: (none)\n") +
      (exampleLines ? `Examples:\n${exampleLines}\n` : "Examples: (none)\n") +
      `\nReturn: term (the concise Japanese headword), reading (hiragana), ` +
      `definition (a Japanese explanation distinct from the term), ` +
      `etymology (ja or null), note (ja or null), ` +
      `examples (array of ja strings, one per example, same order).`,
  });
  return object;
}

const JapaneseReadingSchema = z.object({
  reading: z.string().describe("Hiragana reading only, no punctuation or explanation"),
});

export async function generateJapaneseReading(term: string): Promise<string> {
  const { object } = await generateObject({
    model: MODEL,
    schema: JapaneseReadingSchema,
    system:
      "Return the standard Japanese reading of the supplied dictionary headword in hiragana only. " +
      "Preserve long-vowel pronunciation naturally and do not add explanations or punctuation.",
    prompt: `Japanese headword: ${term}`,
  });
  return object.reading.trim();
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
