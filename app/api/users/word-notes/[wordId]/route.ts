// One 個人筆記: write it (members), delete it (anyone who has one — a refund
// must not trap data).

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getMembershipAccess } from "@/lib/atlas/entitlement";
import { deleteWordNote, noteableWord, upsertWordNote } from "@/lib/word-notes/db";
import { checkKeepNote, checkWriteNote, normalizeWordNote } from "@/lib/word-notes/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ wordId: string }> };

function refused(r: { status: number; error: string; upgradeTo: string | null }) {
  return NextResponse.json({ error: r.error, upgradeTo: r.upgradeTo }, { status: r.status });
}

export async function POST(req: Request, ctx: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const refusal = checkWriteNote(await getMembershipAccess(userId));
  if (refusal) return refused(refusal);

  let raw: { body?: unknown } | null = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = normalizeWordNote(raw?.body);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { wordId } = await ctx.params;
  // Official words only: 自製 (atlas:) and 物見 (saved:) ids are not in `words`.
  if (!(await noteableWord(wordId))) {
    return NextResponse.json({ error: "unknown_word" }, { status: 400 });
  }
  return NextResponse.json({ note: await upsertWordNote(userId, wordId, body) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const refusal = checkKeepNote(await getMembershipAccess(userId));
  if (refusal) return refused(refusal);
  const { wordId } = await ctx.params;
  await deleteWordNote(userId, wordId);
  return NextResponse.json({ ok: true });
}
