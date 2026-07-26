// Query parsing for the public community endpoints. Kept as a pure function so
// the validation rules are unit-testable without a database (tests/atlas-public-query.test.ts).

import type { AtlasTargetLanguage } from "./types";

export const ATLAS_LEMMA_MAX = 80;
export const ATLAS_BY_LEMMA_DEFAULT_LIMIT = 24;
export const ATLAS_BY_LEMMA_MAX_LIMIT = 60;

export interface AtlasByLemmaQuery {
  lemma: string;
  lang: AtlasTargetLanguage;
  limit: number;
}

export type AtlasByLemmaParse =
  | { ok: true; query: AtlasByLemmaQuery }
  | { ok: false; error: "invalid lemma" | "invalid lang" };

function targetLanguage(value: string | null): AtlasTargetLanguage | null {
  return value === "en" || value === "ja" ? value : null;
}

export function clampByLemmaLimit(raw: string | null): number {
  const n = Number(raw || ATLAS_BY_LEMMA_DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return ATLAS_BY_LEMMA_DEFAULT_LIMIT;
  return Math.min(ATLAS_BY_LEMMA_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

/**
 * Parses ?lemma=&lang=&limit= for /api/atlas/public/by-lemma.
 *
 * `lang` is required rather than defaulted: the same spelling can exist in both
 * the English and Japanese decks, so a silent default would mix languages into
 * one list.
 */
export function parseAtlasByLemmaQuery(searchParams: URLSearchParams): AtlasByLemmaParse {
  const lemma = (searchParams.get("lemma") ?? "").trim();
  if (!lemma || lemma.length > ATLAS_LEMMA_MAX) {
    return { ok: false, error: "invalid lemma" };
  }

  const lang = targetLanguage(searchParams.get("lang"));
  if (!lang) return { ok: false, error: "invalid lang" };

  return {
    ok: true,
    query: { lemma, lang, limit: clampByLemmaLimit(searchParams.get("limit")) },
  };
}
