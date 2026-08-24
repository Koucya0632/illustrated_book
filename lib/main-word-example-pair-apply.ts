import type postgres from "postgres";
import {
  loadExampleSpanCorpus,
  type SentenceLanguage,
  validateMainWordExampleSpanCoverage,
} from "./example-span-corpus";
import { SPANS_VERSION } from "./example-spans";
import {
  classifyMainWordExamplePair,
  MAIN_WORD_EXAMPLE_PAIRS,
  type StoredMainWordExample,
  validateMainWordExampleCoverage,
} from "./main-word-example-pairs";

type Sql = ReturnType<typeof postgres>;

type ExampleRow = {
  word_id: string;
  sentence: string;
  cefr_level: string | null;
  sort_order: number;
  ja: string | null;
  zh: string | null;
};

export type MainWordExamplePairApplyResult = {
  checked: number;
  updated: number;
  unchanged: number;
  spanSentencesUpdated: number;
};

/**
 * Replaces only the exact, fully known legacy example sets. Any later edit,
 * incomplete translation, new published word, or partial migration aborts the
 * transaction before a row is changed.
 */
export async function applyMainWordExamplePairs(
  sql: Sql,
): Promise<MainWordExamplePairApplyResult> {
  return sql.begin(async (tx) => {
    const spanCorpus = loadExampleSpanCorpus();
    const spanCoverageIssues = validateMainWordExampleSpanCoverage(
      MAIN_WORD_EXAMPLE_PAIRS,
      spanCorpus,
    );
    if (spanCoverageIssues.length > 0) {
      throw new Error(
        `Example-span coverage failed (${spanCoverageIssues.length}):\n${spanCoverageIssues.slice(0, 50).join("\n")}`,
      );
    }

    const publishedRows = await tx<{ id: string }[]>`
      SELECT id
      FROM words
      WHERE status = 'published' AND deleted_at IS NULL
      ORDER BY id
    `;
    const coverageIssues = validateMainWordExampleCoverage(
      publishedRows.map(({ id }) => id),
    );
    if (coverageIssues.length > 0) {
      throw new Error(`Example-pair coverage failed:\n${coverageIssues.join("\n")}`);
    }

    const rows = await tx<ExampleRow[]>`
      SELECT
        e.word_id,
        e.sentence,
        e.cefr_level,
        e.sort_order,
        max(t.translation) FILTER (WHERE t.language = 'ja') AS ja,
        max(t.translation) FILTER (WHERE t.language = 'zh') AS zh
      FROM word_examples e
      JOIN words w ON w.id = e.word_id
      LEFT JOIN word_example_translations t ON t.example_id = e.id
      WHERE w.status = 'published' AND w.deleted_at IS NULL
      GROUP BY e.id, e.word_id, e.sentence, e.cefr_level, e.sort_order
      ORDER BY e.word_id, e.sort_order, e.id
    `;

    const currentById = new Map<string, StoredMainWordExample[]>();
    for (const row of rows) {
      const current = currentById.get(row.word_id) ?? [];
      current.push({
        en: row.sentence,
        ja: row.ja ?? "",
        zh: row.zh ?? "",
        cefrLevel: row.cefr_level,
        sortOrder: row.sort_order,
      });
      currentById.set(row.word_id, current);
    }

    const conflicts: string[] = [];
    const legacyIds: string[] = [];
    let unchanged = 0;
    for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
      const classification = classifyMainWordExamplePair(
        pair.id,
        currentById.get(pair.id) ?? [],
      );
      if (classification === "target") unchanged += 1;
      else if (classification === "legacy") legacyIds.push(pair.id);
      else conflicts.push(pair.id);
    }
    if (conflicts.length > 0) {
      throw new Error(
        `Example-pair migration refused ${conflicts.length} edited or incomplete word(s): ${conflicts.join(", ")}`,
      );
    }

    const pairById = new Map(MAIN_WORD_EXAMPLE_PAIRS.map((pair) => [pair.id, pair]));
    for (const id of legacyIds) {
      const pair = pairById.get(id);
      if (!pair) throw new Error(`Missing target pair for ${id}`);
      await tx`DELETE FROM word_examples WHERE word_id = ${id}`;
      for (const example of pair.examples) {
        const [inserted] = await tx<{ id: string }[]>`
          INSERT INTO word_examples (word_id, sentence, cefr_level, sort_order)
          VALUES (${id}, ${example.en}, ${example.cefrLevel}, ${example.sortOrder})
          RETURNING id
        `;
        await tx`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES
            (${inserted.id}, 'ja', ${example.ja}),
            (${inserted.id}, 'zh', ${example.zh})
        `;
      }
    }

    // Example text and tappable gloss spans are one content unit. Sync every
    // missing/outdated target sentence inside this same transaction so a
    // deploy can never expose a new example that silently falls back to plain
    // text. Existing, complete sentences remain untouched.
    const targets = new Map<
      string,
      { language: SentenceLanguage; sentence: string }
    >();
    for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
      for (const example of pair.examples) {
        for (const [language, sentence] of [
          ["en", example.en],
          ["ja", example.ja],
        ] as const) {
          targets.set(`${language}\u0000${sentence}`, { language, sentence });
        }
      }
    }
    const enSentences = [...targets.values()]
      .filter(({ language }) => language === "en")
      .map(({ sentence }) => sentence);
    const jaSentences = [...targets.values()]
      .filter(({ language }) => language === "ja")
      .map(({ sentence }) => sentence);
    const stored = await tx<{
      sentence_language: SentenceLanguage;
      sentence: string;
      span_count: number;
      gloss_count: number;
      version: number;
    }[]>`
      SELECT
        s.sentence_language,
        s.sentence,
        count(*)::int AS span_count,
        min(s.version)::int AS version,
        (
          SELECT count(*)::int
          FROM sentence_span_glosses g
          WHERE g.sentence_language = s.sentence_language
            AND g.sentence = s.sentence
        ) AS gloss_count
      FROM sentence_spans s
      WHERE (s.sentence_language = 'en' AND s.sentence = ANY(${enSentences}))
         OR (s.sentence_language = 'ja' AND s.sentence = ANY(${jaSentences}))
      GROUP BY s.sentence_language, s.sentence
    `;
    const storedByKey = new Map(
      stored.map((row) => [`${row.sentence_language}\u0000${row.sentence}`, row]),
    );
    const needsSync = [...targets.entries()].filter(([key, target]) => {
      const spans = spanCorpus[target.language][target.sentence];
      const current = storedByKey.get(key);
      const expectedGlosses = spans.filter((span) => span.z).length * 3;
      return (
        !current ||
        current.version < SPANS_VERSION ||
        current.span_count !== spans.length ||
        current.gloss_count !== expectedGlosses
      );
    });

    if (needsSync.length > 0) {
      const syncEn = needsSync
        .map(([, target]) => target)
        .filter(({ language }) => language === "en")
        .map(({ sentence }) => sentence);
      const syncJa = needsSync
        .map(([, target]) => target)
        .filter(({ language }) => language === "ja")
        .map(({ sentence }) => sentence);
      if (syncEn.length > 0) {
        await tx`
          DELETE FROM sentence_spans
          WHERE sentence_language = 'en' AND sentence = ANY(${syncEn})
        `;
      }
      if (syncJa.length > 0) {
        await tx`
          DELETE FROM sentence_spans
          WHERE sentence_language = 'ja' AND sentence = ANY(${syncJa})
        `;
      }

      const catalogue = new Map<string, string>();
      for (const row of await tx<{ word_id: string; term: string }[]>`
        SELECT word_id, lower(term) AS term FROM word_terms
      `) {
        if (!catalogue.has(row.term)) catalogue.set(row.term, row.word_id);
      }
      const spanRows: Array<Record<string, unknown>> = [];
      const glossRows: Array<Record<string, unknown>> = [];
      for (const [, target] of needsSync) {
        const spans = spanCorpus[target.language][target.sentence];
        for (const [sortOrder, span] of spans.entries()) {
          const base = (span.b ?? span.t).toLowerCase().trim();
          spanRows.push({
            sentence_language: target.language,
            sentence: target.sentence,
            sort_order: sortOrder,
            text: span.t,
            base_form: span.b ?? null,
            part_of_speech: span.p ?? null,
            reading: span.r ?? null,
            word_id: span.z ? (catalogue.get(base) ?? null) : null,
            version: SPANS_VERSION,
          });
          for (const [language, gloss] of [
            ["zh-Hant", span.z],
            ["ja", span.j],
            ["en", span.e],
          ] as const) {
            if (!gloss) continue;
            glossRows.push({
              sentence_language: target.language,
              sentence: target.sentence,
              sort_order: sortOrder,
              language,
              gloss,
            });
          }
        }
      }
      for (let offset = 0; offset < spanRows.length; offset += 500) {
        const batch = spanRows.slice(offset, offset + 500);
        await tx`
          INSERT INTO sentence_spans ${tx(
            batch,
            "sentence_language",
            "sentence",
            "sort_order",
            "text",
            "base_form",
            "part_of_speech",
            "reading",
            "word_id",
            "version",
          )}
        `;
      }
      for (let offset = 0; offset < glossRows.length; offset += 500) {
        const batch = glossRows.slice(offset, offset + 500);
        await tx`
          INSERT INTO sentence_span_glosses ${tx(
            batch,
            "sentence_language",
            "sentence",
            "sort_order",
            "language",
            "gloss",
          )}
        `;
      }
    }

    return {
      checked: MAIN_WORD_EXAMPLE_PAIRS.length,
      updated: legacyIds.length,
      unchanged,
      spanSentencesUpdated: needsSync.length,
    };
  });
}
