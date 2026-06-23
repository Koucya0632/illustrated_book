// Fill missing hiragana readings for existing Japanese learning terms.
// Idempotent: only rows with an empty reading are selected.
//
//   node --env-file=.env.local --import tsx scripts/backfill-ja-readings.ts --limit=50

import { getSql } from "../lib/db";
import { generateJapaneseReading } from "../lib/translate";

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg
    ? Math.max(1, Number(limitArg.split("=")[1]) || 50)
    : 50;
  const sql = getSql();
  if (!sql) {
    console.log("[readings] DATABASE_URL not set — nothing to do.");
    return;
  }

  const rows = (await sql`
    SELECT word_id, term
    FROM word_terms
    WHERE language = 'ja'
      AND (reading IS NULL OR btrim(reading) = '')
    ORDER BY word_id
    LIMIT ${limit}
  `) as unknown as { word_id: string; term: string }[];

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const reading = await generateJapaneseReading(row.term);
      if (!reading) continue;
      await sql`
        UPDATE word_terms
        SET reading = ${reading},
            pronunciation = ${reading},
            updated_at = now()
        WHERE word_id = ${row.word_id} AND language = 'ja'
      `;
      await sql`
        UPDATE cards
        SET explanation = ${`${row.term} ${reading}`}
        WHERE word_id = ${row.word_id} AND deck_key = 'image-ja'
      `;
      updated++;
      console.log(`  ✓ ${row.word_id}: ${row.term} → ${reading}`);
    } catch (error) {
      failed++;
      console.warn(
        `  ✗ ${row.word_id}:`,
        error instanceof Error ? error.message : error,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(`[readings] updated=${updated} failed=${failed} selected=${rows.length}`);
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error("[readings] fatal:", error);
  process.exit(1);
});
