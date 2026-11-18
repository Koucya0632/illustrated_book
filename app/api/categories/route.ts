// Public listing of every category with display metadata, localized via
// `?lang=`. iOS CategoriesStore calls this once at app launch and keeps
// the result in-memory alongside WordsStore. The 主題組合 ride along, trimmed
// to the themes this response serves (lib/topic-presets.ts).

import { getCategoriesFromDb } from "@/lib/categories-db";
import { regionalCatalogueActive } from "@/lib/australian-word-variants";
import { NextResponse } from "next/server";
import type { UiLang } from "@/lib/settings";
import { publicJson, readLang } from "@/lib/cache-headers";
import { localizeTopicPresets } from "@/lib/topic-presets";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: Request) {
  const lang = readLang(req) as UiLang;
  const rawDirection = new URL(req.url).searchParams.get("learning");
  const direction = rawDirection === "zh-en" || rawDirection === "zh-ja" ? rawDirection : undefined;
  try {
    const categories = await getCategoriesFromDb(lang, direction);
    const presets = localizeTopicPresets(lang, new Set(categories.map((c) => c.id)));
    return publicJson({ categories, presets }, req, true, regionalCatalogueActive);
  } catch {
    return NextResponse.json({ error: "categories unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } });
  }
}
