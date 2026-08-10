// Load the furigana reference dictionary into `furigana_dict`.
//
// Source: https://github.com/Doublevil/JmdictFurigana — per-character furigana
// for JMdict entries, in the line format `surface|reading|0:は;1:みが`. Derived
// from JMdict and distributed under the same Creative Commons Attribution-
// ShareAlike licence, which is why the app carries an attribution screen.
//
// Idempotent: re-running upserts, so bumping the dictionary release is just
// running this again with the new file.
//
//   node --env-file=.env.local --import tsx scripts/import-furigana-dict.ts ~/Downloads/JmdictFurigana.txt

import { readFileSync } from "node:fs";
import { getSql } from "../lib/db";

const BATCH = 2000;

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: import-furigana-dict.ts <JmdictFurigana.txt>");
    process.exit(1);
  }

  const sql = getSql();
  if (!sql) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  // The release ships with a BOM; left in place it becomes part of the first
  // surface, which then never matches anything.
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");

  const rows: { surface: string; reading: string; segments: string }[] = [];
  const seen = new Set<string>();
  let malformed = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("|");
    if (parts.length !== 3) {
      malformed += 1;
      continue;
    }
    const [surface, reading, segments] = parts;
    // (surface, reading) is the primary key. The 2.3.1+2026-07-25 release has
    // no repeats, but Postgres rejects a batch that conflicts with itself, so a
    // future release that gained one would fail the import rather than upsert.
    const key = `${surface}|${reading}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ surface, reading, segments });
  }

  console.log(`parsed ${rows.length} entries (${malformed} malformed lines skipped)`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await sql`
      INSERT INTO furigana_dict ${sql(chunk, "surface", "reading", "segments")}
      ON CONFLICT (surface, reading) DO UPDATE SET segments = EXCLUDED.segments
    `;
    process.stdout.write(`\r  imported ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  const [{ count }] = (await sql`SELECT count(*)::int AS count FROM furigana_dict`) as unknown as {
    count: number;
  }[];
  console.log(`\ndone — furigana_dict holds ${count} entries`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
