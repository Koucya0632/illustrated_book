// 個人筆記: every note the person has. Under v1 this answers
// `available: false`, so the app can hide the feature without an error.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getMembershipAccess } from "@/lib/atlas/entitlement";
import { listWordNotes } from "@/lib/word-notes/db";
import { canWriteWordNotes, WORD_NOTE_MAX, wordNotesAvailable } from "@/lib/word-notes/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await getMembershipAccess(userId);
  const headers = { "Cache-Control": "private, no-store" };
  if (!wordNotesAvailable(access)) {
    return NextResponse.json({ available: false, canWrite: false, notes: [] }, { headers });
  }
  return NextResponse.json(
    {
      available: true,
      canWrite: canWriteWordNotes(access),
      maxLength: WORD_NOTE_MAX,
      notes: await listWordNotes(userId),
    },
    { headers },
  );
}
