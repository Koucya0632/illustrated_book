import { NextResponse } from "next/server";
import { getWord } from "@/lib/data";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public single-word detail as JSON — used by the study peek modal (getWord is
// server-only, so the client fetches it through here). Localized to the
// signed-in user's UI language (falls back to zh-Hant for anonymous callers).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
  const word = await getWord(params.id, lang);
  if (!word) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(word);
}
