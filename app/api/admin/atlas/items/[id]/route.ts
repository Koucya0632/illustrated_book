import { NextResponse } from "next/server";
import {
  approveAtlasPublicItem,
  finalizeReadyCollectionsForItem,
  getAtlasReviewItem,
  pendingCollectionIdsForItem,
  prepareAtlasItemForCollectionPublication,
  rejectAtlasReviewItem,
  takedownAtlasPublicItem,
} from "@/lib/atlas-db";
import { getAtlasImage } from "@/lib/atlas-db";
import { publishAtlasShareImage } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (body.action === "reject") {
    const item = await rejectAtlasReviewItem(params.id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  }

  if (body.action === "takedown") {
    await takedownAtlasPublicItem(params.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "approve") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const item = await getAtlasReviewItem(params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const image = await getAtlasImage(item.user_id, item.image_id);
  if (!image) return NextResponse.json({ error: "image not found" }, { status: 400 });

  const publicItemId = item.public_slug ?? item.id;
  const published = await publishAtlasShareImage({
    publicItemId,
    privateThumbPath: image.thumb_path,
  });
  const pendingCollectionIds = await pendingCollectionIdsForItem(item.id);
  if (pendingCollectionIds.length > 0) {
    await prepareAtlasItemForCollectionPublication(item.id, published.path);
    const publishedCollectionIds = await finalizeReadyCollectionsForItem(item.id);
    return NextResponse.json({
      ok: true,
      deferredToCollections: true,
      publishedCollectionIds,
    });
  }
  const publicItem = await approveAtlasPublicItem({
    itemId: item.id,
    imagePublicPath: published.path,
  });

  return NextResponse.json({ ok: true, item: publicItem, imageUrl: published.publicUrl });
}
