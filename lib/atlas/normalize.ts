import type { LearningDirection } from "@/lib/settings";
import type { AtlasDeckKey, AtlasTargetLanguage } from "./types";

export function normalizeTargetLanguage(raw: unknown): AtlasTargetLanguage | null {
  return raw === "ja" || raw === "en" ? raw : null;
}

export function targetLanguageFromDirection(direction: LearningDirection): AtlasTargetLanguage {
  return direction === "zh-ja" ? "ja" : "en";
}

export function atlasDeckFor(targetLanguage: AtlasTargetLanguage): AtlasDeckKey {
  return targetLanguage === "ja" ? "atlas-image-ja" : "atlas-image-en";
}

export function normalizeAtlasLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}
