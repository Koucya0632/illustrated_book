import postgres from "postgres";
import { auditMainWordRows, type MainWordAuditRow } from "../lib/main-word-audit";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  try {
    const rows = await sql<MainWordAuditRow[]>`
      SELECT
        w.id,
        ja.term AS "jaTerm",
        ja.reading AS "jaReading",
        ja.reading_segments AS "readingSegments",
        jd.definition AS "jaDefinition",
        zd.definition AS "zhDefinition",
        ex.id AS "exampleId",
        jex.translation AS "jaExample",
        zex.translation AS "zhExample"
      FROM words w
      LEFT JOIN word_terms ja
        ON ja.word_id = w.id AND ja.language = 'ja'
      LEFT JOIN LATERAL (
        SELECT definition FROM word_definitions
        WHERE word_id = w.id AND language = 'ja'
        ORDER BY sort_order
        LIMIT 1
      ) jd ON true
      LEFT JOIN LATERAL (
        SELECT definition FROM word_definitions
        WHERE word_id = w.id AND language = 'zh'
        ORDER BY sort_order
        LIMIT 1
      ) zd ON true
      LEFT JOIN LATERAL (
        SELECT id FROM word_examples
        WHERE word_id = w.id
        ORDER BY sort_order, id
        LIMIT 1
      ) ex ON true
      LEFT JOIN word_example_translations jex
        ON jex.example_id = ex.id AND jex.language = 'ja'
      LEFT JOIN word_example_translations zex
        ON zex.example_id = ex.id AND zex.language = 'zh'
      WHERE w.status = 'published' AND w.deleted_at IS NULL
      ORDER BY w.id
    `;

    const issues = auditMainWordRows(rows);
    if (issues.length > 0) {
      for (const entry of issues) {
        console.error(`[main-word-audit] ${entry.id} ${entry.field}: ${entry.message}`);
      }
      throw new Error(`${issues.length} main-word consistency issue(s) found`);
    }

    console.log(`[main-word-audit] checked ${rows.length} published main words: no issues`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[main-word-audit] failed:", error);
  process.exit(1);
});
