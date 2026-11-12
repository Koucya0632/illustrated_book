// 跟著 Moira 去旅遊: the destinations, their maps and 景點, localized via
// `?lang=` (lib/travel/destinations.ts). Public and CDN-cacheable like
// /api/categories — nothing here depends on who is asking; which spots this
// account may study is the client's to decide from `free` and its membership.
//
// Only a 日文 learner gets any: the spots name Japanese places and the words
// are met there in Japanese, the same reason 場面 are zh-ja only. Any other
// direction answers an empty list, which is also what a client reads as "show
// no entry".
//
// A spot is `open` when the dictionary serves all of its words, so publishing
// the last word opens it on the next revalidation.

import { getAllCardWords } from "@/lib/data";
import type { LearningDirection, UiLang } from "@/lib/settings";
import { publicJson, readLang, readLearningDirection } from "@/lib/cache-headers";
import { FREE_STUDY_SPOTS } from "@/lib/study-membership";
import { localizeTravelDestinations } from "@/lib/travel/destinations";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: Request) {
  const lang = readLang(req) as UiLang;
  const learning = readLearningDirection(req) as LearningDirection;
  if (learning !== "zh-ja") return publicJson({ destinations: [] }, req);
  const words = await getAllCardWords(lang, learning);
  const destinations = localizeTravelDestinations(
    lang,
    new Set(words.map((w) => w.id)),
    FREE_STUDY_SPOTS,
  );
  return publicJson({ destinations }, req);
}
