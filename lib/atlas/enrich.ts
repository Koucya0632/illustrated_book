import "server-only";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { enrichWord } from "@/lib/enrich";
import { toZhHans } from "@/lib/opencc";
import type { UiLang } from "@/lib/settings";
import { pickAtlasDefinition, pickAtlasGloss } from "@/lib/atlas/gloss";
import {
  JA_READING_SYSTEM,
  JapaneseReadingSchema,
  readingWithoutAsking,
  settleJapaneseReading,
} from "@/lib/ja-reading";
import { segmentFurigana } from "@/lib/kana";
import { loadFuriganaDict } from "@/lib/furigana-dict";
import type { AtlasItemEnrichmentUpdate } from "@/lib/atlas-db";
import type { AtlasEnrichment, AtlasItemRow } from "@/lib/atlas/types";

// Cost-effective model for custom-card enrichment: OpenAI gpt-4o-mini called
// directly (reuses the existing OPENAI_API_KEY — no Vercel AI Gateway billing).
// ~$0.15/$0.60 per MTok, supports structured outputs + Traditional Chinese.
const ATLAS_ENRICH_MODEL = openai(process.env.ATLAS_ENRICH_MODEL || "gpt-4o-mini");

// Bump when enrichAtlasItem's output changes in a way existing rows should
// re-pick-up on next open. v2: JA reading is generated on ATLAS_ENRICH_MODEL
// (OpenAI-direct) instead of generateJapaneseReading, which routed through the
// unusable Vercel AI Gateway and left reading null. v3: gloss language follows
// the UI language — every item now also gets display_ja/display_en,
// definition_ja/definition_en and enrichment.glossI18n so ja/en interfaces
// read glosses they can understand. Rows below this version are re-enriched
// once (see needsEnrichRefresh); the stamp is unconditional so a failed
// generation can't loop.
const ATLAS_ENRICH_VERSION = 3;

const JapaneseDefinitionSchema = z.object({
  definition: z
    .string()
    .describe(
      "One concise, natural Japanese dictionary-style definition that explains the concept — " +
        "not merely a restatement of the headword. No examples, no reading, no romaji, no Chinese.",
    ),
});

const JA_DEFINITION_SYSTEM =
  "You are a Japanese lexicographer building a picture dictionary. Write a single concise, " +
  "natural Japanese dictionary-style definition that explains what the supplied headword means " +
  "using everyday Japanese vocabulary. The headword may be English or Japanese. Do not merely " +
  "repeat or transliterate the headword, and never output example sentences, readings, romaji, " +
  "or Chinese.";

/// A Japanese dictionary definition for any headword (Japanese lemma of a JA
/// item, or English lemma of an EN item — the ja-UI gloss). Generated on the
/// same OpenAI-direct model — the translateWordToJa path is intentionally
/// avoided here because it routes through the Vercel AI Gateway. Returns null
/// on failure or an empty / echo result so the card just falls back to its zh
/// definition.
async function generateJapaneseAtlasDefinition(input: {
  lemma: string;
  lemmaLanguage: "en" | "ja";
  partOfSpeech: string;
  chinese: string;
}): Promise<string | null> {
  try {
    const { object } = await generateObject({
      model: ATLAS_ENRICH_MODEL,
      schema: JapaneseDefinitionSchema,
      system: JA_DEFINITION_SYSTEM,
      prompt:
        `Headword (${input.lemmaLanguage === "ja" ? "Japanese" : "English"}): ${input.lemma}\n` +
        `Part of speech: ${input.partOfSpeech}\n` +
        `Meaning (zh-Hant): ${input.chinese}`,
    });
    const definition = object.definition.trim();
    return definition && definition !== input.lemma.trim() ? definition : null;
  } catch {
    return null;
  }
}

const GlossPackSchema = z.object({
  displayJa: z
    .string()
    .describe(
      "A short everyday Japanese word (or 2-3 word phrase) naming the same object as the headword. " +
        "No romaji, no explanations.",
    ),
  displayEn: z
    .string()
    .describe(
      "A short everyday English word (or 2-3 word phrase) naming the same object as the headword. " +
        "Lowercase unless a proper noun.",
    ),
  mnemonicJa: z
    .string()
    .describe(
      "The supplied Traditional-Chinese memory tip rendered as natural Japanese (≤40 characters). " +
        "Empty string if no tip was supplied.",
    ),
  mnemonicEn: z
    .string()
    .describe(
      "The supplied Traditional-Chinese memory tip rendered as natural English (one short sentence). " +
        "Empty string if no tip was supplied.",
    ),
  etymologyJa: z
    .string()
    .describe(
      "The supplied Traditional-Chinese origin note rendered as natural Japanese (2-4 sentences). " +
        "Translate only — never add facts. Empty string if no note was supplied.",
    ),
  etymologyEn: z
    .string()
    .describe(
      "The supplied Traditional-Chinese origin note rendered as natural English (2-4 sentences). " +
        "Translate only — never add facts. Empty string if no note was supplied.",
    ),
});

export type GlossPack = z.infer<typeof GlossPackSchema>;

/// One structured call producing the ja/en gloss layer for a custom item:
/// short display glosses of the lemma plus translations of the zh mnemonic /
/// etymology. Generated for every capture regardless of the capturing user's
/// UI language — uiLang is switchable at any time and this costs one
/// gpt-4o-mini call, so storing all languages up front beats re-enriching on
/// every switch. Returns null on failure; the read path falls back to zh-Hant.
async function generateAtlasGlossPack(input: {
  lemma: string;
  lemmaLanguage: "en" | "ja";
  displayZhHant: string;
  mnemonicZh: string | null;
  etymologyZh: string | null;
}): Promise<GlossPack | null> {
  try {
    const { object } = await generateObject({
      model: ATLAS_ENRICH_MODEL,
      schema: GlossPackSchema,
      system:
        "You produce the multilingual gloss layer for a picture-dictionary entry. " +
        "Glosses name the same everyday object as the headword — natural, short, no explanations. " +
        "Mnemonic/etymology fields are translations of the supplied Traditional Chinese text: " +
        "translate faithfully, never invent facts, and return an empty string when the source is empty.",
      prompt:
        `Headword (${input.lemmaLanguage === "ja" ? "Japanese" : "English"}): ${input.lemma}\n` +
        `Traditional Chinese gloss: ${input.displayZhHant}\n` +
        `Memory tip (zh-Hant): ${input.mnemonicZh ?? ""}\n` +
        `Origin note (zh-Hant): ${input.etymologyZh ?? ""}`,
    });
    return object;
  } catch {
    return null;
  }
}

/// The kana reading for a JA item, on the OpenAI-direct model this module uses
/// (lib/translate.ts's own path routes through the Vercel AI Gateway the project
/// can't use). The *rules* are shared — see lib/ja-reading.ts, which exists
/// because this function used to carry its own "in hiragana only" wording, the
/// exact instruction that flattened 284 katakana headwords in the catalogue.
///
/// Returns null on failure so the card still gets made, just without kana.
async function generateJapaneseAtlasReading(lemma: string): Promise<string | null> {
  const decided = readingWithoutAsking(lemma);
  if (decided) return decided; // hand-corrected, or already its own reading

  try {
    const { object } = await generateObject({
      model: ATLAS_ENRICH_MODEL,
      schema: JapaneseReadingSchema,
      system: JA_READING_SYSTEM,
      prompt: `Japanese headword: ${lemma}`,
    });
    // An unrepairable answer is discarded rather than stored: a reading that
    // does not keep the headword's own kana cannot be aligned to it, and the
    // 拼字 stage would drill a spelling that does not exist.
    return settleJapaneseReading(lemma, object.reading);
  } catch {
    return null;
  }
}

/// Run the existing dictionary enrichment on a custom atlas item (reusing
/// enrichWord verbatim — no examples) and map it to the storage shape.
export async function enrichAtlasItem(item: AtlasItemRow): Promise<AtlasItemEnrichmentUpdate> {
  const isJa = item.target_language === "ja";
  const lemmaLanguage = item.target_language;
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
  if (isJa && !reading) {
    reading = await generateJapaneseAtlasReading(item.lemma);
  }
  // Which kana sit over which characters. Only meaningful for JA, and only
  // when a reading survived — a null here is a display fallback, not a failure,
  // so it never stops the item being enriched.
  const readingSegments =
    isJa && reading
      ? segmentFurigana(item.lemma, reading, await loadFuriganaDict([item.lemma]))
      : null;
  // Every item gets a Japanese definition (the ja-UI gloss); for JA items it
  // doubles as the target definition.
  const definitionJa = await generateJapaneseAtlasDefinition({
    lemma: item.lemma,
    lemmaLanguage,
    partOfSpeech: item.part_of_speech || "noun",
    chinese: item.display_zh_hant,
  });
  if (isJa) definitionTarget = definitionJa;
  const definitionEn = result.englishDefinition || null;

  const glossPack = await generateAtlasGlossPack({
    lemma: item.lemma,
    lemmaLanguage,
    displayZhHant: item.display_zh_hant,
    mnemonicZh: result.mnemonic || null,
    etymologyZh: result.etymology || null,
  });

  return {
    pronunciation: item.pronunciation ?? null,
    reading: reading ?? null,
    readingSegments,
    definitionTarget,
    definitionZh: result.chineseDefinition || null,
    definitionJa,
    definitionEn,
    displayJa: glossPack?.displayJa.trim() || null,
    displayEn: glossPack?.displayEn.trim() || null,
    enrichment: {
      synonyms: result.synonyms,
      antonyms: result.antonyms,
      related: result.related,
      forms: result.forms,
      mnemonic: result.mnemonic || null,
      etymology: result.etymology || null,
      glossI18n: glossPack
        ? {
            ja: {
              mnemonic: glossPack.mnemonicJa.trim() || null,
              etymology: glossPack.etymologyJa.trim() || null,
            },
            en: {
              mnemonic: glossPack.mnemonicEn.trim() || null,
              etymology: glossPack.etymologyEn.trim() || null,
            },
          }
        : undefined,
      // Records which language definition_target holds so atlasItemToWord can
      // suppress legacy JA rows (enriched before JA definitions existed, whose
      // definition_target still holds English) until they're re-enriched.
      targetDefinitionLang: item.target_language,
      enrichVersion: ATLAS_ENRICH_VERSION,
    },
  };
}

/// True for items enriched under an older scheme (v3 added the ja/en gloss
/// layer), so callers re-enrich them once and skip embedding their stale
/// detail. The version stamp advances on every re-enrich, so this can't loop
/// even if a generation step fails.
export function needsEnrichRefresh(item: AtlasItemRow): boolean {
  return (item.enrichment?.enrichVersion ?? 0) < ATLAS_ENRICH_VERSION;
}

/// Assemble the full per-word detail JSON (same shape as getLearningWord /
/// the iOS `Word` model) from a custom atlas item + its signed image URL.
/// Examples are always empty (enrichWord doesn't produce them). For JA the
/// English-morphology fields are hidden, mirroring getLearningWord.
/// Gloss fields (chinese / chineseDefinition / note / etymology) follow the
/// UI language; zh-Hans is OpenCC-converted here (this mapper feeds routes
/// that never pass through localizeWord).
export function atlasItemToWord(item: AtlasItemRow, imageUrl: string, uiLang: UiLang = "zh-Hant") {
  const isJa = item.target_language === "ja";
  const e: AtlasEnrichment = item.enrichment ?? {};
  const glossLang = uiLang === "ja" || uiLang === "en" ? uiLang : null;
  const zh = (s: string | null | undefined): string | null =>
    s ? (uiLang === "zh-Hans" ? toZhHans(s) : s) : null;

  // EN's definition_target is always English and safe to show. JA's is only
  // trustworthy once (re-)generated as Japanese — legacy rows still hold the
  // old English string, so gate JA on the enrichment marker (the detail route
  // re-enriches them on next open).
  const showTargetDefinition = isJa ? e.targetDefinitionLang === "ja" : Boolean(item.definition_target);

  const chinese = glossLang ? pickAtlasGloss(item, uiLang) : (zh(item.display_zh_hant) ?? "");
  const glossDefinition = glossLang ? pickAtlasDefinition(item, uiLang) : null;
  // The zh explainer line becomes the gloss-language definition for ja/en —
  // but not when it would just repeat the headline gloss or the target
  // definition already on screen.
  const chineseDefinition = glossLang
    ? glossDefinition !== chinese &&
      (!showTargetDefinition || glossDefinition !== item.definition_target)
      ? glossDefinition
      : null
    : zh(item.definition_zh_hant);

  const definitions: { language: string; definition: string; cefrLevel: null; sortOrder: number }[] = [];
  if (glossLang) {
    const g = pickAtlasDefinition(item, uiLang);
    if (g) definitions.push({ language: glossLang, definition: g, cefrLevel: null, sortOrder: 0 });
  } else if (item.definition_zh_hant) {
    definitions.push({
      language: "zh",
      definition: zh(item.definition_zh_hant) ?? "",
      cefrLevel: null,
      sortOrder: 0,
    });
  }
  if (
    item.definition_target &&
    showTargetDefinition &&
    !definitions.some((d) => d.definition === item.definition_target)
  ) {
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
    // Fold the kana reading into pronunciation (JA items have no separate
    // pronunciation) so the title's pronunciation slot shows it, mirroring
    // getLearningWord's `pronunciation ?? reading` for public JA words.
    pronunciation: item.pronunciation ?? item.reading ?? "",
    reading: item.reading ?? null,
    targetLanguage: item.target_language,
    audioUrl: null,
    audioUrls: null,
    imageUrl,
    cefrLevel: item.cefr_level ?? null,
    status: "published",
    chinese,
    definitions: definitions.length ? definitions : null,
    examples: null,
    relations: relations && relations.length ? relations : null,
    collocations: isJa ? null : (e.related && e.related.length ? e.related : null),
    collocationsZh: null,
    // Mnemonic/etymology: gloss-language versions for ja/en (omit when never
    // generated — a zh tip is noise for a reader who chose ja/en), zh base
    // otherwise. JA items keep etymology hidden, mirroring getLearningWord.
    note: glossLang ? (e.glossI18n?.[glossLang]?.mnemonic ?? null) : zh(e.mnemonic),
    etymology: isJa
      ? null
      : glossLang
        ? (e.glossI18n?.[glossLang]?.etymology ?? null)
        : zh(e.etymology),
    forms: isJa ? null : (e.forms && e.forms.length ? e.forms : null),
    chineseDefinition,
    targetDefinition: showTargetDefinition ? (item.definition_target ?? null) : null,
    englishDefinition: isJa ? null : (item.definition_target ?? null),
    tags: ["custom"],
  };
}
