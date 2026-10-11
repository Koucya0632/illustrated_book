import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getAtlasImage, getAtlasItem } from "@/lib/atlas-db";
import { atlasItemToWord } from "@/lib/atlas/enrich";
import { isAtlasItemLocked } from "@/lib/atlas/entitlement";
import { getSettings } from "@/lib/users-db";
import { readLang } from "@/lib/cache-headers";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Full per-word detail for a custom atlas item, in the same shape as
// /api/words/[id] (the iOS `Word`). Auth-gated (user-owned); no-store.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const settings = await getSettings(userId);
  const uiLang = readLang(req, settings.uiLang);

  // A read is only a read: 補充 is the included fulfillment of the credit
  // operation that made the card, run by the worker. This route used to carry
  // a lazy paid pass for the pre-credit flow (docs/adr/0011, superseded for
  // this path by 0016).
  const locked = await isAtlasItemLocked(userId, item.id);

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

  return NextResponse.json({ ...atlasItemToWord(item, imageUrl, uiLang), locked }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
