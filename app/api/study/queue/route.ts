import { NextResponse } from "next/server";
import { getCurrentUserIdFast } from "@/lib/current-user";
import {
  attachChoices,
  attachMasteryAndSort,
  fetchDue,
  studyStats,
  type QueueMode,
  type DueCard,
} from "@/lib/cards-db";
import { fetchAtlasDue, atlasStudyStats } from "@/lib/atlas-db";
import { createAtlasImageSignedUrlsBatch } from "@/lib/atlas/storage";
import { getAllMastery, getSettings } from "@/lib/users-db";
import { localizeStudyQueue } from "@/lib/study-localize";
import { studyDeckFor, targetLanguageFor, type UiLang } from "@/lib/settings";
import { pickAtlasDefinition, pickAtlasGloss } from "@/lib/atlas/gloss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addStats(
  a: Awaited<ReturnType<typeof studyStats>>,
  b: Awaited<ReturnType<typeof atlasStudyStats>>,
) {
  const byStatus = new Map<string, number>();
  for (const row of a.byStatus ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.c);
  for (const row of b.byStatus ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.c);
  return {
    total: a.total + b.total,
    seen: a.seen + b.seen,
    due: a.due + b.due,
    new: a.new + b.new,
    todayNew: a.todayNew + b.todayNew,
    byStatus: Array.from(byStatus, ([status, c]) => ({ status, c })),
  };
}

async function atlasDueToStudyQueue(
  userId: string,
  due: Awaited<ReturnType<typeof fetchAtlasDue>>,
  uiLang: UiLang,
): Promise<DueCard[]> {
  // One batched signed-URL request for the whole queue, instead of one storage
  // round-trip per card.
  const signed = await createAtlasImageSignedUrlsBatch(
    due.map((row) => ({
      imagePath: row.image.original_path,
      thumbPath: row.image.thumb_path,
    })),
  );
  return due.map((row, i) => {
    const urls = signed[i];
    return {
      card: {
        id: `atlas:${row.card.id}`,
        word_id: `atlas:${row.item.id}`,
        card_type: row.card.card_type === "image_recall" ? "回想卡" : "單字卡",
        front: row.card.front_text ?? pickAtlasGloss(row.item, uiLang),
        back: row.item.lemma,
        explanation: row.card.explanation ?? pickAtlasDefinition(row.item, uiLang),
        tags: ["custom", "atlas"],
        deck_key: row.item.target_language === "ja" ? "image-ja" : "image-en",
      },
      state: row.state
        ? {
            user_id: userId,
            card_id: `atlas:${row.card.id}`,
            status: row.state.status,
            interval_days: row.state.interval_days,
            next_review_at: row.state.next_review_at,
            review_count: row.state.review_count,
            mistake_count: row.state.mistake_count,
            last_rating: row.state.last_rating,
            last_reviewed_at: row.state.last_reviewed_at,
          }
        : null,
      word: {
        id: `atlas:${row.item.id}`,
        word: row.item.lemma,
        chinese: pickAtlasGloss(row.item, uiLang),
        image_url: urls.thumbUrl || urls.imageUrl,
        pronunciation: row.item.pronunciation ?? "",
        reading: row.item.reading ?? undefined,
        target_language: row.item.target_language,
        category: "custom",
      },
      choices: undefined,
      spellingChoices: undefined,
      mastery: Math.round(row.mastery),
    };
  });
}

export async function GET(req: Request) {
  const t0 = performance.now();
  // Best-effort early bail: if the browser already gave up on this request
  // (page nav, tab close, double-click), don't bother spinning up the
  // Promise.all of DB work. Saves Supabase compute and reduces the
  // "status 0, 0ms" pattern in Vercel logs.
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });

  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // Hard ceiling matches DAILY_GOAL_MAX in lib/settings.ts so a user who
  // sets dailyGoal=100 gets all 100 (used as new-card cap or review batch).
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));
  const newLimit = Math.min(100, Math.max(0, Number(searchParams.get("new") || 10)));
  // Comma-separated lists, e.g. `?cefr=A1,A2&tags=daily-life,kitchen`.
  // fetchDue validates CEFR strictly; tags are passed through (free-form).
  const cefr = (searchParams.get("cefr") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = (searchParams.get("tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Multi-theme study filter: comma-separated category ids (words.category).
  // Empty list = no filter. Legacy "all" sentinel still stripped for safety
  // — clients used to send it as a single value.
  const categories = (searchParams.get("category") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "all");
  const publicCategories = categories.filter((category) => category !== "custom");
  // "custom" cards join the queue when explicitly requested OR when there's no
  // public theme filter at all (全部 / 復習) — i.e. custom is part of "all your
  // studied words". A specific public theme (no "custom") still excludes them.
  const wantsCustom = categories.includes("custom") || publicCategories.length === 0;
  // Mode: "new" (only first-time cards), "review" (only due reviews), or
  // "both" (legacy mixed queue). Unknown values fall back to "both".
  const modeParam = (searchParams.get("mode") ?? "both").trim();
  const mode: QueueMode =
    modeParam === "new" || modeParam === "review" ? modeParam : "both";

  try {
    // The selected learning direction determines both the card deck and the
    // independent mastery namespace, so resolve settings before queue work.
    const tDb = performance.now();
    const settings = await getSettings(userId);
    const directionDeck = studyDeckFor(settings.learningDirection);
    const targetLanguage = targetLanguageFor(settings.learningDirection);
    // Learning direction is authoritative. Legacy client deck filters must
    // never widen a Japanese queue back to all decks when they disagree.
    const effectiveDecks = [directionDeck];
    const shouldFetchPublic = categories.length === 0 || publicCategories.length > 0;
    const [queue, stats, masteryRows, atlasQueue, customStats] = await Promise.all([
      shouldFetchPublic
        ? fetchDue(
            userId,
            limit,
            newLimit,
            { cefr, tags, categories: publicCategories, deckKeys: effectiveDecks },
            mode,
          )
        : Promise.resolve([]),
      shouldFetchPublic
        ? studyStats(userId, publicCategories, directionDeck)
        : Promise.resolve({ total: 0, seen: 0, due: 0, new: 0, todayNew: 0, byStatus: [] }),
      getAllMastery(userId, targetLanguage),
      wantsCustom ? fetchAtlasDue(userId, limit, mode, targetLanguage) : Promise.resolve([]),
      wantsCustom
        ? atlasStudyStats(userId, targetLanguage)
        : Promise.resolve({ total: 0, seen: 0, due: 0, new: 0, todayNew: 0, byStatus: [] }),
    ]);
    const dbMs = Math.round(performance.now() - tDb);

    if (req.signal.aborted) return new NextResponse(null, { status: 499 });

    const tMastery = performance.now();
    await attachMasteryAndSort(userId, queue, masteryRows);
    const masteryMs = Math.round(performance.now() - tMastery);

    // New-learn now uses 4-choice MCQs in Step 2 (英文辨認) and Step 3
    // (拼字), so it needs `choices` and `spellingChoices` attached too.
    // The +1 query for the distractor pool is paid every queue load.
    const tChoices = performance.now();
    await attachChoices(queue);
    const choicesMs = Math.round(performance.now() - tChoices);

    // A custom item can carry more than one card (image_recall + flashcard),
    // but the unified study flow reviews a word once and the queue is keyed by
    // word_id client-side. Collapse to one card per item — keep the first,
    // since fetchAtlasDue orders in-progress reviews ahead of new cards, so we
    // retain the card already being reviewed rather than resetting to a 新卡.
    const seenItemIds = new Set<string>();
    const dedupedAtlasQueue = atlasQueue.filter((row) => {
      if (seenItemIds.has(row.item.id)) return false;
      seenItemIds.add(row.item.id);
      return true;
    });

    const tLocalize = performance.now();
    const atlasStudyQueue = wantsCustom
      ? await atlasDueToStudyQueue(userId, dedupedAtlasQueue, settings.uiLang)
      : [];
    const localizedPublic = await localizeStudyQueue(queue, settings.uiLang);
    const localizedAtlas = await localizeStudyQueue(atlasStudyQueue, settings.uiLang);
    // New-learn leads with captured 自製 cards: appended last they'd be
    // sliced off whenever the public draw already fills `limit`, so a
    // just-captured word would never surface in 學新字.
    const localized = (mode === "new"
      ? localizedAtlas.concat(localizedPublic)
      : localizedPublic.concat(localizedAtlas)
    ).slice(0, limit);
    const localizeMs = Math.round(performance.now() - tLocalize);

    const totalMs = Math.round(performance.now() - t0);
    return NextResponse.json(
      { queue: localized, stats: addStats(stats, customStats) },
      {
        headers: {
          "Server-Timing": [
            `db;dur=${dbMs}`,
            `mastery;dur=${masteryMs}`,
            `choices;dur=${choicesMs}`,
            `localize;dur=${localizeMs}`,
            `total;dur=${totalMs}`,
          ].join(", "),
        },
      },
    );
  } catch (err) {
    // Surface a JSON error instead of letting Next return an opaque HTML 500.
    // Client (StudyClient.loadQueue) shows a coral banner; structured log
    // lets us correlate to Vercel runtime logs by userId + mode.
    //
    // Two-line emit: Vercel's MESSAGE column truncates ~50 chars, so the
    // postgres error message goes on its own line first.
    const e = err as Error & { code?: string; detail?: string; severity?: string };
    console.error(`[study/queue] ${e.message}`);
    console.error(`[study/queue] context`, {
      userId,
      mode,
      limit,
      newLimit,
      categories,
      code: e.code,
      severity: e.severity,
      detail: e.detail,
    });
    return NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
}
