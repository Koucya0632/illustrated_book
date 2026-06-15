// Public listing of every category with display metadata, localized via
// `?lang=`. iOS CategoriesStore calls this once at app launch and keeps
// the result in-memory alongside WordsStore.

import { getCategoriesFromDb } from "@/lib/categories-db";
import type { UiLang } from "@/lib/settings";
import { publicJson, readLang } from "@/lib/cache-headers";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: Request) {
  const lang = readLang(req) as UiLang;
  const categories = await getCategoriesFromDb(lang);
  return publicJson({ categories }, req);
}
