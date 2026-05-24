import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getCardById, upsertReview } from "@/lib/cards-db";
import { humanizeInterval, schedule, type Rating } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_RATINGS: Rating[] = ["重來", "困難", "穩定", "熟練"];

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { cardId?: number; rating?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const cardId = Number(body.cardId);
  const rating = body.rating as Rating;
  if (!Number.isFinite(cardId) || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
  }

  const card = await getCardById(cardId, userId);
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const prevState = card.state
    ? { status: card.state.status, intervalDays: Number(card.state.interval_days) || 0 }
    : { status: "新卡" as const, intervalDays: 0 };
  const next = schedule(prevState, rating);
  const isMistake = rating === "重來";

  await upsertReview(userId, cardId, {
    status: next.status,
    intervalDays: next.intervalDays,
    nextReviewAt: next.nextReviewAt,
    rating,
  }, isMistake);

  return NextResponse.json({
    ok: true,
    next: {
      status: next.status,
      intervalDays: next.intervalDays,
      nextReviewAt: next.nextReviewAt.toISOString(),
      humanized: humanizeInterval(next.intervalDays),
    },
  });
}
