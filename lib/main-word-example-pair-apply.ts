import type postgres from "postgres";
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

    return {
      checked: MAIN_WORD_EXAMPLE_PAIRS.length,
      updated: legacyIds.length,
      unchanged,
    };
  });
}
