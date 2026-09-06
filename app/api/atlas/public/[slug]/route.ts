import { NextResponse } from "next/server";
import { getAtlasPublicItem, getAtlasPublicSourceItem } from "@/lib/atlas-db";
import { serializeAtlasPublicItem } from "@/lib/atlas/public-serialize";
import { atlasItemToWord } from "@/lib/atlas/enrich";
import { getAllCardWords, getLearningWord } from "@/lib/data";
import { readLang } from "@/lib/cache-headers";
import type { LearningDirection, UiLang } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const row = await getAtlasPublicItem(slug);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = serializeAtlasPublicItem(row);
  const source = await getAtlasPublicSourceItem(row.source_item_id);
  const uiLang = readLang(req) as UiLang;
  const baseLearningWord = source
    ? atlasItemToWord(source, item.imageUrl ?? "", uiLang)
    : null;
  let canonicalExamples:
    | NonNullable<Awaited<ReturnType<typeof getLearningWord>>>["examples"]
    | null = null;

  // Existing dictionary examples only: matching and reading these records has
  // no AI cost. A source item without a canonical counterpart simply keeps the
  // ordinary atlas content and omits its example section.
  if (baseLearningWord) {
    const direction: LearningDirection =
      row.target_language === "ja" ? "zh-ja" : "zh-en";
    const cards = await getAllCardWords(uiLang, direction);
    const normalizedLemma = row.lemma.trim().toLocaleLowerCase();
    const match = cards.find(
      (word) => word.word.trim().toLocaleLowerCase() === normalizedLemma,
    );
    if (match) {
      const canonical = await getLearningWord(match.id, uiLang, direction);
      canonicalExamples = canonical?.examples?.length ? canonical.examples : null;
    }
  }
  const learningWord = baseLearningWord
    ? { ...baseLearningWord, examples: canonicalExamples }
    : null;

  return NextResponse.json(
    { item: { ...item, learningWord } },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        Vary: "Accept-Language, X-Tuji-Lang",
      },
    },
  );
}
