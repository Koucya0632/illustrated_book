// SELECT-only candidate collision and publication-state check.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const candidates = JSON.parse(readFileSync("data/clothing-series-2026-09.json", "utf8")).entries;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1 });
const ids = candidates.map(({ id }) => id);
const english = candidates.map(({ word }) => word.toLowerCase());
const japanese = candidates.map(({ ja }) => ja);
const enSentences = candidates.flatMap(({ examples }) => examples.map(({ en }) => en));
const jaSentences = candidates.flatMap(({ examples }) => examples.map(({ ja }) => ja));
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
try {
  const [identity] = await sql`SELECT current_database() AS database_name, current_user AS database_user`;
  const [tables] = await sql`SELECT
    to_regclass('public.words')::text AS words,
    to_regclass('public.categories')::text AS categories,
    to_regclass('public.category_translations')::text AS category_translations,
    to_regclass('public.word_terms')::text AS word_terms,
    to_regclass('public.word_examples')::text AS word_examples,
    to_regclass('public.sentence_spans')::text AS sentence_spans,
    to_regclass('public.word_media')::text AS word_media,
    to_regclass('public.word_example_media')::text AS word_example_media`;
  const candidateRows = await sql`SELECT id, word, category, status FROM words WHERE id = ANY(${ids}) ORDER BY id`;
  const englishConflicts = await sql`SELECT id, word, category, status FROM words
    WHERE lower(word) = ANY(${english}) AND NOT (id = ANY(${ids})) ORDER BY id`;
  const japaneseConflicts = await sql`SELECT w.id, w.word, t.term AS ja FROM word_terms t
    JOIN words w ON w.id = t.word_id
    WHERE t.language = 'ja' AND t.term = ANY(${japanese}) AND NOT (w.id = ANY(${ids})) ORDER BY w.id`;
  const categoryRows = await sql`SELECT id, name, name_zh FROM categories WHERE id = 'clothing'`;
  const categoryTranslations = await sql`SELECT category_id, language, name, description FROM category_translations
    WHERE category_id = 'clothing' ORDER BY language`;
  const spanCollisions = await sql`SELECT DISTINCT sentence_language, sentence FROM sentence_spans
    WHERE (sentence_language = 'en' AND sentence = ANY(${enSentences}))
       OR (sentence_language = 'ja' AND sentence = ANY(${jaSentences}))
    ORDER BY sentence_language, sentence`;
  const published = await sql`SELECT id FROM words WHERE status = 'published' AND deleted_at IS NULL ORDER BY id`;
  const result = {
    checkedAt: new Date().toISOString(),
    databaseName: identity.database_name,
    databaseUser: identity.database_user,
    publishedCount: published.length,
    publishedIdsSha256: digest(published.map(({ id }) => id)),
    tables, candidateRows, englishConflicts, japaneseConflicts,
    categoryRows, categoryTranslations, spanCollisions,
  };
  result.collisionFree = Object.values(tables).every(Boolean) &&
    [candidateRows, englishConflicts, japaneseConflicts, categoryRows, categoryTranslations, spanCollisions]
      .every((rows) => rows.length === 0);
  mkdirSync("output/clothing-publish-prep", { recursive: true });
  writeFileSync("output/clothing-publish-prep/db-preflight.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({
    publishedCount: result.publishedCount,
    candidateCount: candidates.length,
    collisionFree: result.collisionFree,
    candidateRows: candidateRows.length,
    englishConflicts: englishConflicts.length,
    japaneseConflicts: japaneseConflicts.length,
    categoryRows: categoryRows.length,
    spanCollisions: spanCollisions.length,
  }));
  if (!result.collisionFree) process.exitCode = 1;
} finally {
  await sql.end();
}
