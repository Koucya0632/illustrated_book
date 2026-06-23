// Public listing of every published word, localized via `?lang=`. Returns
// the lite CardWord shape (id / word / chinese / imageUrl / category /
// pronunciation) — heavy fields like definitions / examples / relations
// stay behind the per-word /api/words/[id] endpoint.
//
// CDN-cacheable: the only input is `lang`, so the same (lang, payload) pair
// is shared across all callers. `getAllCardWords`'s `unstable_cache` layer
// keeps origin DB hits amortized.

import { getAllCardWords } from "@/lib/data";
import type { LearningDirection, UiLang } from "@/lib/settings";
import {
  publicJson,
  readLang,
  readLearningDirection,
} from "@/lib/cache-headers";

export const runtime = "nodejs";
// Next 14 auto-emits `Cache-Control: s-maxage=300, stale-while-revalidate=...`
// when `revalidate` is set on a Route Handler segment. Tag-based invalidation
// (`revalidateTag("words")`) still kicks in via the underlying unstable_cache.
export const revalidate = 300;

export async function GET(req: Request) {
  const lang = readLang(req) as UiLang;
  const learning = readLearningDirection(req) as LearningDirection;
  const words = await getAllCardWords(lang, learning);
  return publicJson({ words, total: words.length }, req);
}
