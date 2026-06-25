// Batch zh-Hant → ja translation: fills word definitions, example
// translations, etymology, note, and category names with their ja overlays.
// Idempotent — re-running skips rows that already have the ja variant.
//
//   node --env-file=.env.local --import tsx scripts/translate.ts --limit=20
//
// Requires DATABASE_URL and AI_GATEWAY_API_KEY in the environment.
//
// Currently ja-only. zh-Hans is intentionally NOT handled here — it's
// runtime OpenCC-converted from the zh-Hant base, so storing it would just
// duplicate data the converter already produces.

import { getSql } from "../lib/db";
import { translateCategoryToJa, translateWordToJa } from "../lib/translate";

const TARGET_LANG = "ja";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 50) : 50;
  const skipCategories = process.argv.includes("--skip-categories");
  const skipWords = process.argv.includes("--skip-words");
  const refresh = process.argv.includes("--refresh");
  const auditOnly = process.argv.includes("--audit-only");

  const sql = getSql();
  if (!sql) {
    console.log("[translate] DATABASE_URL not set — nothing to do.");
    return;
  }
  if (auditOnly) {
    await printJapaneseCoverage(sql);
    await sql.end({ timeout: 5 });
    return;
  }

  let categoriesOk = 0;
  let categoriesFail = 0;
  if (!skipCategories) {
    // ---- Categories ----
    const catRows = (await sql`
      SELECT c.id, c.name_zh, c.description
      FROM categories c
      WHERE NOT EXISTS (
        SELECT 1 FROM category_translations ct
        WHERE ct.category_id = c.id AND ct.language = ${TARGET_LANG}
      )
      ORDER BY c.sort_order, c.id
    `) as unknown as { id: string; name_zh: string; description: string | null }[];

    console.log(`[translate] ${catRows.length} category(ies) need ja.`);
    for (const c of catRows) {
      try {
        const { name } = await translateCategoryToJa({
          nameZh: c.name_zh,
          description: c.description ?? undefined,
        });
        await sql`
          INSERT INTO category_translations (category_id, language, name)
          VALUES (${c.id}, ${TARGET_LANG}, ${name})
          ON CONFLICT (category_id, language) DO NOTHING
        `;
        categoriesOk++;
        console.log(`  ✓ category ${c.id} — ${c.name_zh} → ${name}`);
      } catch (e) {
        categoriesFail++;
        console.warn(`  ✗ category ${c.id}:`, e instanceof Error ? e.message : e);
      }
      await new Promise((res) => setTimeout(res, 300));
    }
  }

  let wordsOk = 0;
  let wordsFail = 0;
  if (!skipWords) {
    // ---- Words ----
    // Default mode selects incomplete Japanese detail payloads. --refresh
    // intentionally regenerates existing rows too, which upgrades legacy
    // definitions that stored only the Japanese headword.
    const incompleteRows = await sql`
      SELECT w.id, w.word, w.etymology, w.note,
        w.chinese_definition,
        (SELECT definition FROM word_definitions d
         WHERE d.word_id = w.id AND d.language = 'zh'
         ORDER BY d.sort_order LIMIT 1) AS chinese_term
      FROM words w
      WHERE w.status = 'published' AND w.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM word_definitions d
          WHERE d.word_id = w.id AND d.language = 'zh'
        )
        AND (
          NOT EXISTS (
            SELECT 1 FROM word_terms wt
            WHERE wt.word_id = w.id AND wt.language = ${TARGET_LANG}
          )
          OR NOT EXISTS (
            SELECT 1
            FROM word_definitions d
            JOIN word_terms wt
              ON wt.word_id = d.word_id AND wt.language = ${TARGET_LANG}
            WHERE d.word_id = w.id
              AND d.language = ${TARGET_LANG}
              AND btrim(d.definition) <> btrim(wt.term)
          )
          OR EXISTS (
            SELECT 1 FROM word_examples e
            WHERE e.word_id = w.id
              AND NOT EXISTS (
                SELECT 1 FROM word_example_translations t
                WHERE t.example_id = e.id AND t.language = ${TARGET_LANG}
              )
          )
        )
      ORDER BY w.category, w.word
      LIMIT ${limit}
    `;
    const refreshRows = refresh
      ? await sql`
          SELECT w.id, w.word, w.etymology, w.note,
            w.chinese_definition,
            (SELECT definition FROM word_definitions d
             WHERE d.word_id = w.id AND d.language = 'zh'
             ORDER BY d.sort_order LIMIT 1) AS chinese_term
          FROM words w
          WHERE w.status = 'published' AND w.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM word_definitions d
              WHERE d.word_id = w.id AND d.language = 'zh'
            )
          ORDER BY w.category, w.word
          LIMIT ${limit}
        `
      : incompleteRows;
    const wordRows = refreshRows as unknown as {
      id: string;
      word: string;
      etymology: string | null;
      note: string | null;
      chinese_definition: string | null;
      chinese_term: string | null;
    }[];

    console.log(
      `[translate] ${wordRows.length} word(s) selected for ja details ` +
        `(limit ${limit}${refresh ? ", refresh" : ""}).`,
    );

    for (const w of wordRows) {
      if (!w.chinese_term) {
        console.log(`  · skip ${w.id} (no zh definition)`);
        continue;
      }

      // Pull each word's examples (en + zh translation) for the prompt.
      const exampleRows = (await sql`
        SELECT e.id, e.sentence,
          (SELECT translation FROM word_example_translations t
           WHERE t.example_id = e.id AND t.language = 'zh') AS zh
        FROM word_examples e
        WHERE e.word_id = ${w.id}
        ORDER BY e.sort_order
      `) as unknown as { id: number; sentence: string; zh: string | null }[];

      const examples = exampleRows.map((e) => ({ en: e.sentence, zh: e.zh ?? "" }));

      try {
        const result = await translateWordToJa({
          englishWord: w.word,
          chineseTerm: w.chinese_term,
          chineseDefinition: w.chinese_definition ?? w.chinese_term,
          etymology: w.etymology ?? undefined,
          note: w.note ?? undefined,
          examples,
        });

        // 1. definition
        await sql`
          INSERT INTO word_definitions (word_id, language, definition, sort_order)
          VALUES (${w.id}, ${TARGET_LANG}, ${result.definition}, 0)
          ON CONFLICT (word_id, language, sort_order)
          DO UPDATE SET definition = EXCLUDED.definition, updated_at = now()
        `;
        await sql`
          INSERT INTO word_terms (word_id, language, term, reading, pronunciation)
          VALUES (${w.id}, ${TARGET_LANG}, ${result.term}, ${result.reading}, ${result.reading})
          ON CONFLICT (word_id, language) DO UPDATE SET
            term = EXCLUDED.term,
            reading = EXCLUDED.reading,
            pronunciation = EXCLUDED.pronunciation,
            updated_at = now()
        `;
        await sql`
          INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
          VALUES (
            ${w.id}, '回想卡', '', ${result.term},
            ${`${result.term} ${result.reading}`.trim()},
            ARRAY['image','ja']::text[], 'image-ja'
          )
          ON CONFLICT (word_id, deck_key) DO UPDATE SET
            back = EXCLUDED.back,
            explanation = EXCLUDED.explanation,
            tags = EXCLUDED.tags
        `;

        // 2. etymology / note overlay
        if (result.etymology && w.etymology) {
          await sql`
            INSERT INTO word_localized_texts (word_id, field, language, value)
            VALUES (${w.id}, 'etymology', ${TARGET_LANG}, ${result.etymology})
            ON CONFLICT (word_id, field, language) DO NOTHING
          `;
        }
        if (result.note && w.note) {
          await sql`
            INSERT INTO word_localized_texts (word_id, field, language, value)
            VALUES (${w.id}, 'note', ${TARGET_LANG}, ${result.note})
            ON CONFLICT (word_id, field, language) DO NOTHING
          `;
        }

        // 3. example translations — pair by index with the input examples.
        let exOk = 0;
        for (let i = 0; i < exampleRows.length && i < result.examples.length; i++) {
          const ja = result.examples[i];
          if (!ja) continue;
          await sql`
            INSERT INTO word_example_translations (example_id, language, translation)
            VALUES (${exampleRows[i].id}, ${TARGET_LANG}, ${ja})
            ON CONFLICT (example_id, language)
            DO UPDATE SET translation = EXCLUDED.translation
          `;
          exOk++;
        }

        wordsOk++;
        console.log(
          `  ✓ ${w.id} — ${result.term} (${result.reading}) def✓ ` +
            `etym${result.etymology ? "✓" : "·"} ` +
            `note${result.note ? "✓" : "·"} ` +
            `ex ${exOk}/${exampleRows.length}`,
        );
      } catch (e) {
        wordsFail++;
        console.warn(`  ✗ ${w.id}:`, e instanceof Error ? e.message : e);
      }
      await new Promise((res) => setTimeout(res, 300));
    }
  }

  console.log(
    `[translate] done. categories ok=${categoriesOk} fail=${categoriesFail}; ` +
      `words ok=${wordsOk} fail=${wordsFail}.`,
  );
  await printJapaneseCoverage(sql);
  await sql.end({ timeout: 5 });
}

async function printJapaneseCoverage(sql: NonNullable<ReturnType<typeof getSql>>) {
  const [coverage] = (await sql`
    SELECT
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM word_terms wt
          WHERE wt.word_id = w.id AND wt.language = 'ja'
        )
      )::int AS japanese_terms,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM word_definitions d
          JOIN word_terms wt ON wt.word_id = d.word_id AND wt.language = 'ja'
          WHERE d.word_id = w.id
            AND d.language = 'ja'
            AND btrim(d.definition) <> btrim(wt.term)
        )
      )::int AS japanese_definitions,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM word_terms wt
          WHERE wt.word_id = w.id AND wt.language = 'ja'
        )
        AND NOT EXISTS (
          SELECT 1 FROM word_examples e
          WHERE e.word_id = w.id
            AND NOT EXISTS (
              SELECT 1 FROM word_example_translations t
              WHERE t.example_id = e.id AND t.language = 'ja'
            )
        )
      )::int AS complete_examples
    FROM words w
    WHERE w.status = 'published' AND w.deleted_at IS NULL
  `) as unknown as {
    japanese_terms: number;
    japanese_definitions: number;
    complete_examples: number;
  }[];
  const missing = (await sql`
    SELECT w.id
    FROM words w
    WHERE w.status = 'published' AND w.deleted_at IS NULL
      AND (
        NOT EXISTS (
          SELECT 1 FROM word_terms wt
          WHERE wt.word_id = w.id AND wt.language = 'ja'
        )
        OR NOT EXISTS (
          SELECT 1
          FROM word_definitions d
          JOIN word_terms wt ON wt.word_id = d.word_id AND wt.language = 'ja'
          WHERE d.word_id = w.id
            AND d.language = 'ja'
            AND btrim(d.definition) <> btrim(wt.term)
        )
        OR EXISTS (
          SELECT 1 FROM word_examples e
          WHERE e.word_id = w.id
            AND NOT EXISTS (
              SELECT 1 FROM word_example_translations t
              WHERE t.example_id = e.id AND t.language = 'ja'
            )
        )
      )
    ORDER BY w.category, w.word
  `) as unknown as { id: string }[];
  console.log(
    `[translate] coverage: terms=${coverage?.japanese_terms ?? 0}, ` +
      `definitions=${coverage?.japanese_definitions ?? 0}, ` +
      `completeExamples=${coverage?.complete_examples ?? 0}.`,
  );
  console.log(`[translate] missing word IDs: ${missing.map((row) => row.id).join(", ") || "(none)"}`);
}

main().catch((e) => {
  console.error("[translate] fatal:", e);
  process.exit(1);
});
