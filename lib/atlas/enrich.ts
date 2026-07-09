import "server-only";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { enrichWord } from "@/lib/enrich";
import { generateJapaneseReading } from "@/lib/translate";
import type { AtlasItemEnrichmentUpdate } from "@/lib/atlas-db";
import type { AtlasEnrichment, AtlasItemRow } from "@/lib/atlas/types";

// Cost-effective model for custom-card enrichment: OpenAI gpt-4o-mini called
// directly (reuses the existing OPENAI_API_KEY — no Vercel AI Gateway billing).
// ~$0.15/$0.60 per MTok, supports structured outputs + Traditional Chinese.
const ATLAS_ENRICH_MODEL = openai(process.env.ATLAS_ENRICH_MODEL || "gpt-4o-mini");

const JapaneseDefinitionSchema = z.object({
  definition: z
    .string()
    .describe(
      "One concise, natural Japanese dictionary-style definition that explains the concept — " +
        "not merely a restatement of the headword. No examples, no reading, no romaji, no Chinese.",
    ),
});

const JA_DEFINITION_SYSTEM =
  "You are a Japanese lexicographer building a picture dictionary for Traditional-Chinese-speaking " +
  "learners of Japanese. Write a single concise, natural Japanese dictionary-style definition that " +
  "explains what the word means using everyday Japanese vocabulary. Do not merely repeat the " +
  "headword, and never output example sentences, readings, romaji, or Chinese.";

/// The target-language definition for a JA item must be Japanese, which
/// enrichWord (an English / Traditional-Chinese lexicographer) doesn't produce.
/// Generate it on the same OpenAI-direct model — the translateWordToJa path is
/// intentionally avoided here because it routes through the Vercel AI Gateway.
/// Returns null on failure or an empty / echo result so the card just falls
/// back to its zh definition.
async function generateJapaneseAtlasDefinition(input: {
  lemma: string;
  partOfSpeech: string;
  chinese: string;
}): Promise<string | null> {
  try {
    const { object } = await generateObject({
      model: ATLAS_ENRICH_MODEL,
      schema: JapaneseDefinitionSchema,
      system: JA_DEFINITION_SYSTEM,
      prompt:
        `Japanese word: ${input.lemma}\n` +
        `Part of speech: ${input.partOfSpeech}\n` +
        `Meaning (zh-Hant): ${input.chinese}`,
    });
    const definition = object.definition.trim();
    return definition && definition !== input.lemma.trim() ? definition : null;
  } catch {
    return null;
  }
}

/// Run the existing dictionary enrichment on a custom atlas item (reusing
/// enrichWord verbatim — no examples) and map it to the storage shape.
export async function enrichAtlasItem(item: AtlasItemRow): Promise<AtlasItemEnrichmentUpdate> {
  const isJa = item.target_language === "ja";
  const result = await enrichWord(
    {
      word: item.lemma,
      partOfSpeech: item.part_of_speech || "noun",
      chinese: item.display_zh_hant,
    },
    { model: ATLAS_ENRICH_MODEL },
  );

  // For EN the target-language definition is enrichWord's English one. For JA
  // it must be Japanese, generated separately (see generateJapaneseAtlasDefinition).
  let definitionTarget = isJa ? null : result.englishDefinition || null;
  let reading = item.reading;
  if (isJa) {
    if (!reading) {
      try {
        reading = await generateJapaneseReading(item.lemma);
      } catch {
        reading = null;
      }
    }
    definitionTarget = await generateJapaneseAtlasDefinition({
      lemma: item.lemma,
      partOfSpeech: item.part_of_speech || "noun",
      chinese: item.display_zh_hant,
    });
  }

  return {
    pronunciation: item.pronunciation ?? null,
    reading: reading ?? null,
    definitionTarget,
    definitionZh: result.chineseDefinition || null,
    enrichment: {
      synonyms: result.synonyms,
      antonyms: result.antonyms,
      related: result.related,
      forms: result.forms,
      mnemonic: result.mnemonic || null,
      etymology: result.etymology || null,
      // Records which language definition_target holds so atlasItemToWord can
      // suppress legacy JA rows (enriched before JA definitions existed, whose
      // definition_target still holds English) until they're re-enriched.
      targetDefinitionLang: item.target_language,
    },
  };
}

/// True for legacy JA items whose stored definition_target predates Japanese
/// target definitions (it's still English). Callers re-enrich these and skip
/// embedding their detail so they self-heal instead of surfacing English
/// mislabeled as Japanese. EN items and freshly-enriched JA items are false.
export function needsJaTargetDefinition(item: AtlasItemRow): boolean {
  return item.target_language === "ja" && item.enrichment?.targetDefinitionLang !== "ja";
}

/// Assemble the full per-word detail JSON (same shape as getLearningWord /
/// the iOS `Word` model) from a custom atlas item + its signed image URL.
/// Examples are always empty (enrichWord doesn't produce them). For JA the
/// English-morphology fields are hidden, mirroring getLearningWord.
export function atlasItemToWord(item: AtlasItemRow, imageUrl: string) {
  const isJa = item.target_language === "ja";
  const e: AtlasEnrichment = item.enrichment ?? {};

  // EN's definition_target is always English and safe to show. JA's is only
  // trustworthy once (re-)generated as Japanese — legacy rows still hold the
  // old English string, so gate JA on the enrichment marker (the detail route
  // re-enriches them on next open).
  const showTargetDefinition = isJa ? e.targetDefinitionLang === "ja" : Boolean(item.definition_target);

  const definitions: { language: string; definition: string; cefrLevel: null; sortOrder: number }[] = [];
  if (item.definition_zh_hant) {
    definitions.push({ language: "zh", definition: item.definition_zh_hant, cefrLevel: null, sortOrder: 0 });
  }
  if (item.definition_target && showTargetDefinition) {
    definitions.push({
      language: isJa ? "ja" : "en",
      definition: item.definition_target,
      cefrLevel: null,
      sortOrder: 1,
    });
  }

  const relations = isJa
    ? null
    : [
        ...(e.synonyms ?? []).map((w) => ({ wordId: w, type: "synonym", note: null })),
        ...(e.antonyms ?? []).map((w) => ({ wordId: w, type: "antonym", note: null })),
      ];

  return {
    id: `atlas:${item.id}`,
    word: item.lemma,
    alsoKnownAs: null,
    category: item.category || "custom",
    partOfSpeech: item.part_of_speech ?? null,
    pronunciation: item.pronunciation ?? "",
    reading: item.reading ?? null,
    targetLanguage: item.target_language,
    audioUrl: null,
    audioUrls: null,
    imageUrl,
    cefrLevel: item.cefr_level ?? null,
    status: "published",
    chinese: item.display_zh_hant,
    definitions: definitions.length ? definitions : null,
    examples: null,
    relations: relations && relations.length ? relations : null,
    collocations: isJa ? null : (e.related && e.related.length ? e.related : null),
    collocationsZh: null,
    note: e.mnemonic ?? null,
    etymology: isJa ? null : (e.etymology ?? null),
    forms: isJa ? null : (e.forms && e.forms.length ? e.forms : null),
    chineseDefinition: item.definition_zh_hant ?? null,
    targetDefinition: showTargetDefinition ? (item.definition_target ?? null) : null,
    englishDefinition: isJa ? null : (item.definition_target ?? null),
    tags: ["custom"],
  };
}
