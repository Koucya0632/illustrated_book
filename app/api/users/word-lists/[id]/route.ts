// One 個人詞表: its words and counts, renaming it, deleting it.
// Deleting is never membership-gated — a refund must not trap data.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import {
  deleteWordList,
  getWordList,
  renameWordList,
  wordListIndex,
  wordListWords,
} from "@/lib/word-lists/db";
import {
  checkEditList,
  checkKeepList,
  checkStudyList,
  normalizeWordListName,
  wordListLimits,
} from "@/lib/word-lists/policy";
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

export async function GET(_req: Request, ctx: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await wordListAccessFor(userId);
  const refusal = checkKeepList(access);
  if (refusal) return refusalResponse(refusal);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const list = await getWordList(userId, id);
  if (!list) return notFound();

  const locked = (await wordListIndex(userId, list)) >= wordListLimits(access).lists;
  const { wordIds, stats } = await wordListWords(userId, list);
  return NextResponse.json(
    {
      list: { ...list, locked },
      wordIds,
      stats,
      canEdit: checkEditList(access, locked) === null,
      canStudy: checkStudyList(access, locked) === null,
      wordLimit: wordListLimits(access).words,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await wordListAccessFor(userId);
  const unavailable = checkKeepList(access);
  if (unavailable) return refusalResponse(unavailable);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const list = await getWordList(userId, id);
  if (!list) return notFound();

  const locked = (await wordListIndex(userId, list)) >= wordListLimits(access).lists;
  const refusal = checkEditList(access, locked);
  if (refusal) return refusalResponse(refusal);

  const body = await readJson<{ name?: unknown }>(req);
  const name = normalizeWordListName(body?.name);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  await renameWordList(userId, id, name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const refusal = checkKeepList(await wordListAccessFor(userId));
  if (refusal) return refusalResponse(refusal);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();
  const deleted = await deleteWordList(userId, id);
  return deleted ? NextResponse.json({ ok: true }) : notFound();
}
