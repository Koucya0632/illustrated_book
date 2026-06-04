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
  englishDefinition: z
    .string()
    .describe(
      "A single concise English definition, dictionary-headword style, one sentence (~10–18 words).",
    ),
  chineseDefinition: z
    .string()
    .describe(
      "A single concise Traditional Chinese definition, dictionary-style, one sentence. " +
        "Explain what the thing is — match the depth of `englishDefinition`, not just translate the headword. " +
        "No examples, no etymology, no parentheticals.",
    ),
  etymology: z
    .string()
    .describe(
      "來源故事（2–4 句 Traditional Chinese）：" +
        "(a) 若單字可拆解（前綴/字根/字尾），請簡單拆解； " +
        "(b) 若有真實詞源，說明來源語言／原本意思的感覺； " +
        "(c) 若不適合講詞源，改用『核心感覺』描述這個字給人的意象； " +
        "(d) 不確定就用核心感覺，絕對不要亂編假詞源。 " +
        "不要輸出例句、不要輸出圖片 prompt、不要輸出記憶提示。",
    ),
});

export type EnrichResult = z.infer<typeof EnrichSchema>;

const SYSTEM =
  "You are a bilingual (English / Traditional Chinese) lexicographer building a picture " +
  "dictionary for Chinese-speaking English learners. Return accurate, concise data. " +
  "Use Traditional Chinese (zh-Hant) for `mnemonic`, `etymology`, and each form's `label`. " +
  "Use English for `englishDefinition`, `synonyms`, `antonyms`, `related`, and each form's `value`. " +
  "Give forms appropriate to the part of speech (noun→複數; verb→過去式/過去分詞/現在分詞/第三人稱單數; " +
  "adjective→比較級/最高級). Use an empty array when a category doesn't apply. " +
  "Keep mnemonic ≤40 characters. " +
  "`englishDefinition`: one short dictionary-style English sentence — no examples, no parenthetical usage notes. " +
  "`chineseDefinition`: one short dictionary-style Traditional Chinese sentence that *explains* the concept, parallel in depth to `englishDefinition`. Do not merely translate the headword. " +
  "`etymology`: 2–4 sentences in Traditional Chinese. " +
  "If the word decomposes into prefix/root/suffix, briefly decompose it. " +
  "If it has a verified etymology, describe the origin's feeling (source language, original sense). " +
  "If neither applies, describe the word's core feeling/imagery. " +
  "Never fabricate etymology — when uncertain, use core feeling instead. " +
  "For etymology, do NOT output example sentences, image prompts, or memory tips.";

export async function enrichWord(input: EnrichInput): Promise<EnrichResult> {
  const { object } = await generateObject({
    model: MODEL,
    schema: EnrichSchema,
    system: SYSTEM,
    prompt: `Word: ${input.word}\nPart of speech: ${input.partOfSpeech}\nMeaning (zh): ${input.chinese}`,
  });
  return object;
}
