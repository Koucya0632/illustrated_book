import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getCardById, upsertReview } from "@/lib/cards-db";
import {
  getAtlasDueCardById,
  getAtlasMastery,
  insertAtlasStudyLog,
  upsertAtlasMastery,
  upsertAtlasReview,
} from "@/lib/atlas-db";
import { humanizeInterval, schedule, type Rating } from "@/lib/srs";
import { applyAnswer, masteryLevel } from "@/lib/mastery";
import {
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
const VALID_ACTIVITIES = new Set([
  "flashcard",
  "mcq",
  "typing",
  "listening",
  "image_recall",
  "reading",
  "new_recognize",
]);

// Today's single deck (image-en) renders as MCQ via the "回想卡" card_type.
// Future modes (typing, listening) should be set explicitly by the client.
function defaultActivity(cardType: string): StudyLogActivity {
  if (cardType === "回想卡") return "mcq";
  return "flashcard";
}

function invalidUuid(id: string): boolean {
  // 8-4-4-4-12. The previous pattern was missing the 4th group's trailing
  // chars + the dash before the final 12, so it had only four groups and
  // rejected EVERY valid UUID — which 400'd every custom (atlas:) answer and
  // left their mastery permanently at 0.
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

async function answerAtlasCard(
  userId: string,
  cardId: string,
  rating: Rating,
  body: {
    responseMs?: number;
    sessionId?: string;
    activity?: string;
  },
) {
  if (invalidUuid(cardId)) {
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
  const activity = VALID_ACTIVITIES.has(body.activity ?? "")
    ? body.activity!
    : due.card.card_type === "image_recall"
    ? "image_recall"
    : "flashcard";

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
      activity,
      rating: RATING_TO_SMALLINT[rating],
      isCorrect: !isMistake,
      responseMs,
      intervalBefore: prevState.intervalDays,
      intervalAfter: next.intervalDays,
      masteryBefore: masteryResult.previousDecayed,
      masteryAfter: masteryResult.mastery,
      clientSessionId: body.sessionId?.slice(0, 64) ?? null,
      metadata: { cardId: due.card.id, itemId: due.item.id, source: "custom" },
    }).catch((err) => console.warn("[study/answer] atlas study log insert failed", err)),
  ]);

  revalidateTag(`progress:${userId}`);
  revalidateTag(`stats:${userId}`);
  revalidateTag(`atlas-progress:${userId}`);
  revalidateTag(`atlas-stats:${userId}`);

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

export async function POST(req: Request) {
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    cardId?: number | string;
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

  const rawCardId = body.cardId;
  const rating = body.rating as Rating;
  if (typeof rawCardId === "string" && rawCardId.startsWith("atlas:")) {
    if (!VALID_RATINGS.includes(rating)) {
      return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
    }
    return answerAtlasCard(userId, rawCardId.slice("atlas:".length), rating, body);
  }

  const cardId = Number(rawCardId);
  if (!Number.isFinite(cardId) || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
  }

  const card = await getCardById(cardId, userId);
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const targetLanguage = card.word.target_language;

  // 1) Card-level SRS schedule (pure compute).
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

  // 2) Word-level mastery — the previous row was joined into getCardById, so no
  //    extra read here. Pure compute (decay + EMA).
  const prevMastery = card.masteryRow?.mastery ?? 0;
  const prevReviewedAt = card.masteryRow?.last_reviewed_at
    ? new Date(card.masteryRow.last_reviewed_at)
    : null;
  const masteryResult = applyAnswer(prevMastery, prevReviewedAt, rating);

  const responseMs =
    typeof body.responseMs === "number" && Number.isFinite(body.responseMs)
      ? Math.max(0, Math.min(body.responseMs, 600_000))
      : null;

  // 3) Persist the three independent writes in parallel (one round trip instead
  //    of three). study_logs is best-effort — it swallows its own error so a
  //    logging failure never fails the answer.
  await Promise.all([
    upsertReview(userId, cardId, {
      status: next.status,
      intervalDays: next.intervalDays,
      nextReviewAt: next.nextReviewAt,
      rating,
    }, isMistake),
    upsertMastery(userId, card.word.id, masteryResult.mastery, targetLanguage),
    insertStudyLog({
      userId,
      wordId: card.word.id,
      targetLanguage,
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
    }).catch((err) => console.warn("[study/answer] study_logs insert failed", err)),
  ]);

  // Streak + heatmap derive from study_logs; due/seen counts derive from
  // user_cards. Both just changed, so bust both per-user tags now —
  // same-tick reads see fresh data instead of a stale 30s window.
  revalidateTag(`progress:${userId}`);
  revalidateTag(`stats:${userId}`);

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
