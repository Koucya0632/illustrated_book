import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { createAtlasCardsForItem, getAtlasItem } from "@/lib/atlas-db";
import type { AtlasCardType } from "@/lib/atlas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CARD_TYPES = new Set<AtlasCardType>([
  "image_recall",
  "flashcard",
  "spelling",
  "word_recall",
]);

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (invalidId(params.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const item = await getAtlasItem(userId, params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { cardTypes?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const requested = Array.isArray(body.cardTypes)
    ? body.cardTypes.filter((value): value is AtlasCardType => VALID_CARD_TYPES.has(value))
    : [];
  // 自製圖鑑 items study as a single card. The unified study flow renders every
  // custom card as an image MCQ (see ReviewFlowView) and dedupes the queue to
  // one card per item, so a second card_type is pure overhead — extra SRS
  // state, doubled due counts, and wasted signed-URL work. Collapse any request
  // (including older clients that still send both) to one canonical card,
  // preferring image_recall.
  const canonical: AtlasCardType = requested.includes("image_recall")
    ? "image_recall"
    : requested[0] ?? "image_recall";
  const cards = await createAtlasCardsForItem(userId, item.id, [canonical]);

  return NextResponse.json(
    { cards },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
