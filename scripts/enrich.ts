// Batch AI enrichment: fills synonyms/antonyms/related + word forms +
// etymology + mnemonic for words that haven't been enriched yet
// (etymology IS NULL). Idempotent — re-running skips done words.
//
//   node --env-file=.env.local --import tsx scripts/enrich.ts --limit=20
//
// Requires DATABASE_URL and AI_GATEWAY_API_KEY in the environment.

import { getSql } from "../lib/db";
import { enrichWord } from "../lib/enrich";
import { applyEnrichment } from "../lib/words-db";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 50) : 50;

  const sql = getSql();
  if (!sql) {
    console.log("[enrich] DATABASE_URL not set — nothing to do.");
    return;
  }

  const rows = (await sql`
    SELECT w.id, w.word, w.part_of_speech AS pos,
           COALESCE((
             SELECT definition FROM word_definitions
             WHERE word_id = w.id AND language = 'zh'
             ORDER BY sort_order LIMIT 1
           ), '') AS chinese
    FROM words w
    WHERE w.status = 'published' AND w.deleted_at IS NULL AND w.etymology IS NULL
    ORDER BY w.category, w.word
    LIMIT ${limit}
  `) as unknown as { id: string; word: string; pos: string; chinese: string }[];

  console.log(`[enrich] ${rows.length} word(s) to enrich (limit ${limit}).`);
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    try {
      const result = await enrichWord({ word: r.word, partOfSpeech: r.pos, chinese: r.chinese });
      await applyEnrichment(r.id, result);
      ok++;
      console.log(
        `  ✓ ${r.id} — syn ${result.synonyms.length} / ant ${result.antonyms.length} / rel ${result.related.length} / forms ${result.forms.length}`,
      );
    } catch (e) {
      fail++;
      console.warn(`  ✗ ${r.id}:`, e instanceof Error ? e.message : e);
    }
    await new Promise((res) => setTimeout(res, 300)); // gentle throttle
  }
  console.log(`[enrich] done. ok=${ok} fail=${fail}`);
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[enrich] fatal:", e);
  process.exit(1);
});
