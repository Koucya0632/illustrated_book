import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { listAtlasCustomWords } from "@/lib/atlas-db";
import { atlasItemToWord } from "@/lib/atlas/enrich";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";
import { getSettings } from "@/lib/users-db";
import { targetLanguageFor } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const targetLanguage = targetLanguageFor(settings.learningDirection);
  const rows = await listAtlasCustomWords(userId, targetLanguage);
  const words = await Promise.all(
    rows.map(async (row) => {
      const urls = await createAtlasImageSignedUrls({
        imagePath: row.originalPath,
        thumbPath: row.thumbPath,
      });
      const thumb = urls.thumbUrl || urls.imageUrl;
      const item = row.item;
      return {
        id: `atlas:${item.id}`,
        word: item.lemma,
        chinese: item.display_zh_hant,
        imageUrl: thumb,
        category: "custom",
        pronunciation: item.pronunciation ?? "",
        reading: item.reading ?? undefined,
        targetLanguage: item.target_language,
        audioUrls: undefined,
        // Full per-word detail in the same `Word` shape as
        // /api/atlas/items/{id}/detail — lets iOS open WordDetailView with
        // zero extra round-trips. Hero uses the full-size image; the grid card
        // above keeps the thumb. Only embedded once the item is enriched
        // ('filled', the usual case via capture-time enrich); otherwise we omit
        // it so iOS still falls back to the detail endpoint, which lazy-enriches
        // the item on first open.
        detail:
          item.backfill_status === "filled"
            ? atlasItemToWord(item, urls.imageUrl || thumb)
            : undefined,
      };
    }),
  );

  return NextResponse.json(
    { words, total: words.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
