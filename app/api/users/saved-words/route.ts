// The user's saved 公開圖鑑 items, shaped as words.
//
// Sibling of /api/users/custom-words rather than an extension of it: those two
// are the CREATION and CONSUMPTION halves of the atlas, and the quota split
// that keeps saving other people's photos from eating your own capture slots
// is structural (docs/COMMUNITY_ATLAS_PLAN.md §4.1 — separate tables). One
// endpoint returning both invites code that counts them together.
//
// Word shape on purpose: iOS merges these into WordsStore under
// `category: "community"`, so the 圖鑑 page's theme chip, list, mastery badges
// and search all work with no new list logic. The `saved:` id prefix routes
// taps to AtlasPublicDetailView — these belong to someone else, so the
// destination has an author, a 取消收藏 and a 檢舉, which the word detail
// screen has none of.

import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { listAtlasSavedItems } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import { toZhHans } from "@/lib/opencc";
import { readLang, readLearningDirection } from "@/lib/cache-headers";
import { getSettings } from "@/lib/users-db";
import { targetLanguageFor } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  // ?lang= / ?learning= win over the stored setting, same as custom-words: right
  // after an in-app switch the debounced save may not have landed yet.
  const targetLanguage = targetLanguageFor(
    readLearningDirection(req, settings.learningDirection),
  );
  const uiLang = readLang(req, settings.uiLang);

  const rows = await listAtlasSavedItems(userId, targetLanguage);
  // Shape must match CardWord exactly: `imageUrl` and `pronunciation` are
  // non-optional on the client, so a null there fails the whole decode and the
  // theme silently never appears.
  const words = rows.map((row) => ({
    id: `saved:${row.public_slug}`,
    word: row.lemma,
    chinese: uiLang === "zh-Hans" ? toZhHans(row.display_zh_hant) : row.display_zh_hant,
    // Public bucket — no signed URL needed, unlike the owner's private originals.
    imageUrl: atlasPublicImageUrl(row.image_public_path) ?? "",
    category: "community",
    // The public item row carries no reading; the detail screen fetches the
    // full item by slug when opened.
    pronunciation: "",
    targetLanguage: row.target_language,
  }));

  return NextResponse.json(
    { words, total: words.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
