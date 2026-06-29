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

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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
  const cardTypes = requested.length > 0 ? requested : (["image_recall", "flashcard"] as AtlasCardType[]);
  const cards = await createAtlasCardsForItem(userId, item.id, cardTypes);

  return NextResponse.json(
    { cards },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
