import "server-only";

import { getSql } from "./db";
import type { StoredInsights } from "./word-insights-present";

export async function readStoredWordInsights(wordId: string, language: "en" | "ja"): Promise<StoredInsights | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = language === "ja"
      ? await sql<StoredInsights[]>`
          SELECT confusables, mistakes, usage FROM word_insights_ja WHERE word_id = ${wordId}
        `
      : await sql<StoredInsights[]>`
          SELECT confusables, mistakes, usage FROM word_insights WHERE word_id = ${wordId}
        `;
    return rows[0] ?? null;
  } catch (error) {
    // During a migration rollout the table may not exist yet. A missing
    // insight must not take down the dictionary detail or expose gated text.
    console.warn("[word-insights] read failed", error);
    return null;
  }
}
