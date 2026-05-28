import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getCardById, upsertReview } from "@/lib/cards-db";
import { humanizeInterval, schedule, type Rating } from "@/lib/srs";
import { applyAnswer, masteryLevel } from "@/lib/mastery";
import {
  getMasteryRow,
  upsertMastery,
  insertStudyLog,
  type StudyLogActivity,
} from "@/lib/users-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_RATINGS: Rating[] = ["重來", "困難", "穩定", "熟練"];
const RATING_TO_SMALLINT: Record<Rating, 0 | 1 | 2 | 3> = {
  重來: 0,
  困難: 1,
  穩定: 2,
  熟練: 3,
};

// Both current decks (recall + cloze) render as MCQ in StudyClient. Future
// modes (typing, listening) should be set explicitly by the client.
function defaultActivity(cardType: string): StudyLogActivity {
  if (cardType === "填空卡") return "mcq";
  if (cardType === "回想卡") return "mcq";
  return "flashcard";
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    cardId?: number;
    rating?: string;
    responseMs?: number;
    sessionId?: string;
    activity?: StudyLogActivity;
  };
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

  // 1) Card-level SRS
  const prevState = card.state
    ? { status: card.state.status, intervalDays: Number(card.state.interval_days) || 0 }
    : { status: "新卡" as const, intervalDays: 0 };
  const mistakeStats = card.state
    ? {
        reviewCount: card.state.review_count,
        mistakeCount: card.state.mistake_count,
      }
    : undefined;
  const next = schedule(prevState, rating, mistakeStats);
  const isMistake = rating === "重來";

  await upsertReview(userId, cardId, {
    status: next.status,
    intervalDays: next.intervalDays,
    nextReviewAt: next.nextReviewAt,
    rating,
  }, isMistake);

  // 2) Word-level mastery (shared across all cards of this word)
  const prevMasteryRow = await getMasteryRow(userId, card.word.id);
  const prevMastery = prevMasteryRow?.mastery ?? 0;
  const prevReviewedAt = prevMasteryRow?.last_reviewed_at
    ? new Date(prevMasteryRow.last_reviewed_at)
    : null;
  const masteryResult = applyAnswer(prevMastery, prevReviewedAt, rating);
  await upsertMastery(userId, card.word.id, masteryResult.mastery);

  // 3) Append-only event log. Best-effort: a logging failure must not poison
  //    the answer flow (state is already updated). Partition-pruned writes
  //    drop into the current month's child of study_logs.
  try {
    const responseMs =
      typeof body.responseMs === "number" && Number.isFinite(body.responseMs)
        ? Math.max(0, Math.min(body.responseMs, 600_000))
        : null;
    await insertStudyLog({
      userId,
      wordId: card.word.id,
      activity: body.activity ?? defaultActivity(card.card.card_type),
      rating: RATING_TO_SMALLINT[rating],
      isCorrect: !isMistake,
      responseMs,
      intervalBefore: prevState.intervalDays,
      intervalAfter: next.intervalDays,
      masteryBefore: masteryResult.previousDecayed,
      masteryAfter: masteryResult.mastery,
      clientSessionId: body.sessionId?.slice(0, 64) ?? null,
      metadata: { cardId, deckKey: card.card.deck_key },
    });
  } catch (err) {
    console.warn("[study/answer] study_logs insert failed", err);
  }

  return NextResponse.json({
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
  });
}
