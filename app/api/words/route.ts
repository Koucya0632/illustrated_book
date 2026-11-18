import { regionalCatalogueActive } from "@/lib/australian-word-variants";
// Public listing of every published word, localized via `?lang=`. Returns
// the lite CardWord shape (id / word / chinese / imageUrl / category /
// pronunciation) — heavy fields like definitions / examples / relations
// stay behind the per-word /api/words/[id] endpoint.
//
// Successful responses are CDN-cacheable by their language-scoped URL.
// `getAllCardWords`'s `unstable_cache` layer
// keeps origin DB hits amortized.

import { getAllCardWords } from "@/lib/data";
import { legacyRentalWordVisible } from "@/lib/australian-categories";
import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import type { LearningDirection, UiLang } from "@/lib/settings";
import {
  publicJson,
  readLang,
  readLearningDirection,
} from "@/lib/cache-headers";

export const runtime = "nodejs";
// Next 14 auto-emits `Cache-Control: s-maxage=300, stale-while-revalidate=...`
// when `revalidate` is set on a Route Handler segment. Tag-based invalidation
// (`revalidateTag("words", "max")`) still kicks in via the underlying unstable_cache.
export const revalidate = 300;

export async function GET(req: Request) {
  const lang = readLang(req) as UiLang;
  const learning = readLearningDirection(req) as LearningDirection;
  try {
    if (learning === "zh-ja" && !dbEnabled()) throw new Error("Japanese catalogue requires the database");
    const words = (await getAllCardWords(lang, learning)).filter((word) => legacyRentalWordVisible(word.id, req.url));
    return publicJson({ words, total: words.length }, req, true, regionalCatalogueActive);
  } catch (error) {
    console.warn("[api/words] catalogue unavailable", error);
    return NextResponse.json({ error: "catalogue unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } });
  }
}
