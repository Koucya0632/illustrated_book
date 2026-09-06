import { NextResponse } from "next/server";
import { getById, applyEnrichment } from "@/lib/words-db";
import { enrichWord } from "@/lib/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-gated by middleware (/api/admin/*). Generates AI enrichment for one
// word and applies it (relations + etymology + forms + mnemonic).
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const word = await getById(params.id);
  if (!word) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const result = await enrichWord({
      word: word.word,
      partOfSpeech: word.partOfSpeech,
      chinese: word.chinese,
    });
    await applyEnrichment(params.id, result);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[admin/enrich] failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "enrich failed" },
      { status: 500 },
    );
  }
}
