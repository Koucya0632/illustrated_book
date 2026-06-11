// Public listing of every category with display metadata, localized to
// the caller's UI language. iOS CategoriesStore calls this once at app
// launch and keeps the result in-memory alongside WordsStore.

import { NextResponse } from "next/server";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
  const categories = await getCategoriesFromDb(lang);
  return NextResponse.json({ categories });
}
