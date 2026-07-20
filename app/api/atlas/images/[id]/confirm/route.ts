import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { confirmAtlasItem, getAtlasImage } from "@/lib/atlas-db";
import { checkAtlasCapacity } from "@/lib/atlas/entitlement";
import { normalizeTargetLanguage, targetLanguageFromDirection } from "@/lib/atlas/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function cleanText(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const image = await getAtlasImage(userId, params.id);
  if (!image) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const settings = await getSettings(userId);
  const targetLanguage =
    normalizeTargetLanguage(body.targetLanguage) ??
    targetLanguageFromDirection(settings.learningDirection);
  const lemma = cleanText(body.lemma || body.fineLabel || body.primaryLabel);
  const primaryLabel = cleanText(body.primaryLabel || lemma);
  const displayZhHant = cleanText(body.displayZhHant || body.zhHant || lemma);
  if (!lemma || !primaryLabel || !displayZhHant) {
    return NextResponse.json(
      { error: "lemma, primaryLabel and displayZhHant are required" },
      { status: 400 },
    );
  }

  // Enforce the tier capacity before growing the collection (authoritative gate;
  // the client also blocks at capture entry). Free hitting its cap → 402
  // (upgrade raises it); Pro at its cap → 429 (must delete, upgrade won't help).
  const capacity = await checkAtlasCapacity(userId);
  if (!capacity.ok) {
    return NextResponse.json(
      {
        error: capacity.upgradeable ? "quota_exceeded" : "capacity_full",
        scope: "capacity",
        message: capacity.message,
      },
      { status: capacity.upgradeable ? 402 : 429 },
    );
  }

  const selectedCandidateId =
    typeof body.selectedCandidateId === "string" && !invalidId(body.selectedCandidateId)
      ? body.selectedCandidateId
      : null;
  // The capture sheet's gloss field, in the capturing user's UI language
  // (candidate gloss or a user edit). Routed into the matching per-language
  // column; the enrich gloss pack fills whichever stays null.
  const displayGloss = cleanText(body.displayGloss, 80);
  const item = await confirmAtlasItem({
    userId,
    imageId: image.id,
    selectedCandidateId,
    targetLanguage,
    primaryLabel,
    fineLabel: cleanText(body.fineLabel) || null,
    lemma,
    displayZhHant,
    displayJa: settings.uiLang === "ja" && displayGloss ? displayGloss : null,
    displayEn: settings.uiLang === "en" && displayGloss ? displayGloss : null,
    partOfSpeech: cleanText(body.partOfSpeech, 40) || null,
    category: cleanText(body.category, 60) || null,
  });

  return NextResponse.json(
    { item },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
