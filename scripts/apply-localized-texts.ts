// Pure-data apply: reads a JSON map of hand-authored etymology/note text and
// UPSERTs it into word_localized_texts for a given language. No AI calls —
// the content is authored offline (see data/etymology-en.json).
//
// Usage:
//   tsx --env-file=.env.local scripts/apply-localized-texts.ts \
//       --lang=en --src=data/etymology-en.json [--dry-run]
//
// Source shape (data/etymology-en.json):
//   { "<word_id>": { "etymology": "<string>", "note": "<string?>" }, ... }
//
// Only non-empty fields are written; a missing/empty field leaves any existing
// row untouched (it is simply not upserted). Re-running overwrites prior values
// for the same (word_id, field, language).
import { readFileSync } from "node:fs";
import { getSql } from "../lib/db";

interface Entry {
  etymology?: string | null;
  note?: string | null;
}

async function main() {
  const langArg = process.argv.find((a) => a.startsWith("--lang="));
  const srcArg = process.argv.find((a) => a.startsWith("--src="));
  const dryRun = process.argv.includes("--dry-run");
  if (!langArg || !srcArg) {
    console.error("[apply-texts] --lang=<code> --src=<path> required");
    process.exit(1);
  }
  const lang = langArg.split("=")[1];
  const src = JSON.parse(readFileSync(srcArg.split("=")[1], "utf-8")) as Record<string, Entry>;

  const sql = getSql();
  if (!sql) {
    console.error("[apply-texts] DATABASE_URL not set");
    process.exit(1);
  }

  // Guard against typos writing to the wrong word ids.
  const ids = Object.keys(src);
  const existing = (await sql`
    SELECT id FROM words WHERE id = ANY(${ids})
  `) as unknown as { id: string }[];
  const known = new Set(existing.map((r) => r.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    console.warn(`[apply-texts] ${unknown.length} unknown word ids (skipped): ${unknown.slice(0, 10).join(", ")}${unknown.length > 10 ? "…" : ""}`);
  }

  let etym = 0;
  let note = 0;
  for (const [id, entry] of Object.entries(src)) {
    if (!known.has(id)) continue;
    for (const field of ["etymology", "note"] as const) {
      const value = entry[field]?.trim();
      if (!value) continue;
      if (dryRun) {
        if (field === "etymology") etym++;
        else note++;
        continue;
      }
      await sql`
        INSERT INTO word_localized_texts (word_id, field, language, value)
        VALUES (${id}, ${field}, ${lang}, ${value})
        ON CONFLICT (word_id, field, language) DO UPDATE SET value = EXCLUDED.value
      `;
      if (field === "etymology") etym++;
      else note++;
    }
  }

  console.log(
    `[apply-texts] ${dryRun ? "DRY RUN — " : ""}lang=${lang}: ${etym} etymology + ${note} note rows${dryRun ? " would be" : ""} upserted (${ids.length} entries, ${unknown.length} unknown skipped)`,
  );
  await sql.end();
}

main();
