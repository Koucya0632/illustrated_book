import { createHash } from "node:crypto";
import variants from "@/data/australian-word-variants.json";
import images from "@/data/australian-image-variants.json";
import australianOnlyIds from "@/data/australian-only-word-ids.json";
import { toZhHans } from "./opencc";
import { hintDefinition } from "./study-hint";
import { AUSTRALIAN_RENTAL_WORDS, australianRentalBatchActive } from "./australian-categories";
import type { LearningDirection, UiLang } from "./settings";
import type { Example, Word } from "@/types";

export interface AustralianWordVariant {
  visibility: "shared" | "australia-only";
  headword: string;
  pronunciation: string;
  imageUrl: string;
  gloss: { "zh-Hant": string; ja: string; en: string };
  explanation: { "zh-Hant": string; ja: string; en: string };
  englishDefinition: string;
  examples: (Example & { audioUrls: Record<string, string>; mentionedWordIds: string[] })[];
  audioUrls: Record<string, string>;
}

export type AustralianWordVariants = Record<string, AustralianWordVariant>;

export function australianStudyHint(variant: AustralianWordVariant, lang: UiLang, gloss: string): string | undefined {
  if (lang === "en") return undefined;
  const explanation = lang === "zh-Hans"
    ? toZhHans(variant.explanation["zh-Hant"])
    : variant.explanation[lang];
  return hintDefinition(gloss, explanation);
}

// This file is an explicit release allowlist. Keep it empty until all assets,
// examples, locale audio, and source records have passed the release review.
export function validateAustralianVariants(
  source: AustralianWordVariants,
  reservedIds: readonly string[] = australianOnlyIds,
): void {
  const locales = ["en-US", "en-GB", "en-AU"];
  const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  const https = (value: unknown): boolean => {
    if (!nonempty(value)) return false;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  };
  for (const [id, variant] of Object.entries(source)) {
    const audioComplete = (audio: Record<string, string> | undefined) =>
      locales.every((locale) => https(audio?.[locale]));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
        !variant || typeof variant !== "object" ||
        !["shared", "australia-only"].includes(variant.visibility) ||
        (variant.visibility === "australia-only") !== reservedIds.includes(id) ||
        !nonempty(variant.headword) || !nonempty(variant.pronunciation) ||
        !https(variant.imageUrl) || !nonempty(variant.englishDefinition) ||
        !variant.gloss || !variant.explanation ||
        !["zh-Hant", "ja", "en"].every((lang) =>
          nonempty(variant.gloss[lang as keyof typeof variant.gloss]) &&
          nonempty(variant.explanation[lang as keyof typeof variant.explanation])) ||
        !audioComplete(variant.audioUrls) ||
        !Array.isArray(variant.examples) || variant.examples.length !== 2 ||
        !variant.examples.every((example, index) =>
          example && typeof example === "object" && example.sortOrder === index &&
          (index === 0 ? ["A1", "A2"] : ["B1", "B2"]).includes(example.cefrLevel ?? "") &&
          nonempty(example.en) && nonempty(example.translations?.zh) &&
          example.zh === example.translations.zh &&
          nonempty(example.translations?.ja) && audioComplete(example.audioUrls) &&
          Array.isArray(example.mentionedWordIds) && example.mentionedWordIds.includes(id))) {
      throw new Error(`invalid published Australian variant: ${id}`);
    }
  }
}
export type AustralianImageVariants = Record<string, string>;

/** Image-only overlays keep live definitions, examples and audio intact. */
export function validateAustralianImages(source: AustralianImageVariants, reservedIds: readonly string[] = australianOnlyIds, full: AustralianWordVariants = variants as AustralianWordVariants): void {
  for (const [id, url] of Object.entries(source)) {
    let validUrl = false;
    try { validUrl = new URL(url).protocol === "https:"; } catch { /* invalid input */ }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || reservedIds.includes(id) || id in full || !validUrl) {
      throw new Error(`invalid Australian image variant: ${id}`);
    }
  }
}
export function australianImage(wordId: string, direction: LearningDirection, source: AustralianImageVariants = images): string | undefined {
  return direction === "zh-en" ? source[wordId] : undefined;
}
export function applyAustralianImage(word: Word, direction: LearningDirection, source: AustralianImageVariants = images): Word {
  const imageUrl = australianImage(word.id, direction, source);
  return imageUrl ? { ...word, imageUrl } : word;
}

const publishedVariants: AustralianWordVariants = variants as AustralianWordVariants;
validateAustralianVariants(publishedVariants);
validateAustralianImages(images);
/** Region-dependent projections must bypass shared caches when activated. */
export const regionalCatalogueActive = Object.keys(publishedVariants).length > 0 || Object.keys(images).length > 0;
export const australianVariantsCacheKey = createHash("sha256")
  .update(JSON.stringify([publishedVariants, australianOnlyIds, images]))
  .digest("hex");

export function australianVariant(
  wordId: string,
  direction: LearningDirection,
  source: AustralianWordVariants = publishedVariants,
): AustralianWordVariant | undefined {
  if (direction !== "zh-en") return undefined;
  if ((AUSTRALIAN_RENTAL_WORDS as readonly string[]).includes(wordId) && !australianRentalBatchActive(source)) return undefined;
  return source[wordId];
}

export function visibleInDirection(
  wordId: string,
  direction: LearningDirection,
  source: AustralianWordVariants = publishedVariants,
  reservedIds: readonly string[] = australianOnlyIds,
): boolean {
  if ((AUSTRALIAN_RENTAL_WORDS as readonly string[]).includes(wordId) && !australianRentalBatchActive(source)) return false;
  const australianOnly = reservedIds.includes(wordId) || source[wordId]?.visibility === "australia-only";
  if (!australianOnly) return true;
  return direction === "zh-en" && source[wordId]?.visibility === "australia-only";
}

export function hiddenAustralianIds(
  direction: LearningDirection,
  source: AustralianWordVariants = publishedVariants,
  reservedIds: readonly string[] = australianOnlyIds,
): string[] {
  const ids = new Set([...reservedIds, ...Object.keys(source)]);
  return [...ids].filter((id) => !visibleInDirection(id, direction, source, reservedIds));
}

export function applyAustralianVariant(
  word: Word,
  lang: UiLang,
  variant: AustralianWordVariant | undefined,
): Word {
  if (!variant) return word;
  const gloss = lang === "zh-Hans" ? toZhHans(variant.gloss["zh-Hant"]) : variant.gloss[lang];
  const examples = variant.examples.map((example) => ({
    ...example,
    zh: lang === "zh-Hans"
      ? toZhHans(example.translations.zh ?? "")
      : lang === "ja"
        ? example.translations.ja ?? ""
        : lang === "en"
          ? ""
          : example.translations.zh ?? "",
  }));
  const explanation = lang === "zh-Hans"
    ? toZhHans(variant.explanation["zh-Hant"])
    : variant.explanation[lang];
  return {
    ...word,
    word: variant.headword,
    chinese: gloss,
    chineseDefinition: explanation === gloss ? undefined : explanation,
    definitions: [{ language: lang === "zh-Hans" || lang === "zh-Hant" ? "zh" : lang, definition: gloss, sortOrder: 0 }],
    alsoKnownAs: undefined,
    note: undefined,
    etymology: undefined,
    forms: undefined,
    collocations: undefined,
    collocationsZh: undefined,
    pronunciation: variant.pronunciation,
    imageUrl: variant.imageUrl,
    englishDefinition: variant.englishDefinition,
    targetDefinition: variant.englishDefinition,
    examples,
    // Do not reuse the original headword's audio for a different regional word.
    audioUrls: variant.audioUrls,
    audioUrl: variant.audioUrls["en-US"],
  };
}
