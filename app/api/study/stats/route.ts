// Lightweight stats endpoint used by /study landing to render the
// "新學 N / 複習 M / backlog warning" tiles without paying for a full
// queue fetch (no card rows, no JOIN, no distractor scoring).
//
// Returns the same shape as the `stats` field on /api/study/queue —
// { total, seen, due, new, byStatus } — so the client can compute
// `computeNewLimit(base, stats.due)` and decide which buttons to enable.
import { NextResponse } from "next/server";
import { readTimezone } from "@/lib/timezone";
import { resolveDirectionThemeScope } from "@/lib/study-sources";
import { applyMembershipStudyScope } from "@/lib/study-membership";
import { getLockedAtlasItemIds, getMembershipAccess } from "@/lib/atlas/entitlement";
import { getCurrentUserIdFast } from "@/lib/current-user";
import { studyStats } from "@/lib/cards-db";
import { atlasStudyStats, savedCommunityDueCount, savedCommunityNewCount, savedCommunityStats } from "@/lib/atlas-db";
import { getSettings } from "@/lib/users-db";
import { studyDeckFor, targetLanguageFor } from "@/lib/settings";
import { readLearningDirection } from "@/lib/cache-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });
  const userId = await getCurrentUserIdFast();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Multi-theme filter — same shape as /api/study/queue. Empty list = no
  // theme filter; landing displays global counts.
  const { searchParams } = new URL(req.url);
  const categories = (searchParams.get("category") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "all");
  try {
    const t0 = performance.now();
    const settings = await getSettings(userId);
    // `?learning=` wins over the stored setting — see /api/users/mastery.
    const direction = readLearningDirection(req, settings.learningDirection);
    const access = await getMembershipAccess(userId);
    const scope = applyMembershipStudyScope(resolveDirectionThemeScope(categories, false, direction), access);
    const reviewScope = applyMembershipStudyScope(resolveDirectionThemeScope(categories, true, direction), access);
    const { publicCategories, wantsCustom, wantsCommunity, shouldFetchPublic, reviewWordIds } = scope;
    const tz = readTimezone(req);
    const [publicStats, customStats, communityStats, publicReview, customReview, communityDue, communityNew] = await Promise.all([
      shouldFetchPublic
        ? studyStats(userId, publicCategories, studyDeckFor(direction), tz, reviewWordIds)
        : Promise.resolve({ total: 0, seen: 0, due: 0, new: 0, todayNew: 0, byStatus: [] }),
      wantsCustom
        ? atlasStudyStats(userId, targetLanguageFor(direction), await getLockedAtlasItemIds(userId), tz)
        : Promise.resolve({ total: 0, seen: 0, due: 0, new: 0, todayNew: 0, byStatus: [] }),
      wantsCommunity ? savedCommunityStats(userId, targetLanguageFor(direction)) : Promise.resolve({ total: 0, seen: 0 }),
      reviewScope.shouldFetchPublic ? studyStats(userId, reviewScope.publicCategories, studyDeckFor(direction), tz, reviewScope.reviewWordIds) : Promise.resolve({ due: 0 }),
      reviewScope.wantsCustom ? atlasStudyStats(userId, targetLanguageFor(direction), await getLockedAtlasItemIds(userId), tz) : Promise.resolve({ due: 0 }),
      reviewScope.wantsCommunity ? savedCommunityDueCount(userId, targetLanguageFor(direction)) : Promise.resolve(0),
      wantsCommunity ? savedCommunityNewCount(userId, targetLanguageFor(direction)) : Promise.resolve(0),
    ]);
    const byStatus = new Map<string, number>();
    for (const row of publicStats.byStatus ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.c);
    for (const row of customStats.byStatus ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.c);
    const stats = {
      total: publicStats.total + customStats.total + communityStats.total,
      seen: publicStats.seen + customStats.seen + communityStats.seen,
      due: publicReview.due + customReview.due + communityDue,
      new: publicStats.new + customStats.new + communityNew,
      todayNew: publicStats.todayNew + customStats.todayNew,
      byStatus: Array.from(byStatus, ([status, c]) => ({ status, c })),
    };
    const dbMs = Math.round(performance.now() - t0);
    return NextResponse.json(
      { stats, ...(wantsCommunity ? { communityStats } : {}) },
      { headers: { "Server-Timing": `db;dur=${dbMs}` } },
    );
  } catch (err) {
    // Two-line emit: Vercel's log column truncates ~50 chars, so the
    // message gets its own line (the part you actually want to read) and
    // the structured context (userId + postgres code/detail) goes on a
    // second line. Without this, [study/stats] failed hides the cause.
    const e = err as Error & { code?: string; detail?: string; severity?: string };
    console.error(`[study/stats] ${e.message}`);
    console.error(`[study/stats] context`, {
      userId,
      code: e.code,
      severity: e.severity,
      detail: e.detail,
    });
    return NextResponse.json({ error: "stats_failed" }, { status: 500 });
  }
}
