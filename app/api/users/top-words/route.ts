// Top / weak words for the iOS Me page (§III.M).
//
//   GET /api/users/top-words?type=best&limit=5
//   GET /api/users/top-words?type=weak&limit=3
//
// Joins user_words (mastery state) with the words dictionary so the
// client gets ready-to-render rows without a second round trip.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";

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

  try {
    const rows = await (type === "best"
      ? sql<TopWordRow[]>`
          SELECT w.id, w.word, w.chinese, w.image_url, w.pronunciation, w.category,
                 uw.mastery::float8 AS mastery, uw.review_count
          FROM user_words uw
          JOIN words w ON w.id = uw.word_id
          WHERE uw.user_id = ${userId}::uuid
            AND uw.review_count >= 1
          ORDER BY uw.mastery DESC, uw.review_count DESC
          LIMIT ${limit}
        `
      : sql<TopWordRow[]>`
          SELECT w.id, w.word, w.chinese, w.image_url, w.pronunciation, w.category,
                 uw.mastery::float8 AS mastery, uw.review_count
          FROM user_words uw
          JOIN words w ON w.id = uw.word_id
          WHERE uw.user_id = ${userId}::uuid
            AND uw.review_count >= 1
          ORDER BY uw.mastery ASC, uw.review_count DESC
          LIMIT ${limit}
        `);
    return NextResponse.json({ words: rows.map(toTopWord), type });
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    console.error(`[users/top-words] ${e.message}`);
    console.error(`[users/top-words] context`, {
      userId,
      type,
      limit,
      code: e.code,
      detail: e.detail,
    });
    return NextResponse.json({ error: "top_words_failed" }, { status: 500 });
  }
}

interface TopWordRow {
  id: string;
  word: string;
  chinese: string;
  image_url: string;
  pronunciation: string;
  category: string;
  mastery: number;
  review_count: number;
}

function toTopWord(r: TopWordRow) {
  return {
    id: r.id,
    word: r.word,
    chinese: r.chinese,
    imageUrl: r.image_url,
    pronunciation: r.pronunciation,
    category: r.category,
    mastery: Math.round(r.mastery),
    reviewCount: r.review_count,
  };
}
