// 取消公開合集 — the author taking their own live collection off the browse feed.
//
// The counterpart to publish, and the same distinction as items: 'withdrawn'
// is the author's reversible choice, 'takedown' is moderation's and is not, and
// a 合集 under review is not the author's to move (lib/atlas/publication.ts).
//
// Members are deliberately left published. A 合集 is a shelf over items that
// are each public in their own right; unpublishing the shelf must not silently
// unpublish somebody's photos with it.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { atlasPublication } from "@/lib/atlas/publication-live";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 404 also covers someone else's collection: distinguishing it would confirm
  // the collection exists.
  const result = await atlasPublication().withdrawCollection(params.id, userId);
  if (!result.ok) {
    return result.reason === "not_allowed"
      ? NextResponse.json({ error: "not_withdrawable" }, { status: 409, headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, collection: result.collection },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
