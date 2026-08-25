import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { listAtlasCustomWords } from "@/lib/atlas-db";
import { atlasItemToWord } from "@/lib/atlas/enrich";
import { needsEnrichRefresh } from "@/lib/atlas/enrich-policy";
import { pickAtlasGloss } from "@/lib/atlas/gloss";
import { toZhHans } from "@/lib/opencc";
import { readLang, readLearningDirection } from "@/lib/cache-headers";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";
import { getSettings } from "@/lib/users-db";
import { targetLanguageFor } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  // ?lang= / ?learning= win over the stored setting: right after an in-app
  // switch the debounced settings save may not have landed yet, so reading the
  // stored learningDirection here would return the custom 圖鑑 for the *old*
  // target language until the POST lands (mirrors /api/words).
  const targetLanguage = targetLanguageFor(
    readLearningDirection(req, settings.learningDirection),
  );
  const uiLang = readLang(req, settings.uiLang);
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
        chinese:
          uiLang === "zh-Hans"
            ? toZhHans(pickAtlasGloss(item, uiLang))
            : pickAtlasGloss(item, uiLang),
        imageUrl: thumb,
        category: "custom",
        pronunciation: item.pronunciation ?? item.reading ?? "",
        reading: item.reading ?? undefined,
        targetLanguage: item.target_language,
        audioUrls: undefined,
        // Full per-word detail in the same `Word` shape as
        // /api/atlas/items/{id}/detail — lets iOS open WordDetailView with
        // zero extra round-trips. Hero uses the full-size image; the grid card
        // above keeps the thumb. Only embedded once the item is enriched
        // ('filled', the usual case via capture-time enrich); otherwise we omit
        // it so iOS still falls back to the detail endpoint, which lazy-enriches
        // the item on first open. JA rows enriched under an older scheme (no
        // Japanese definition and/or reading) are likewise left un-embedded so
        // that detour re-enriches them.
        detail:
          item.backfill_status === "filled" && !needsEnrichRefresh(item)
            ? atlasItemToWord(item, urls.imageUrl || thumb, uiLang)
            : undefined,
      };
    }),
  );

  return NextResponse.json(
    { words, total: words.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
