// Fill in `reading_segments` — which kana sit over which characters — for the
// dictionary catalogue and for existing 自製圖鑑 items.
//
// Two passes, deliberately unequal in cost:
//
//   * The catalogue is pure dictionary work. Hand-decided readings from
//     lib/ja-reading-overrides.ts are applied first, so a correction there also
//     lands in `reading` here and the 拼字 stage stops drilling the old answer.
//   * Custom items are filtered before anything expensive happens: a reading
//     that already keeps its headword's kana only needs segmenting (free); only
//     one that fails that check is regenerated on the model.
//
// Dry by default — nothing is written without --apply.
//
//   node --env-file=.env.local --import tsx scripts/backfill-furigana.ts
//   node --env-file=.env.local --import tsx scripts/backfill-furigana.ts --apply

import { getSql } from "../lib/db";
import { isKanaOnly, readingKeepsKana, segmentFurigana, type FuriganaSegment } from "../lib/kana";
import { loadFuriganaDict } from "../lib/furigana-dict";
import { readingWithoutAsking } from "../lib/ja-reading";

interface TermRow {
  word_id: string;
  term: string;
  reading: string;
}

interface ItemRow {
  id: string;
  lemma: string;
  reading: string | null;
}

type Shape = "per-kanji" | "has-block" | "no-split";

function shapeOf(segments: FuriganaSegment[] | null): Shape {
  if (!segments) return "no-split";
  return segments.every((s) => s.ruby === null || [...s.text].length === 1)
    ? "per-kanji"
    : "has-block";
}

/** The two invariants; a split that breaks either is dropped, never stored. */
function isSound(term: string, reading: string, segments: FuriganaSegment[]): boolean {
  return (
    segments.map((s) => s.text).join("") === term &&
    segments.map((s) => s.ruby ?? s.text).join("") === reading
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = getSql();
  if (!sql) {
    console.log("DATABASE_URL not set — nothing to do.");
    return;
  }

  const tally: Record<Shape, number> = { "per-kanji": 0, "has-block": 0, "no-split": 0 };
  const noSplit: string[] = [];
  const readingFixes: { term: string; from: string; to: string }[] = [];

  // ---- Pass 1: the dictionary catalogue ----
  const terms = (await sql`
    SELECT word_id, term, reading
      FROM word_terms
     WHERE language = 'ja'
       AND reading IS NOT NULL
       AND btrim(reading) <> ''
     ORDER BY word_id
  `) as unknown as TermRow[];

  const catalogue = terms.filter((r) => !isKanaOnly(r.term));
  const dict = await loadFuriganaDict(catalogue.map((r) => r.term));
  console.log(
    `catalogue: ${terms.length} ja terms, ${catalogue.length} with kanji; ` +
      `dictionary returned ${dict.size} surfaces`,
  );

  const termWrites: { word_id: string; reading: string; segments: FuriganaSegment[] | null }[] = [];
  for (const row of catalogue) {
    const decided = readingWithoutAsking(row.term);
    const reading = decided ?? row.reading;
    if (decided && decided !== row.reading) {
      readingFixes.push({ term: row.term, from: row.reading, to: decided });
    }

    let segments = segmentFurigana(row.term, reading, dict);
    if (segments && !isSound(row.term, reading, segments)) segments = null;
    tally[shapeOf(segments)] += 1;
    if (!segments) noSplit.push(`${row.term} | ${reading}`);
    termWrites.push({ word_id: row.word_id, reading, segments });
  }

  console.log(
    `\n  per-kanji ${tally["per-kanji"]}   has a block ${tally["has-block"]}   no split ${tally["no-split"]}`,
  );
  if (readingFixes.length) {
    console.log(`\n  readings corrected by override (${readingFixes.length}):`);
    for (const f of readingFixes) console.log(`    ${f.term}: ${f.from} → ${f.to}`);
  }
  if (noSplit.length) {
    console.log(`\n  no split (these keep the reading line):`);
    for (const n of noSplit) console.log(`    ${n}`);
  }

  // ---- Pass 2: existing 自製圖鑑 items ----
  const items = (await sql`
    SELECT id, lemma, reading
      FROM user_atlas_items
     WHERE target_language = 'ja'
       AND deleted_at IS NULL
     ORDER BY created_at
  `) as unknown as ItemRow[];

  const withKanji = items.filter((i) => i.lemma && !isKanaOnly(i.lemma));
  const usable = withKanji.filter((i) => i.reading && readingKeepsKana(i.lemma, i.reading));
  const damaged = withKanji.filter((i) => i.reading && !readingKeepsKana(i.lemma, i.reading));
  const missing = withKanji.filter((i) => !i.reading);

  console.log(
    `\ncustom items: ${items.length} ja, ${withKanji.length} with kanji — ` +
      `${usable.length} segmentable now, ${damaged.length} with a damaged reading, ` +
      `${missing.length} with no reading`,
  );
  console.log(
    `  (${damaged.length + missing.length} need a model call; run scripts/enrich.ts for those)`,
  );

  const itemDict = await loadFuriganaDict(usable.map((i) => i.lemma));
  const itemWrites: { id: string; segments: FuriganaSegment[] | null }[] = [];
  const itemTally: Record<Shape, number> = { "per-kanji": 0, "has-block": 0, "no-split": 0 };
  for (const item of usable) {
    let segments = segmentFurigana(item.lemma, item.reading!, itemDict);
    if (segments && !isSound(item.lemma, item.reading!, segments)) segments = null;
    itemTally[shapeOf(segments)] += 1;
    itemWrites.push({ id: item.id, segments });
  }
  if (usable.length) {
    console.log(
      `  per-kanji ${itemTally["per-kanji"]}   has a block ${itemTally["has-block"]}   no split ${itemTally["no-split"]}`,
    );
  }

  if (!apply) {
    console.log("\nDry run — pass --apply to write.");
    await sql.end();
    return;
  }

  for (const w of termWrites) {
    await sql`
      UPDATE word_terms
         SET reading = ${w.reading},
             reading_segments = ${w.segments ? sql.json(w.segments as never) : null}
       WHERE word_id = ${w.word_id} AND language = 'ja'
    `;
  }
  for (const w of itemWrites) {
    await sql`
      UPDATE user_atlas_items
         SET reading_segments = ${w.segments ? sql.json(w.segments as never) : null}
       WHERE id = ${w.id}::uuid
    `;
  }
  console.log(`\nWrote ${termWrites.length} catalogue rows and ${itemWrites.length} custom items.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
