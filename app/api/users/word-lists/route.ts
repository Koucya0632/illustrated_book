// 個人詞表: the owner's lists in the current learning language, and creating one.
// Rules live in lib/word-lists/policy.ts; this only asks them.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { createWordList, listWordLists } from "@/lib/word-lists/db";
import {
  checkCreateList,
  checkKeepList,
  lockedWordListIds,
  normalizeWordListName,
  wordListLimits,
  wordListsAvailable,
} from "@/lib/word-lists/policy";
import {
  readJson,
  refusalResponse,
  requestLanguage,
  wordListAccessFor,
} from "@/lib/word-lists/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * `?word=<id>` adds `containsWord` to each list, for the 加入詞表 sheet.
 * Under v1 this answers `available: false` rather than an error, so the app
 * can hide the entry point without treating it as a failure.
 */
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await wordListAccessFor(userId);
  if (!wordListsAvailable(access)) {
    return NextResponse.json({ available: false, lists: [] }, { headers: NO_STORE });
  }
  const lang = await requestLanguage(req, userId);
  const wordId = new URL(req.url).searchParams.get("word")?.trim() || undefined;
  const lists = await listWordLists(userId, lang, wordId);
  const locked = new Set(lockedWordListIds(lists.map((l) => l.id), access));
  return NextResponse.json(
    {
      available: true,
      tier: access.tier,
      canCreate: checkCreateList(access, lists.length) === null,
      limits: wordListLimits(access),
      lists: lists.map((l) => ({ ...l, locked: locked.has(l.id) })),
    },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const access = await wordListAccessFor(userId);
  const unavailable = checkKeepList(access);
  if (unavailable) return refusalResponse(unavailable);

  const body = await readJson<{ name?: unknown }>(req);
  const name = normalizeWordListName(body?.name);
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  const lang = await requestLanguage(req, userId);
  const result = await createWordList(userId, lang, name, (count) => checkCreateList(access, count));
  if ("refusal" in result) return refusalResponse(result.refusal);
  return NextResponse.json({ list: { ...result.list, locked: false } }, { status: 201 });
}
