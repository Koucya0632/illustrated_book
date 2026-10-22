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

export const ATLAS_SEARCH_QUERY_MAX = 40;

export interface AtlasSearchQuery {
  q: string;
  lang: AtlasTargetLanguage;
}

export type AtlasSearchParse =
  | { ok: true; query: AtlasSearchQuery }
  | { ok: false; error: "invalid q" | "invalid lang" };

/**
 * Parses ?q=&lang= for /api/atlas/public/search (物見 search).
 *
 * `lang` is required for the same reason as by-lemma: 物見 follows the
 * learner's direction, and a default would mix the two decks. The length cap
 * keeps arbitrary input from minting CDN cache entries of any size.
 */
export function parseAtlasSearchQuery(searchParams: URLSearchParams): AtlasSearchParse {
  const q = (searchParams.get("q") ?? "").trim();
  if (!q || q.length > ATLAS_SEARCH_QUERY_MAX) {
    return { ok: false, error: "invalid q" };
  }

  const lang = targetLanguage(searchParams.get("lang"));
  if (!lang) return { ok: false, error: "invalid lang" };

  return { ok: true, query: { q, lang } };
}

/**
 * `%needle%` for ILIKE with the user's own wildcards escaped, so 「100%」 is
 * searched for literally instead of matching everything that starts with 100.
 * Default ESCAPE char is backslash.
 */
export function atlasContainsPattern(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, "\\$&")}%`;
}
