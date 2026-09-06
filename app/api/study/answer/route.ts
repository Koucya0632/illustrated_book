import { NextResponse } from "next/server";
import { studyAnswerOwnerMatches } from "@/lib/study-answer-owner";
import { revalidateTag } from "next/cache";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { getCardById, upsertReview } from "@/lib/cards-db";
import {
  getAtlasDueCardById,
  getAtlasMastery,
  getSavedCommunityCardById,
  insertAtlasStudyLog,
  recordSavedCommunityReview,
  upsertAtlasMastery,
  upsertAtlasReview,
} from "@/lib/atlas-db";
import {
  humanizeInterval,
  schedule,
  type CardState,
  type MistakeStats,
  type Rating,
  type ScheduleResult,
} from "@/lib/srs";
import { applyAnswer, masteryLevel } from "@/lib/mastery";
import {
  upsertMastery,
  insertStudyLog,
  getStreakMilestoneFacts,
  type StudyLogActivity,
} from "@/lib/users-db";
import { crossedStreakMilestone } from "@/lib/streak-milestone";

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

/** 聽句 replay count: a small non-negative integer, or nothing. */
function clampReplayCount(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(Math.round(raw), 999));
}

/** The `metadata` keys 聽句 adds. Empty for every other activity, so a 選字
 *  row is not left claiming zero replays of audio it never played. */
function listeningMetadata(body: {
  replayCount?: number;
  audioFailed?: boolean;
  listeningOptedOut?: boolean;
  convertedFromListening?: boolean;
}): Record<string, number | boolean> {
  const replays = clampReplayCount(body.replayCount);
  return {
    ...(replays === null ? {} : { replayCount: replays }),
    ...(body.audioFailed === true ? { audioFailed: true } : {}),
    ...(body.listeningOptedOut === true ? { listeningOptedOut: true } : {}),
    ...(body.convertedFromListening === true ? { convertedFromListening: true } : {}),
  };
}

function clampResponseMs(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.min(raw, 600_000))
    : null;
}

// Shared pure compute for both the public and atlas (custom) answer paths:
// the SRS reschedule, the mastery EMA, and the 重來 mistake flag. The two
// paths persist to different tables, but the math must stay identical.
function computeReview(input: {
  prevState: CardState;
  mistakeStats?: MistakeStats;
  prevMastery: number;
  prevReviewedAt: Date | null;
  rating: Rating;
}): {
  next: ScheduleResult;
  masteryResult: ReturnType<typeof applyAnswer>;
  isMistake: boolean;
} {
  const next = schedule(input.prevState, input.rating, input.mistakeStats);
  const masteryResult = applyAnswer(input.prevMastery, input.prevReviewedAt, input.rating);
  return { next, masteryResult, isMistake: input.rating === "重來" };
}

// The identical `{ ok, next, mastery }` success body both paths return.
//
// `milestone` rides along only on the answer that crossed a streak threshold
// (lib/streak-milestone.ts). It is omitted rather than sent as null: iOS
// decodes it as an optional and a present-but-null key would read the same, but
// omitting keeps "the server flagged something" and "the server said nothing"
// distinguishable in a log or a proxy.
function answerResponse(
  next: ScheduleResult,
  masteryResult: ReturnType<typeof applyAnswer>,
  milestone: number | null = null,
) {
  return NextResponse.json({
    ok: true,
    ...(milestone !== null ? { milestone: { streak: milestone } } : {}),
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

/**
 * Rating a saved community card (docs/COMMUNITY_ATLAS_PLAN.md). Its SRS state
 * lives in atlas_saved_cards — deliberately not in the user's own item tables,
 * so studying other people's content never touches their creation quota.
 */
async function answerSavedCommunityCard(
  userId: string,
  cardId: string,
  rating: Rating,
) {
  if (invalidUuid(cardId)) {
    return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
  }
  const card = await getSavedCommunityCardById(userId, cardId);
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const prevState: CardState = {
    // DB CHECK constrains status to the same set as Status; the driver just
    // types it as string.
    status: card.status as CardState["status"],
    intervalDays: Number(card.interval_days) || 0,
  };
  const next = schedule(prevState, rating, {
    reviewCount: card.review_count,
    mistakeCount: card.mistake_count,
  });
  const isMistake = rating === "重來";
  const masteryResult = applyAnswer(card.mastery, null, rating);

  await recordSavedCommunityReview(
    userId,
    cardId,
    {
      status: next.status,
      intervalDays: next.intervalDays,
      nextReviewAt: next.nextReviewAt,
      rating,
      mastery: masteryResult.mastery,
    },
    isMistake,
  );

  return NextResponse.json(
    {
      ok: true,
      next: {
        status: next.status,
        intervalDays: next.intervalDays,
        nextReviewAt: next.nextReviewAt.toISOString(),
        humanized: humanizeInterval(next.intervalDays),
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

async function answerAtlasCard(
  userId: string,
  cardId: string,
  rating: Rating,
  body: {
    responseMs?: number;
    sessionId?: string;
    activity?: string;
    hinted?: boolean;
    // Carried through for the same reason `hinted` is: 自製圖鑑 cards have no
    // example sentences, so they are never asked as 聽句 and these are always
    // absent — but the parameter list has to match the caller's body, or the
    // next question type to add these lands in one writer and not the other.
    //
    // `listeningOptedOut` is the exception that proves it: a session can switch
    // listening off and then answer a 自製圖鑑 card, so this one genuinely does
    // arrive here.
    replayCount?: number;
    audioFailed?: boolean;
    listeningOptedOut?: boolean;
    convertedFromListening?: boolean;
  },
) {
  if (invalidUuid(cardId)) {
    return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
  }

  const due = await getAtlasDueCardById(userId, cardId);
  if (!due) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const prevState: CardState = due.state
    ? { status: due.state.status, intervalDays: Number(due.state.interval_days) || 0 }
    : { status: "新卡", intervalDays: 0 };
  const masteryRow = await getAtlasMastery(userId, due.item.id, due.item.target_language);
  const { next, masteryResult, isMistake } = computeReview({
    prevState,
    mistakeStats: due.state
      ? { reviewCount: due.state.review_count, mistakeCount: due.state.mistake_count }
      : undefined,
    prevMastery: masteryRow?.mastery ?? 0,
    prevReviewedAt: masteryRow?.last_reviewed_at ? new Date(masteryRow.last_reviewed_at) : null,
    rating,
  });
  const responseMs = clampResponseMs(body.responseMs);
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
      metadata: {
        cardId: due.card.id,
        itemId: due.item.id,
        source: "custom",
        ...(body.hinted ? { hinted: true } : {}),
        ...listeningMetadata(body),
      },
    }).catch((err) => console.warn("[study/answer] atlas study log insert failed", err)),
  ]);

  revalidateTag(`progress:${userId}`, "max");
  revalidateTag(`stats:${userId}`, "max");
  revalidateTag(`atlas-progress:${userId}`, "max");
  revalidateTag(`atlas-stats:${userId}`, "max");

  return answerResponse(next, masteryResult);
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
    ownerUserId?: string;
    // 複習's 求救提示: the user turned the card over for the gloss before
    // answering. Recorded in study_logs.metadata rather than as a new
    // `activity` value — activity names the question type, and this is a
    // modifier on it. metadata is also unconstrained, so no migration and no
    // CHECK change; study_logs is append-only, so an unrecorded hint is
    // unrecoverable.
    hinted?: boolean;
    // 聽句 only. Same mechanism and same reason as `hinted`: `metadata` is
    // unconstrained so this needs no migration, and `study_logs` is
    // append-only so a signal not written now cannot be recovered.
    // `replayCount` is how often the sentence was played again before
    // answering — deliberately *not* subtracted from the response time,
    // because needing three listens is itself the difficulty signal.
    // `audioFailed` means the clip was missing and the sentence was read by
    // on-device synthesis, whose Japanese kanji readings nothing can correct:
    // that answer is not evidence about listening in either direction.
    replayCount?: number;
    audioFailed?: boolean;
    // 這輪不做聽句題. Unlike the two above these arrive on **every** activity,
    // because that is the point: a session with listening switched off answers
    // the rest of its cards as 選字, and rows that cannot be told apart from a
    // session that never met a listening question are what make an aggregate
    // listening accuracy lie. `convertedFromListening` marks the single card
    // the user bailed on — its `activity` truthfully says `mcq`, so this is the
    // only place that fact survives.
    listeningOptedOut?: boolean;
    convertedFromListening?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Durable iOS replays carry the account that originally queued the answer.
  // If auth changed while an async replay was building its request, reject it
  // instead of applying account A's answer under account B's access token.
  if (!studyAnswerOwnerMatches(body.ownerUserId, userId)) {
    return NextResponse.json({ error: "answer belongs to another account" }, { status: 403 });
  }

  const rawCardId = body.cardId;
  const rating = body.rating as Rating;
  if (typeof rawCardId === "string" && rawCardId.startsWith("atlas:")) {
    if (!VALID_RATINGS.includes(rating)) {
      return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
    }
    return answerAtlasCard(userId, rawCardId.slice("atlas:".length), rating, body);
  }
  if (typeof rawCardId === "string" && rawCardId.startsWith("saved:")) {
    if (!VALID_RATINGS.includes(rating)) {
      return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
    }
    return answerSavedCommunityCard(userId, rawCardId.slice("saved:".length), rating);
  }

  const cardId = Number(rawCardId);
  if (!Number.isFinite(cardId) || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: "missing/invalid cardId or rating" }, { status: 400 });
  }

  const card = await getCardById(cardId, userId);
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const targetLanguage = card.word.target_language;

  // Card-level SRS reschedule + word-level mastery (decay + EMA). The previous
  // mastery row was joined into getCardById, so there's no extra read here.
  const prevState: CardState = card.state
    ? { status: card.state.status, intervalDays: Number(card.state.interval_days) || 0 }
    : { status: "新卡", intervalDays: 0 };
  const { next, masteryResult, isMistake } = computeReview({
    prevState,
    mistakeStats: card.state
      ? { reviewCount: card.state.review_count, mistakeCount: card.state.mistake_count }
      : undefined,
    prevMastery: card.masteryRow?.mastery ?? 0,
    prevReviewedAt: card.masteryRow?.last_reviewed_at
      ? new Date(card.masteryRow.last_reviewed_at)
      : null,
    rating,
  });
  const responseMs = clampResponseMs(body.responseMs);

  // Streak milestone, read *before* the write below and awaited serially rather
  // than folded into the Promise.all. Both are deliberate: the rule is "was
  // today already on the board", and racing this read against the insert that
  // puts today on the board is precisely the way to get the wrong answer.
  //
  // Only this path emits milestones, because only this path writes study_logs —
  // which is the sole table the streak is computed from. The atlas and saved
  // paths write user_atlas_study_logs and nothing respectively, so they do not
  // move the streak and must not claim to. (Whether they *should* count toward
  // it is a real open question, but it changes every existing user's streak
  // number and belongs in its own change.)
  const milestone = crossedStreakMilestone(
    await getStreakMilestoneFacts(userId, "Asia/Taipei", targetLanguage),
  );

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
      metadata: {
        cardId,
        deckKey: card.card.deck_key,
        ...(body.hinted ? { hinted: true } : {}),
        ...listeningMetadata(body),
      },
    }).catch((err) => console.warn("[study/answer] study_logs insert failed", err)),
  ]);

  // Streak + heatmap derive from study_logs; due/seen counts derive from
  // user_cards. Both just changed, so bust both per-user tags now —
  // same-tick reads see fresh data instead of a stale 30s window.
  revalidateTag(`progress:${userId}`, "max");
  revalidateTag(`stats:${userId}`, "max");

  return answerResponse(next, masteryResult, milestone);
}
