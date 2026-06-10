// Public listing of every published word, localized to the caller's UI
// language. Returns the lite CardWord shape (id / word / chinese / imageUrl
// / category / pronunciation) — heavy fields like definitions / examples
// / relations stay behind the per-word /api/words/[id] endpoint.
//
// iOS WordsStore calls this once at app launch and keeps the array
// in-memory; the next-cache wrapper inside `getAllCardWords` keeps the
// DB hit amortized across requests.

import { NextResponse } from "next/server";
import { getAllCardWords } from "@/lib/data";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
  const words = await getAllCardWords(lang);
  return NextResponse.json({ words, total: words.length });
}
