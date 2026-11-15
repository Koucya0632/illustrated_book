// Admin-gated by middleware (ADMIN_COOKIE). A human's decision on one item:
// approve (publish it, or let its pending 合集 go live), reject (off 物見 too,
// if it was up) or take it down for good. The rules are the publication
// lifecycle's (lib/atlas/publication.ts, `moderate`).

import { NextResponse } from "next/server";
import { atlasPublication } from "@/lib/atlas/publication-live";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import { isUuid } from "@/lib/http/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isUuid(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "takedown") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const result = await atlasPublication().moderate(params.id, action);
  if (!result.ok) {
    return result.reason === "not_allowed"
      ? NextResponse.json({ error: "image not found" }, { status: 400 })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (result.deferredToCollections) {
    return NextResponse.json({ ok: true, deferredToCollections: true, publishedCollectionIds: result.deferredToCollections });
  }
  return NextResponse.json({
    ok: true,
    item: result.publicItem,
    imageUrl: result.publicItem ? atlasPublicImageUrl(result.publicItem.image_public_path) : undefined,
  });
}
