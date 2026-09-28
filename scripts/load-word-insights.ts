// Guarded, repeatable import of the reviewed published-word corpora.
// Dry run is the default; --ja selects Japanese, --apply writes one table in a transaction.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSql } from "../lib/db";

type Localized = { zhHant: string; en: string; ja: string };
type Entry = {
  wordId: string;
  confusables: { term: string; catalogId: string | null; distinction: Localized }[];
  mistakes: { wrong: string; right: string; why: Localized }[];
  usage: Localized | null;
};

const language = process.argv.includes("--ja") ? "ja" : "en";
const table = language === "ja" ? "word_insights_ja" : "word_insights";
const file = resolve(import.meta.dirname, `../data/word-insights-${language}.json`);
const apply = process.argv.includes("--apply");
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function assertLocalized(value: unknown, label: string): asserts value is Localized {
  if (!value || typeof value !== "object") throw new Error(`${label}: missing translation`);
  const row = value as Partial<Localized>;
  for (const key of ["zhHant", "en", "ja"] as const) {
    if (!nonempty(row[key])) throw new Error(`${label}.${key}: empty`);
  }
}

function validate(rows: Entry[], catalog: Map<string, string>): void {
  if (!Array.isArray(rows) || rows.length !== catalog.size) {
    throw new Error(`Corpus coverage differs: ${rows.length} entries for ${catalog.size} published words`);
  }
  const seen = new Set<string>();
  for (const item of rows) {
    if (!catalog.has(item.wordId) || seen.has(item.wordId)) {
      throw new Error(`Unknown or duplicate word: ${item.wordId}`);
    }
    seen.add(item.wordId);
    if (!Array.isArray(item.confusables) || item.confusables.length > 3) {
      throw new Error(`${item.wordId}: confusables must have 0–3 entries`);
    }
    if (!Array.isArray(item.mistakes) || item.mistakes.length > 2) {
      throw new Error(`${item.wordId}: mistakes must have 0–2 entries`);
    }
    for (const [index, related] of item.confusables.entries()) {
      if (!nonempty(related.term) || related.catalogId === item.wordId) {
        throw new Error(`${item.wordId}/c${index}: invalid term or self-link`);
      }
      if (related.catalogId !== null &&
          catalog.get(related.catalogId)?.toLocaleLowerCase("en") !== related.term.toLocaleLowerCase("en")) {
        throw new Error(`${item.wordId}/c${index}: catalog link does not match term`);
      }
      assertLocalized(related.distinction, `${item.wordId}/c${index}`);
    }
    for (const [index, mistake] of item.mistakes.entries()) {
      if (!nonempty(mistake.wrong) || !nonempty(mistake.right) ||
          mistake.wrong.trim() === mistake.right.trim()) {
        throw new Error(`${item.wordId}/m${index}: invalid wrong/right`);
      }
      assertLocalized(mistake.why, `${item.wordId}/m${index}`);
    }
    if (item.usage !== null) assertLocalized(item.usage, `${item.wordId}/u`);
  }
  if (seen.size !== catalog.size) throw new Error("Corpus is missing published words");
}

async function main(): Promise<void> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required");
  try {
    const rows = JSON.parse(readFileSync(file, "utf8")) as Entry[];
    const published = language === "ja"
      ? await sql<{ id: string; word: string }[]>`
          SELECT w.id, t.term AS word FROM words w
          JOIN word_terms t ON t.word_id = w.id AND t.language = 'ja'
          WHERE w.status = 'published' AND w.deleted_at IS NULL
        `
      : await sql<{ id: string; word: string }[]>`
          SELECT id, word FROM words WHERE status = 'published' AND deleted_at IS NULL
        `;
    validate(rows, new Map(published.map((word) => [word.id, word.word])));
    const claims = rows.reduce((count, row) =>
      count + row.confusables.length + row.mistakes.length + Number(row.usage !== null), 0);
    console.log(`[word-insights:${language}] ${rows.length} published words, ${claims} claims validated`);
    if (!apply) {
      console.log(`[word-insights:${language}] dry run; pass --apply to load into ${table}`);
      return;
    }
    await sql.begin(async (tx) => {
      // Repeat the coverage guard inside the write transaction so a catalog
      // publication between dry run and apply cannot silently omit a word.
      const current = language === "ja"
        ? await tx<{ id: string; word: string }[]>`
            SELECT w.id, t.term AS word FROM words w
            JOIN word_terms t ON t.word_id = w.id AND t.language = 'ja'
            WHERE w.status = 'published' AND w.deleted_at IS NULL
          `
        : await tx<{ id: string; word: string }[]>`
            SELECT id, word FROM words WHERE status = 'published' AND deleted_at IS NULL
          `;
      validate(rows, new Map(current.map((word) => [word.id, word.word])));
      for (const row of rows) {
        await tx`
          INSERT INTO ${tx(table)} (word_id, confusables, mistakes, usage)
          VALUES (${row.wordId}, ${tx.json(row.confusables)}, ${tx.json(row.mistakes)},
                  ${row.usage ? tx.json(row.usage) : null})
          ON CONFLICT (word_id) DO UPDATE SET
            confusables = EXCLUDED.confusables,
            mistakes = EXCLUDED.mistakes,
            usage = EXCLUDED.usage,
            updated_at = now()
          WHERE ${tx(table)}.confusables IS DISTINCT FROM EXCLUDED.confusables
             OR ${tx(table)}.mistakes IS DISTINCT FROM EXCLUDED.mistakes
             OR ${tx(table)}.usage IS DISTINCT FROM EXCLUDED.usage
        `;
      }
    });
    console.log(`[word-insights:${language}] loaded ${rows.length} rows`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => { console.error("[word-insights] failed", error); process.exitCode = 1; });
