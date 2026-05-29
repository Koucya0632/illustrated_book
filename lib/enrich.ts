import "server-only";
import { generateObject } from "ai";
import { z } from "zod";

// AI-generated enrichment for a single word. Runs through the Vercel AI Gateway
// (a plain "creator/model" string routes via the gateway using AI_GATEWAY_API_KEY
// or Vercel OIDC). Model is overridable with ENRICH_MODEL.
const MODEL = process.env.ENRICH_MODEL || "anthropic/claude-sonnet-4-6";

export interface EnrichInput {
  word: string;
  partOfSpeech: string;
  chinese: string;
}

export const EnrichSchema = z.object({
  synonyms: z.array(z.string()).describe("English synonyms (lowercase), up to 6"),
  antonyms: z.array(z.string()).describe("English antonyms (lowercase), up to 6"),
  related: z.array(z.string()).describe("Related English words or short phrases, up to 6"),
  forms: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe(
      "Inflected forms. `label` in Traditional Chinese (複數/過去式/過去分詞/現在分詞/第三人稱單數/比較級/最高級), `value` the English form.",
    ),
  mnemonic: z.string().describe("A short memory tip in Traditional Chinese (≤40 字)"),
  etymology: z
    .string()
    .describe("Concise etymology / word-formation breakdown in Traditional Chinese (≤60 字)"),
});

export type EnrichResult = z.infer<typeof EnrichSchema>;

const SYSTEM =
  "You are a bilingual (English / Traditional Chinese) lexicographer building a picture " +
  "dictionary for Chinese-speaking English learners. Return accurate, concise data. " +
  "Use Traditional Chinese (zh-Hant) for `mnemonic`, `etymology`, and each form's `label`. " +
  "Use English for `synonyms`/`antonyms`/`related` and each form's `value`. " +
  "Give forms appropriate to the part of speech (noun→複數; verb→過去式/過去分詞/現在分詞/第三人稱單數; " +
  "adjective→比較級/最高級). Use an empty array when a category doesn't apply. " +
  "Keep mnemonic ≤40 characters and etymology ≤60 characters.";

export async function enrichWord(input: EnrichInput): Promise<EnrichResult> {
  const { object } = await generateObject({
    model: MODEL,
    schema: EnrichSchema,
    system: SYSTEM,
    prompt: `Word: ${input.word}\nPart of speech: ${input.partOfSpeech}\nMeaning (zh): ${input.chinese}`,
  });
  return object;
}
