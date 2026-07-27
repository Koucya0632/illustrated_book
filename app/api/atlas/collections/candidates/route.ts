// The pool of items the current user can add to a collection: their own
// approved public items in the given language. Fresh (private, no-store) so a
// just-approved item shows up in the picker immediately.
//
// Static `candidates` segment takes precedence over the sibling `[id]` route,
// so this never collides with GET /api/atlas/collections/{uuid}.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { listUserApprovedPublicItems } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";
import type { AtlasTargetLanguage } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function targetLanguage(v: string | null): AtlasTargetLanguage | null {
  return v === "en" || v === "ja" ? v : null;
}

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!getSql()) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const lang = targetLanguage(new URL(req.url).searchParams.get("lang"));
  if (!lang) return NextResponse.json({ error: "invalid lang" }, { status: 400 });

  const rows = await listUserApprovedPublicItems(userId, lang);
  return NextResponse.json(
    { items: rows.map(serializeAtlasPublicItem) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
