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
import {
  fetchAtlasDue,
  atlasStudyStats,
  fetchSavedCommunityDue,
  savedCommunityStats,
} from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import { createAtlasImageSignedUrlsBatch } from "@/lib/atlas/storage";
import { getAllMastery, getSettings } from "@/lib/users-db";
import { localizeStudyQueue } from "@/lib/study-localize";
import { studyDeckFor, targetLanguageFor, type UiLang } from "@/lib/settings";
import { pickAtlasDefinition, pickAtlasGloss } from "@/lib/atlas/gloss";
import { readLang, readLearningDirection } from "@/lib/cache-headers";

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

/**
 * Saved community items as study cards (docs/COMMUNITY_ATLAS_PLAN.md).
 *
 * Mirrors atlasDueToStudyQueue but sources from atlas_saved_cards. Images are
 * already public, so no signed URLs. Card ids are prefixed `saved:` so the
 * answer route can tell which table a rating belongs to.
 */
function savedCommunityToStudyQueue(
  userId: string,
  due: Awaited<ReturnType<typeof fetchSavedCommunityDue>>,
): DueCard[] {
  return due.map((row) => ({
    card: {
      id: `saved:${row.id}`,
      word_id: `saved:${row.public_item_id}`,
      card_type: row.card_type === "image_recall" ? "回想卡" : "單字卡",
      front: row.display_zh_hant,
      back: row.lemma,
      explanation: null,
      tags: ["community", "atlas"],
      deck_key: row.target_language === "ja" ? "image-ja" : "image-en",
    },
    state: {
      user_id: userId,
      card_id: `saved:${row.id}`,
      status: row.status,
      interval_days: row.interval_days,
      next_review_at: row.next_review_at,
      review_count: row.review_count,
      mistake_count: row.mistake_count,
      last_rating: null,
      last_reviewed_at: null,
    },
    word: {
      id: `saved:${row.public_item_id}`,
      word: row.lemma,
      chinese: row.display_zh_hant,
      image_url: atlasPublicImageUrl(row.image_public_path) ?? "",
      pronunciation: "",
      reading: undefined,
      target_language: row.target_language,
      category: "community",
    },
    choices: undefined,
    spellingChoices: undefined,
    mastery: Math.round(row.mastery),
  })) as DueCard[];
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
  // Mode: "new" (only first-time cards), "review" (only due reviews), or
  // "both" (legacy mixed queue). Unknown values fall back to "both".
  const modeParam = (searchParams.get("mode") ?? "both").trim();
  const mode: QueueMode =
    modeParam === "new" || modeParam === "review" ? modeParam : "both";

  // THEMES SCOPE LEARNING, NOT REVIEW. This is what the theme picker promises
  // in so many words ("複習不分主題，所有學過的字都會排進來"), and review is
  // the half where it matters most: a card you have already learned must come
  // back on schedule, or the SRS silently drops it. Unticking a theme means
  // "stop teaching me new ones", never "abandon what I already learned".
  //
  // Enforced here rather than per-source because the three sources disagreed
  // about what an empty filter means (custom: include, community: exclude,
  // public: include), and the clients disagreed too — iOS sends no categories
  // for review, the web sends them for every mode. The result was that saved
  // 社群圖鑑 cards were learnable but never reviewable.
  const reviewOnly = mode === "review";
  const publicCategories = reviewOnly
    ? []
    : categories.filter(
        (category) => category !== "custom" && category !== "community",
      );
  // "custom" cards join the queue when explicitly requested OR when there's no
  // public theme filter at all (全部 / 復習) — i.e. custom is part of "all your
  // studied words". A specific public theme (no "custom") still excludes them.
  const wantsCustom = reviewOnly || categories.includes("custom") || publicCategories.length === 0;
  // 社群圖鑑 is opt-in for NEW cards only: unlike "custom", it never joins by
  // default, because someone who has saved nothing shouldn't see an empty extra
  // theme and community content is other people's work. Review is not opt-in —
  // see above.
  const wantsCommunity = reviewOnly || categories.includes("community");

  try {
    // The selected learning direction determines both the card deck and the
    // independent mastery namespace, so resolve settings before queue work.
    const tDb = performance.now();
    const settings = await getSettings(userId);
    // Gloss language follows the live UI language: ?lang= wins over the stored
    // setting so a just-switched uiLang isn't stuck on the debounced save.
    const uiLang = readLang(req, settings.uiLang);
    // And the deck follows the live direction, for the same reason: a queue
    // fetched in the seconds after a 學習語言 switch would otherwise be built
    // from the deck the user just left.
    const direction = readLearningDirection(req, settings.learningDirection);
    const directionDeck = studyDeckFor(direction);
    const targetLanguage = targetLanguageFor(direction);
    // Learning direction is authoritative. Legacy client deck filters must
    // never widen a Japanese queue back to all decks when they disagree.
    const effectiveDecks = [directionDeck];
    // In review every source is in, so an unfiltered public fetch is exactly
    // what "all your studied words" means. (Without `reviewOnly` here, a client
    // reviewing with only 社群圖鑑 ticked would send one category, leaving
    // publicCategories empty, and lose every official word it had learned.)
    const shouldFetchPublic =
      reviewOnly || categories.length === 0 || publicCategories.length > 0;
    const [
      queue,
      stats,
      masteryRows,
      atlasQueue,
      customStats,
      savedQueue,
      savedStats,
    ] = await Promise.all([
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
      wantsCommunity
        ? fetchSavedCommunityDue(userId, limit, mode, targetLanguage)
        : Promise.resolve([]),
      wantsCommunity
        ? savedCommunityStats(userId, targetLanguage)
        : Promise.resolve({ total: 0, seen: 0 }),
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
      ? await atlasDueToStudyQueue(userId, dedupedAtlasQueue, uiLang)
      : [];
    const localizedPublic = await localizeStudyQueue(queue, uiLang);
    const localizedAtlas = await localizeStudyQueue(atlasStudyQueue, uiLang);
    // Saved community cards carry the publisher's own gloss; they are not part
    // of the localizable dictionary, so they skip localizeStudyQueue.
    // One card per item, same reason as the atlas dedupe above.
    const seenSavedItems = new Set<string>();
    const localizedSaved = savedCommunityToStudyQueue(
      userId,
      savedQueue.filter((row) => {
        if (seenSavedItems.has(row.public_item_id)) return false;
        seenSavedItems.add(row.public_item_id);
        return true;
      }),
    );
    // New-learn leads with captured 自製 cards: appended last they'd be
    // sliced off whenever the public draw already fills `limit`, so a
    // just-captured word would never surface in 學新字.
    const localized = (mode === "new"
      ? localizedAtlas.concat(localizedSaved, localizedPublic)
      : localizedPublic.concat(localizedAtlas, localizedSaved)
    ).slice(0, limit);
    const localizeMs = Math.round(performance.now() - tLocalize);

    const totalMs = Math.round(performance.now() - t0);
    return NextResponse.json(
      {
        queue: localized,
        stats: addStats(stats, customStats),
        communityStats: wantsCommunity ? savedStats : undefined,
      },
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
