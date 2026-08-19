// Load the authored 詞塊 for every sentence a learner reads into Postgres.
//
// The annotations are *data*, not generation: they live in
// data/example-spans.json, are reviewed in a diff like any other content, and
// nothing calls a model at load time or at request time. Same shape as
// data/etymology-en.json, and for the same reason — a closed corpus of a few
// hundred sentences is worth writing down once and owning.
//
// Two sources feed it, and both reduce to the same thing — a sentence in the
// language being learned:
//
//   * example sentences — the English source in `word_examples.sentence` and
//     its Japanese translation in `word_example_translations(language='ja')`.
//   * `targetDefinition` — the 譯義 line, `word_definitions` in 'en' or 'ja'.
//     The 'zh' row there is the three-character headline gloss, not a sentence,
//     and the Chinese explainer is Chinese: neither is worth glossing.
//
// Storage is keyed by the sentence, so neither source needs its own table and
// the same string annotated once serves everywhere it appears.
//
// The load-bearing rule is that the spans **cover the whole sentence**:
// concatenating them re-spells it exactly. Checked here before anything is
// written, on the server before anything is served, and on the client before
// anything is rendered. A sentence that fails is reported and skipped.
//
// Dry by default; nothing is written without --apply.
//
//   node --env-file=.env.local --import tsx scripts/load-example-spans.ts
//   node --env-file=.env.local --import tsx scripts/load-example-spans.ts --apply

import { readFileSync } from "node:fs";
import { getSql } from "../lib/db";
import { SPANS_VERSION, spansCoverSentence } from "../lib/example-spans";

/** One authored span. Short keys because the file has ~9,000 of them and a
 *  diff is easier to read when a span fits on one line. */
interface AuthoredSpan {
  /** Verbatim slice of the sentence, spaces and punctuation included. */
  t: string;
  /** Gloss in the sentence's context: zh-Hant / ja / en. All three or none —
   *  a span glossed in one language only would go dark for other readers. */
  z?: string;
  j?: string;
  e?: string;
  /** Base form, when it differs from `t`. */
  b?: string;
  /** Canonical English part of speech. */
  p?: string;
  /** Kana reading. Japanese spans only. */
  r?: string;
}

type Authored = Record<"en" | "ja", Record<string, AuthoredSpan[]>>;

interface SentenceRow {
  source: string;
  sentence_language: "en" | "ja";
  sentence: string;
}

function loadAuthored(): Authored {
  const path = new URL("../data/example-spans.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Authored;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = getSql();
  if (!sql) {
    console.error("DATABASE_URL is not configured.");
    process.exit(1);
  }

  const authored = loadAuthored();

  // Every sentence a learner reads, from both sources, deduped by the loop
  // below. Draft and deleted words are excluded here rather than filtered
  // later: annotating a sentence nobody can reach is work with no reader.
  const rows = (await sql`
    SELECT 'example' AS source, 'en' AS sentence_language, e.sentence
      FROM word_examples e
      JOIN words w ON w.id = e.word_id
     WHERE w.deleted_at IS NULL AND w.status = 'published'
     UNION
    SELECT 'example', 'ja', t.translation
      FROM word_example_translations t
      JOIN word_examples e ON e.id = t.example_id
      JOIN words w ON w.id = e.word_id
     WHERE t.language = 'ja' AND w.deleted_at IS NULL AND w.status = 'published'
     UNION
    SELECT 'definition', d.language, d.definition
      FROM word_definitions d
      JOIN words w ON w.id = d.word_id
     WHERE d.language IN ('en','ja') AND w.deleted_at IS NULL AND w.status = 'published'
  `) as unknown as SentenceRow[];

  // Which strings are catalogue words is a fact this database holds. Resolved
  // here rather than authored by hand, so a span can never link to an entry
  // that does not exist.
  const catalogue = new Map<string, string>();
  for (const w of (await sql`
    SELECT word_id, lower(term) AS term FROM word_terms
  `) as unknown as { word_id: string; term: string }[]) {
    if (!catalogue.has(w.term)) catalogue.set(w.term, w.word_id);
  }

  const missing: SentenceRow[] = [];
  const broken: SentenceRow[] = [];
  const writes: { row: SentenceRow; spans: AuthoredSpan[] }[] = [];

  // The same string can arrive from several places — two words sharing a
  // definition, a definition that is also an example. It is annotated once and
  // written once; that is the whole point of keying on the sentence.
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.sentence_language}\u0000${row.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const spans = authored[row.sentence_language]?.[row.sentence];
    if (!spans) {
      missing.push(row);
      continue;
    }
    if (!spansCoverSentence(spans.map((s) => ({ text: s.t })), row.sentence)) {
      broken.push(row);
      continue;
    }
    writes.push({ row, spans });
  }

  console.log(
    `${rows.length} sentences on file — ${writes.length} ready, ${missing.length} unannotated, ${broken.length} failing coverage.`,
  );
  for (const b of broken.slice(0, 20)) {
    const joined = (authored[b.sentence_language]?.[b.sentence] ?? []).map((s) => s.t).join("");
    console.log(`  ! ${b.sentence_language} ${JSON.stringify(b.sentence)}`);
    console.log(`    spans spell ${JSON.stringify(joined)}`);
  }
  for (const m of missing.slice(0, 20)) {
    console.log(`  ? ${m.source}/${m.sentence_language} ${JSON.stringify(m.sentence)}`);
  }

  if (!apply) {
    console.log("\nDry run — pass --apply to write.");
    await sql.end();
    return;
  }
  if (broken.length) {
    console.error("\nRefusing to write while any sentence fails coverage.");
    process.exit(1);
  }

  let written = 0;
  for (const { row, spans } of writes) {
    await sql.begin(async (tx) => {
      // Replace rather than merge: a re-run at a new version must not leave
      // spans from the previous split beside the new one.
      await tx`
        DELETE FROM sentence_spans
         WHERE sentence_language = ${row.sentence_language} AND sentence = ${row.sentence}
      `;
      for (const [i, s] of spans.entries()) {
        const base = (s.b ?? s.t).toLowerCase().trim();
        await tx`
          INSERT INTO sentence_spans
            (sentence_language, sentence, sort_order, text, base_form,
             part_of_speech, reading, word_id, version)
          VALUES (${row.sentence_language}, ${row.sentence}, ${i}, ${s.t},
                  ${s.b ?? null}, ${s.p ?? null}, ${s.r ?? null},
                  ${s.z ? (catalogue.get(base) ?? null) : null}, ${SPANS_VERSION})
        `;
        const glosses: [string, string | undefined][] = [
          ["zh-Hant", s.z],
          ["ja", s.j],
          ["en", s.e],
        ];
        for (const [language, gloss] of glosses) {
          if (!gloss) continue;
          await tx`
            INSERT INTO sentence_span_glosses
              (sentence_language, sentence, sort_order, language, gloss)
            VALUES (${row.sentence_language}, ${row.sentence}, ${i}, ${language}, ${gloss})
          `;
        }
      }
    });
    written += 1;
    if (written % 100 === 0) console.log(`  … ${written}/${writes.length}`);
  }

  console.log(`\nWrote ${written} sentences at v${SPANS_VERSION}.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
