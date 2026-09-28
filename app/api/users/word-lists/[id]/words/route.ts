// Adds a word to, or removes it from, one 個人詞表. Removing is never
// membership-gated; adding is the member feature and counts against the cap.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  addWordToList,
  getWordList,
  removeWordFromList,
  wordExists,
  wordListIndex,
} from "@/lib/word-lists/db";
import { checkAddWord, checkKeepList, wordListLimits } from "@/lib/word-lists/policy";
import {
  notFound,
  readJson,
  refusalResponse,
  UUID_RE,
  wordListAccessFor,
} from "@/lib/word-lists/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await wordListAccessFor(userId);
  const unavailable = checkKeepList(access);
  if (unavailable) return refusalResponse(unavailable);

  const body = await readJson<{ wordId?: unknown; add?: unknown }>(req);
  const wordId = typeof body?.wordId === "string" ? body.wordId.trim() : "";
  if (!wordId || typeof body?.add !== "boolean") {
    return NextResponse.json({ error: "wordId + add required" }, { status: 400 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const list = await getWordList(userId, id);
  if (!list) return notFound();

  if (!body.add) {
    await removeWordFromList(list.id, wordId);
    return NextResponse.json({ ok: true });
  }
  // Official words only: 自製 (atlas:) and 物見 (saved:) ids are not in `words`.
  if (!(await wordExists(wordId))) {
    return NextResponse.json({ error: "unknown_word" }, { status: 400 });
  }
  const locked = (await wordListIndex(userId, list)) >= wordListLimits(access).lists;
  const result = await addWordToList(userId, list, wordId, (count) =>
    checkAddWord(access, locked, count),
  );
  if ("refusal" in result) return refusalResponse(result.refusal);
  return NextResponse.json({ ok: true });
}
