// Reorders the owner's lists. Never membership-gated: order decides which lists
// stay usable after a downgrade, so it is how a person chooses them.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { reorderWordLists } from "@/lib/word-lists/db";
import { checkKeepList } from "@/lib/word-lists/policy";
import {
  readJson,
  refusalResponse,
  requestLanguage,
  UUID_RE,
  wordListAccessFor,
} from "@/lib/word-lists/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const refusal = checkKeepList(await wordListAccessFor(userId));
  if (refusal) return refusalResponse(refusal);

  const body = await readJson<{ ids?: unknown }>(req);
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids || ids.length > 500 || !ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  await reorderWordLists(userId, await requestLanguage(req, userId), ids as string[]);
  return NextResponse.json({ ok: true });
}
