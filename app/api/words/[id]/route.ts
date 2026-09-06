import { NextResponse } from "next/server";
import { getLearningWord } from "@/lib/data";
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
  const word = await getLearningWord(params.id, lang, learning);
  if (!word) return NextResponse.json({ error: "not found" }, { status: 404 });
  return publicJson(word, req);
}
