// Public listing of every category with display metadata, localized via
// `?lang=`. iOS CategoriesStore calls this once at app launch and keeps
// the result in-memory alongside WordsStore. The 主題組合 ride along, trimmed
// to the themes this response serves (lib/topic-presets.ts).

import { getCategoriesFromDb } from "@/lib/categories-db";
import type { UiLang } from "@/lib/settings";
import { publicJson, readLang } from "@/lib/cache-headers";
import { localizeTopicPresets } from "@/lib/topic-presets";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: Request) {
  const lang = readLang(req) as UiLang;
  const categories = await getCategoriesFromDb(lang);
  const presets = localizeTopicPresets(lang, new Set(categories.map((c) => c.id)));
  return publicJson({ categories, presets }, req);
}
