// Top / weak words for the Me page (§III.M) — iOS 需要加強 and Android's.
//
//   GET /api/users/top-words?type=best&limit=5
//   GET /api/users/top-words?type=weak&limit=3
//
// SQL ranks the caller's `user_words` in the current learning language; the
// words themselves come from the localized catalogue (lib/top-words.ts says
// why). `?lang=` / `?learning=` win over the stored settings, as on the other
// per-user reads — neither client sends them yet, so the settings are what
// normally decide.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";
import { getAllLearningWords } from "@/lib/data";
import { getSettings } from "@/lib/users-db";
import { readLang, readLearningDirection } from "@/lib/cache-headers";
import { targetLanguageFor } from "@/lib/settings";
import { topWords, type MasteryRankRow } from "@/lib/top-words";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TopType = "best" | "weak";

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sql = getSql();
  if (!sql) return NextResponse.json({ words: [] });

  const { searchParams } = new URL(req.url);
  const typeParam = (searchParams.get("type") ?? "best").trim();
  const type: TopType = typeParam === "weak" ? "weak" : "best";
  const limitRaw = Number(searchParams.get("limit") ?? "5");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(limitRaw, 20))
    : 5;

  const settings = await getSettings(userId);
  const direction = readLearningDirection(req, settings.learningDirection);
  const uiLang = readLang(req, settings.uiLang);
  const targetLanguage = targetLanguageFor(direction);

  try {
    // No LIMIT: a row whose word left the catalogue is skipped afterwards, and
    // a LIMIT here would let those rows eat the list. One user's rows in one
    // language are bounded by the catalogue — hundreds, not more.
    const [rows, catalogue] = await Promise.all([
      type === "best"
        ? sql<MasteryRankRow[]>`
            SELECT uw.word_id, uw.mastery::float8 AS mastery, uw.review_count
            FROM user_words uw
            WHERE uw.user_id = ${userId}::uuid
              AND uw.target_language = ${targetLanguage}
              AND uw.review_count >= 1
            ORDER BY uw.mastery DESC, uw.review_count DESC
          `
        : sql<MasteryRankRow[]>`
            SELECT uw.word_id, uw.mastery::float8 AS mastery, uw.review_count
            FROM user_words uw
            WHERE uw.user_id = ${userId}::uuid
              AND uw.target_language = ${targetLanguage}
              AND uw.review_count >= 1
            ORDER BY uw.mastery ASC, uw.review_count DESC
          `,
      getAllLearningWords(uiLang, direction),
    ]);
    return NextResponse.json({ words: topWords(rows, catalogue, limit), type });
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error(`[users/top-words] ${e.message}`);
    console.error(`[users/top-words] context`, {
      userId,
      type,
      limit,
      targetLanguage,
      code: e.code,
      detail: e.detail,
    });
    return NextResponse.json({ error: "top_words_failed" }, { status: 500 });
  }
}
