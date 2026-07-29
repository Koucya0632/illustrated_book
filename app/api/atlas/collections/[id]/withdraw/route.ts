// 取消公開合集 — the author taking their own collection off the browse feed.
//
// The counterpart to publish, and the same distinction as items: 'withdrawn'
// is the author's reversible choice, 'takedown' is moderation's and is not.
//
// Members are deliberately left published. A 合集 is a shelf over items that
// are each public in their own right; unpublishing the shelf must not silently
// unpublish somebody's photos with it.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { withdrawAtlasCollection } from "@/lib/atlas-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 404 also covers someone else's collection and a moderation takedown:
  // neither is the caller's to reverse, and distinguishing them would confirm
  // the collection exists.
  const collection = await withdrawAtlasCollection(params.id, userId);
  if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    { ok: true, collection },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
