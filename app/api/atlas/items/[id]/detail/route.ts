import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import {
  getAtlasImage,
  getAtlasItem,
  markAtlasItemBackfillFailed,
  updateAtlasItemEnrichment,
} from "@/lib/atlas-db";
import { atlasItemToWord, enrichAtlasItem, needsJaEnrichRefresh } from "@/lib/atlas/enrich";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Full per-word detail for a custom atlas item, in the same shape as
// /api/words/[id] (the iOS `Word`). Auth-gated (user-owned); no-store.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Lazy enrich: covers cards made before enrichment existed (or that missed the
  // background pass). Also re-runs once for JA cards enriched under an older
  // scheme (missing the Japanese target definition and/or kana reading) so they
  // self-heal. First open is slower; later reads use the stored blob.
  if (item.backfill_status !== "filled" || needsJaEnrichRefresh(item)) {
    try {
      const fields = await enrichAtlasItem(item);
      await updateAtlasItemEnrichment(userId, item.id, fields);
      const refreshed = await getAtlasItem(userId, item.id);
      if (refreshed) item = refreshed;
    } catch (err) {
      await markAtlasItemBackfillFailed(
        userId,
        item.id,
        err instanceof Error ? err.message : "enrich failed",
      ).catch(() => {});
      // fall through — still return name + image so the page isn't empty
    }
  }

  let imageUrl = "";
  const image = await getAtlasImage(userId, item.image_id);
  if (image) {
    try {
      const urls = await createAtlasImageSignedUrls({
        imagePath: image.original_path,
        thumbPath: image.thumb_path,
      });
      imageUrl = urls.imageUrl;
    } catch {
      imageUrl = "";
    }
  }

  return NextResponse.json(atlasItemToWord(item, imageUrl), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
