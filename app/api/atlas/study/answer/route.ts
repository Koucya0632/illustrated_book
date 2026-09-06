import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCurrentUserIdFast } from "@/lib/current-user";
import {
  getAtlasDueCardById,
  getAtlasMastery,
  insertAtlasStudyLog,
  upsertAtlasMastery,
  upsertAtlasReview,
} from "@/lib/atlas-db";
import { applyAnswer, masteryLevel } from "@/lib/mastery";
import { humanizeInterval, schedule, type Rating } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_RATINGS: Rating[] = ["重來", "困難", "穩定", "熟練"];
const RATING_TO_SMALLINT: Record<Rating, 0 | 1 | 2 | 3> = {
  重來: 0,
  困難: 1,
  穩定: 2,
  熟練: 3,
};
const VALID_ACTIVITIES = new Set([
  "flashcard",
  "mcq",
  "typing",
  "listening",
  "image_recall",
  "reading",
]);

function invalidId(id: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    cardId?: string;
    rating?: string;
    responseMs?: number;
    sessionId?: string;
    activity?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const rating = body.rating as Rating;
  if (invalidId(cardId) || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
  }

  const due = await getAtlasDueCardById(userId, cardId);
  if (!due) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const prevState = due.state
    ? { status: due.state.status, intervalDays: Number(due.state.interval_days) || 0 }
    : { status: "新卡" as const, intervalDays: 0 };
  const mistakeStats = due.state
    ? {
        reviewCount: due.state.review_count,
        mistakeCount: due.state.mistake_count,
      }
    : undefined;
  const next = schedule(prevState, rating, mistakeStats);
  const isMistake = rating === "重來";

  const masteryRow = await getAtlasMastery(userId, due.item.id, due.item.target_language);
  const prevMastery = masteryRow?.mastery ?? 0;
  const prevReviewedAt = masteryRow?.last_reviewed_at
    ? new Date(masteryRow.last_reviewed_at)
    : null;
  const masteryResult = applyAnswer(prevMastery, prevReviewedAt, rating);
  const responseMs =
    typeof body.responseMs === "number" && Number.isFinite(body.responseMs)
      ? Math.max(0, Math.min(body.responseMs, 600_000))
      : null;

  await Promise.all([
    upsertAtlasReview(userId, due.card.id, {
      status: next.status,
      intervalDays: next.intervalDays,
      nextReviewAt: next.nextReviewAt,
      rating,
    }, isMistake),
    upsertAtlasMastery(
      userId,
      due.item.id,
      due.item.target_language,
      masteryResult.mastery,
    ),
    insertAtlasStudyLog({
      userId,
      itemId: due.item.id,
      cardId: due.card.id,
      imageId: due.image.id,
      targetLanguage: due.item.target_language,
      activity: VALID_ACTIVITIES.has(body.activity ?? "")
        ? body.activity!
        : due.card.card_type === "image_recall"
        ? "image_recall"
        : "flashcard",
      rating: RATING_TO_SMALLINT[rating],
      isCorrect: !isMistake,
      responseMs,
      intervalBefore: prevState.intervalDays,
      intervalAfter: next.intervalDays,
      masteryBefore: masteryResult.previousDecayed,
      masteryAfter: masteryResult.mastery,
      clientSessionId: body.sessionId?.slice(0, 64) ?? null,
      metadata: { cardId: due.card.id, itemId: due.item.id },
    }).catch((err) => console.warn("[atlas/study/answer] study log insert failed", err)),
  ]);

  revalidateTag(`atlas-progress:${userId}`, "max");
  revalidateTag(`atlas-stats:${userId}`, "max");

  return NextResponse.json(
    {
      ok: true,
      next: {
        status: next.status,
        intervalDays: next.intervalDays,
        nextReviewAt: next.nextReviewAt.toISOString(),
        humanized: humanizeInterval(next.intervalDays),
        penaltyApplied: next.appliedPenalty && next.appliedPenalty < 1
          ? Math.round((1 - next.appliedPenalty) * 100)
          : 0,
      },
      mastery: {
        before: Math.round(masteryResult.previousDecayed),
        after: Math.round(masteryResult.mastery),
        delta: Math.round(masteryResult.delta),
        level: masteryLevel(masteryResult.mastery),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
