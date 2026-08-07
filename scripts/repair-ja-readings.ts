// Repair Japanese readings that were flattened to hiragana.
//
// `backfill-ja-readings.ts` asked the model for a reading "in hiragana only",
// which is wrong for any headword already written in kana: katakana loanwords
// got respelled (バスマット → ばすまっと) and the long-vowel mark, not being a
// hiragana character, decayed into a vowel (シャンプー → しゃんぷう). The iOS
// 拼字 stage builds its tiles from this column, so the app was drilling
// spellings that do not exist.
//
// The repair is deterministic: a reading may only differ from the headword
// where the headword has kanji. Rows that cannot be aligned are reported, never
// guessed at.
//
//   node --env-file=.env.local --import tsx scripts/repair-ja-readings.ts
//   node --env-file=.env.local --import tsx scripts/repair-ja-readings.ts --apply

import { getSql } from "../lib/db";
import { isKanaOnly, readingKeepsKana, restoreKanaRuns } from "../lib/kana";
import { overrideReading } from "../lib/ja-reading-overrides";

interface Row {
  word_id: string;
  term: string;
  reading: string | null;
  pronunciation: string | null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = getSql();
  if (!sql) {
    console.log("[repair] DATABASE_URL not set — nothing to do.");
    return;
  }

  const rows = (await sql`
    SELECT word_id, term, reading, pronunciation
    FROM word_terms
    WHERE language = 'ja'
      AND reading IS NOT NULL
      AND btrim(reading) <> ''
    ORDER BY word_id
  `) as unknown as Row[];

  const fixes: { row: Row; reading: string }[] = [];
  const unalignable: Row[] = [];
  let alreadyGood = 0;

  for (const row of rows) {
    const reading = (row.reading ?? "").trim();

    // A hand-decided reading wins outright — it exists precisely because the
    // generated one was wrong in a way no rule here can detect.
    const decided = overrideReading(row.term);
    if (decided) {
      if (decided !== reading) fixes.push({ row, reading: decided });
      else alreadyGood++;
      continue;
    }

    if (readingKeepsKana(row.term, reading)) {
      alreadyGood++;
      continue;
    }
    const repaired = isKanaOnly(row.term)
      ? row.term
      : restoreKanaRuns(row.term, reading);
    if (repaired && readingKeepsKana(row.term, repaired)) {
      fixes.push({ row, reading: repaired });
    } else {
      unalignable.push(row);
    }
  }

  console.log(`[repair] ${rows.length} ja terms`);
  console.log(`  already well-formed : ${alreadyGood}`);
  console.log(`  repairable          : ${fixes.length}`);
  console.log(`  cannot align        : ${unalignable.length}`);

  if (unalignable.length) {
    console.log("\n  -- not touched, needs a human --");
    for (const r of unalignable) console.log(`     ${r.term} → ${r.reading}`);
  }

  console.log("\n  -- sample of the repair --");
  for (const f of fixes.slice(0, 12)) {
    console.log(`     ${f.row.term}: ${f.row.reading} → ${f.reading}`);
  }

  if (!apply) {
    console.log("\n[repair] dry run. Re-run with --apply to write.");
    await sql.end({ timeout: 5 });
    return;
  }

  let updated = 0;
  for (const { row, reading } of fixes) {
    // pronunciation mirrors reading for ja (see backfill-ja-readings), so it
    // carries the same damage and the same fix.
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
  }
  console.log(`\n[repair] updated ${updated} rows.`);
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error("[repair] fatal:", error);
  process.exit(1);
});
