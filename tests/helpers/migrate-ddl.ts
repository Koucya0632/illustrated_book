import { readFileSync } from "node:fs";

/** The real DDL for the given tables, in scripts/migrate.ts order: table,
 * column, constraint and index statements only (no RLS, policies, backfills
 * or statements built from interpolated values). */
export function migrateDdlFor(tables: ReadonlySet<string>): string[] {
  const migration = readFileSync(new URL("../../scripts/migrate.ts", import.meta.url), "utf8");
  const start = migration.indexOf("const DDL = [");
  const end = migration.indexOf("\n];\n", start);
  const statements = [...migration.slice(start, end).matchAll(/`([^`]*)`/g)].map(([, body]) => body.trim());
  const target = (statement: string) =>
    statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ??
    statement.match(/^ALTER TABLE (\w+)\s+(ADD|ALTER|DROP) /)?.[1] ??
    statement.match(/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS \w+\s+ON (\w+)/)?.[1] ??
    statement.match(/^DO \$\$[\s\S]*?ALTER TABLE (\w+)/)?.[1];
  return statements.filter((statement) => {
    const table = target(statement);
    return table !== undefined && tables.has(table) &&
      !statement.includes("${") && !/ROW LEVEL SECURITY|POLICY|gin_trgm_ops/.test(statement);
  });
}

/** Tables the catalogue sync reads and writes. */
export const CATALOGUE_TABLES: ReadonlySet<string> = new Set([
  "words", "categories", "category_translations", "word_definitions", "word_terms",
  "word_examples", "word_example_translations", "sentence_spans", "sentence_span_glosses",
  "word_relations", "word_localized_texts", "cards", "word_categories",
]);
