import { regionalCatalogueActive } from "@/lib/australian-word-variants";
import { NextResponse } from "next/server";
import { getLearningWord } from "@/lib/data";
import { legacyRentalWordVisible } from "@/lib/australian-categories";
import { dbEnabled } from "@/lib/db";
import type { LearningDirection, UiLang } from "@/lib/settings";
import {
  publicJson,
  readLang,
  readLearningDirection,
} from "@/lib/cache-headers";

export const runtime = "nodejs";
export const revalidate = 300;

// Public single-word detail as JSON — used by the study peek modal (getWord is
// server-only, so the client fetches it through here). Localized via `?lang=`.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const lang = readLang(req) as UiLang;
  const learning = readLearningDirection(req) as LearningDirection;
  try {
    if (learning === "zh-ja" && !dbEnabled()) throw new Error("Japanese catalogue requires the database");
    const word = legacyRentalWordVisible(params.id, req.url) ? await getLearningWord(params.id, lang, learning) : undefined;
    if (!word) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } });
    return publicJson(word, req, true, regionalCatalogueActive);
  } catch (error) {
    console.warn("[api/words] detail unavailable", error);
    return NextResponse.json({ error: "catalogue unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } });
  }
}
