import type { AtlasDeckKey, AtlasTargetLanguage } from "./types";

export function atlasDeckFor(targetLanguage: AtlasTargetLanguage): AtlasDeckKey {
  return targetLanguage === "ja" ? "atlas-image-ja" : "atlas-image-en";
}

export function normalizeAtlasLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}
