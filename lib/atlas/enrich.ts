import "server-only";
import { openai } from "@ai-sdk/openai";
import { enrichWord } from "@/lib/enrich";
import { generateJapaneseReading } from "@/lib/translate";
import type { AtlasItemEnrichmentUpdate } from "@/lib/atlas-db";
import type { AtlasEnrichment, AtlasItemRow } from "@/lib/atlas/types";

// Cost-effective model for custom-card enrichment: OpenAI gpt-4o-mini called
// directly (reuses the existing OPENAI_API_KEY — no Vercel AI Gateway billing).
// ~$0.15/$0.60 per MTok, supports structured outputs + Traditional Chinese.
const ATLAS_ENRICH_MODEL = openai(process.env.ATLAS_ENRICH_MODEL || "gpt-4o-mini");

/// Run the existing dictionary enrichment on a custom atlas item (reusing
/// enrichWord verbatim — no examples) and map it to the storage shape.
export async function enrichAtlasItem(item: AtlasItemRow): Promise<AtlasItemEnrichmentUpdate> {
  const result = await enrichWord(
    {
      word: item.lemma,
      partOfSpeech: item.part_of_speech || "noun",
      chinese: item.display_zh_hant,
    },
    { model: ATLAS_ENRICH_MODEL },
  );

  let reading = item.reading;
  if (item.target_language === "ja" && !reading) {
    try {
      reading = await generateJapaneseReading(item.lemma);
    } catch {
      reading = null;
    }
  }

  return {
    pronunciation: item.pronunciation ?? null,
    reading: reading ?? null,
    definitionTarget: result.englishDefinition || null,
    definitionZh: result.chineseDefinition || null,
    enrichment: {
      synonyms: result.synonyms,
      antonyms: result.antonyms,
      related: result.related,
      forms: result.forms,
      mnemonic: result.mnemonic || null,
      etymology: result.etymology || null,
    },
  };
}

/// Assemble the full per-word detail JSON (same shape as getLearningWord /
/// the iOS `Word` model) from a custom atlas item + its signed image URL.
/// Examples are always empty (enrichWord doesn't produce them). For JA the
/// English-morphology fields are hidden, mirroring getLearningWord.
export function atlasItemToWord(item: AtlasItemRow, imageUrl: string) {
  const isJa = item.target_language === "ja";
  const e: AtlasEnrichment = item.enrichment ?? {};

  const definitions: { language: string; definition: string; cefrLevel: null; sortOrder: number }[] = [];
  if (item.definition_zh_hant) {
    definitions.push({ language: "zh", definition: item.definition_zh_hant, cefrLevel: null, sortOrder: 0 });
  }
  if (!isJa && item.definition_target) {
    definitions.push({ language: "en", definition: item.definition_target, cefrLevel: null, sortOrder: 1 });
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
    targetDefinition: item.definition_target ?? null,
    englishDefinition: isJa ? null : (item.definition_target ?? null),
    tags: ["custom"],
  };
}
