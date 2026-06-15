import { NextResponse } from "next/server";
import { getWord } from "@/lib/data";
import type { UiLang } from "@/lib/settings";
import { publicJson, readLang } from "@/lib/cache-headers";

export const runtime = "nodejs";
export const revalidate = 300;

// Public single-word detail as JSON — used by the study peek modal (getWord is
// server-only, so the client fetches it through here). Localized via `?lang=`.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const lang = readLang(req) as UiLang;
  const word = await getWord(params.id, lang);
  if (!word) return NextResponse.json({ error: "not found" }, { status: 404 });
  return publicJson(word, req);
}
