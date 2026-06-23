// ja apply: reads --src=<source.json> (the output of translate-list) and
// --tgt=<translated.json>, then inserts definitions + etymology/note
// overlays + example translations (all language='ja'). UPSERTs so re-running
// after fixing a translation file overwrites the prior value.
//
// Example IDs come from `--src` positionally — examples_ja[i] in tgt is
// paired with examples[i] in src. This is the only safe option; writing
// example_ids in tgt by hand has been a steady source of corruption.
//
// Target shape (tgt):
//   [
//     {
//       "id": "<word_id>",
//       "definition_ja": "<string>",
//       "etymology_ja": "<string|null>",
//       "note_ja": "<string|null>",
//       "examples_ja": [ "<ja string 0>", "<ja string 1>", ... ]
//     },
//     ...
//   ]
import { readFileSync } from "node:fs";
import { getSql } from "../lib/db";

interface SrcItem {
  id: string;
  examples: { id: number; en: string; zh: string }[];
}
interface TgtItem {
  id: string;
  definition_ja: string;
  term_ja?: string;
  reading_ja?: string;
  etymology_ja?: string | null;
  note_ja?: string | null;
  // Either an array of ja strings (preferred, paired by index with src) or
  // a legacy array of { id, ja } objects (the id is ignored — kept only
  // for old fixture files).
  examples_ja?: string[] | { id?: number; ja: string }[];
}

function jaText(e: string | { ja: string }): string {
  return typeof e === "string" ? e : e.ja;
}

async function main() {
  const srcArg = process.argv.find((a) => a.startsWith("--src="));
  const tgtArg = process.argv.find((a) => a.startsWith("--tgt="));
  if (!srcArg || !tgtArg) {
    console.error("[apply] --src=<path> --tgt=<path> required");
    process.exit(1);
  }
  const src = JSON.parse(readFileSync(srcArg.split("=")[1], "utf-8")) as SrcItem[];
  const tgt = JSON.parse(readFileSync(tgtArg.split("=")[1], "utf-8")) as TgtItem[];

  const sql = getSql();
  if (!sql) {
    console.error("[apply] DATABASE_URL not set");
    return;
  }

  let defs = 0;
  let texts = 0;
  let exs = 0;
  let skipped = 0;
  for (const it of tgt) {
    if (!it.id || !it.definition_ja) {
      console.warn(`  · skip ${it.id} (missing id or definition)`);
      continue;
    }
    const s = src.find((x) => x.id === it.id);
    if (!s) {
      console.warn(`  · ${it.id} not in src (examples will be skipped)`);
    }

    await sql`
      INSERT INTO word_definitions (word_id, language, definition, sort_order)
      VALUES (${it.id}, 'ja', ${it.definition_ja}, 0)
      ON CONFLICT (word_id, language, sort_order) DO UPDATE SET definition = EXCLUDED.definition
    `;
    defs++;

    const term = it.term_ja?.trim() || it.definition_ja.trim();
    const reading = it.reading_ja?.trim() || null;
    await sql`
      INSERT INTO word_terms (word_id, language, term, reading, pronunciation)
      VALUES (${it.id}, 'ja', ${term}, ${reading}, ${reading})
      ON CONFLICT (word_id, language) DO UPDATE SET
        term = EXCLUDED.term,
        reading = COALESCE(EXCLUDED.reading, word_terms.reading),
        pronunciation = COALESCE(EXCLUDED.pronunciation, word_terms.pronunciation),
        updated_at = now()
    `;
    await sql`
      INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
      VALUES (
        ${it.id}, '回想卡', '', ${term},
        ${reading ? `${term} ${reading}` : term},
        ARRAY['image','ja']::text[], 'image-ja'
      )
      ON CONFLICT (word_id, deck_key) DO UPDATE SET
        back = EXCLUDED.back,
        explanation = EXCLUDED.explanation,
        tags = EXCLUDED.tags
    `;

    if (it.etymology_ja) {
      await sql`
        INSERT INTO word_localized_texts (word_id, field, language, value)
        VALUES (${it.id}, 'etymology', 'ja', ${it.etymology_ja})
        ON CONFLICT (word_id, field, language) DO UPDATE SET value = EXCLUDED.value
      `;
      texts++;
    }
    if (it.note_ja) {
      await sql`
        INSERT INTO word_localized_texts (word_id, field, language, value)
        VALUES (${it.id}, 'note', 'ja', ${it.note_ja})
        ON CONFLICT (word_id, field, language) DO UPDATE SET value = EXCLUDED.value
      `;
      texts++;
    }

    const examples = it.examples_ja ?? [];
    for (let i = 0; i < examples.length; i++) {
      const ja = jaText(examples[i]);
      const sj = s?.examples[i];
      if (!sj || !ja) {
        skipped++;
        continue;
      }
      await sql`
        INSERT INTO word_example_translations (example_id, language, translation)
        VALUES (${sj.id}, 'ja', ${ja})
        ON CONFLICT (example_id, language) DO UPDATE SET translation = EXCLUDED.translation
      `;
      exs++;
    }
    console.log(`  ✓ ${it.id} → ${it.definition_ja}`);
  }

  console.log(
    `\n[apply] defs=${defs}, localized_texts=${texts}, example_translations=${exs}, skipped=${skipped}.`,
  );
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[apply] fatal:", e);
  process.exit(1);
});
