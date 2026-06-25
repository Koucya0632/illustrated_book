// Pull N words still missing ja, in `category, word` order, with every
// piece needed for translation (zh term, explanatory definition, examples).
// Emits a JSON array on stdout so downstream tooling can consume it.
import { getSql } from "../lib/db";

async function main() {
  const sql = getSql();
  if (!sql) {
    console.error("[list] DATABASE_URL not set");
    return;
  }
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 40) : 40;

  const words = (await sql`
    SELECT w.id, w.word, w.etymology, w.note, w.chinese_definition,
      (SELECT definition FROM word_definitions d
       WHERE d.word_id = w.id AND d.language = 'zh'
       ORDER BY d.sort_order LIMIT 1) AS zh_def
    FROM words w
    WHERE w.status = 'published' AND w.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM word_definitions d WHERE d.word_id = w.id AND d.language = 'zh')
      AND NOT EXISTS (SELECT 1 FROM word_definitions d WHERE d.word_id = w.id AND d.language = 'ja')
    ORDER BY w.category, w.word
    LIMIT ${limit}
  `) as unknown as {
    id: string;
    word: string;
    etymology: string | null;
    note: string | null;
    chinese_definition: string | null;
    zh_def: string | null;
  }[];

  const result: Array<{
    id: string;
    word: string;
    zh_def: string;
    chinese_definition: string;
    etymology: string | null;
    note: string | null;
    examples: { id: number; en: string; zh: string }[];
  }> = [];

  for (const w of words) {
    const exs = (await sql`
      SELECT e.id, e.sentence,
        (SELECT translation FROM word_example_translations
         WHERE example_id = e.id AND language = 'zh') AS zh
      FROM word_examples e
      WHERE e.word_id = ${w.id}
      ORDER BY e.sort_order
    `) as unknown as { id: number; sentence: string; zh: string | null }[];
    result.push({
      id: w.id,
      word: w.word,
      zh_def: w.zh_def ?? "",
      chinese_definition: w.chinese_definition ?? w.zh_def ?? "",
      etymology: w.etymology,
      note: w.note,
      examples: exs.map((e) => ({ id: Number(e.id), en: e.sentence, zh: e.zh ?? "" })),
    });
  }

  // Print as JSON so the operator (or a follow-up script) can parse cleanly.
  console.log(JSON.stringify(result, null, 2));
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[list] fatal:", e);
  process.exit(1);
});
