import type { Sql, TransactionSql } from "postgres";
import { attachChoiceExclusions, candidateWord, type CandidateMeta, type RelationEdge } from "./distractors";
import { assembleStudyChoices, choiceReserve, choicesConflict, type ChoiceLanguage } from "./study-choices";

/** Full published vocabulary, independent of a user's cards and selected themes. */
export async function readChoiceCatalog(sql: Sql | TransactionSql, languages: ChoiceLanguage[]) {
  const [rows, relations] = await Promise.all([
    sql`SELECT w.id AS word_id, COALESCE(wt.term, w.word) AS label, lang.language,
          w.category, w.part_of_speech AS pos, w.cefr_level AS cefr,
          CASE WHEN lang.language = 'en' THEN w.also_known_as ELSE ARRAY[]::text[] END AS aliases,
          COALESCE(wt.pronunciation, wt.reading, w.pronunciation, '') AS pronunciation,
          COALESCE(zh.definition, '') AS gloss
        FROM words w CROSS JOIN unnest(${languages}::text[]) AS lang(language)
        LEFT JOIN word_terms wt ON wt.word_id = w.id AND wt.language = lang.language
        LEFT JOIN LATERAL (SELECT definition FROM word_definitions
          WHERE word_id = w.id AND language = 'zh' ORDER BY sort_order LIMIT 1) zh ON true
        WHERE w.status = 'published' AND w.deleted_at IS NULL
          AND (lang.language = 'en' OR NULLIF(wt.term, '') IS NOT NULL)
        ORDER BY lang.language, w.id`,
    sql`SELECT source_word_id AS source, target_word_id AS target, relation_type AS type
        FROM word_relations WHERE relation_type IN ('confusing', 'synonym', 'see-also')`,
  ]);
  const edges = relations as unknown as RelationEdge[];
  const pools = new Map<ChoiceLanguage, CandidateMeta[]>();
  for (const language of languages) {
    const pool: CandidateMeta[] = rows.filter(r => r.language === language).map(r => ({
      cardId: String(r.word_id), wordId: String(r.word_id), word: String(r.label), back: String(r.label),
      category: r.category ?? "", pos: r.pos ?? "", cefr: r.cefr ?? null,
      pronunciation: r.pronunciation ?? "", gloss: r.gloss ?? "", language, exclusions: r.aliases ?? [],
    }));
    pools.set(language, attachChoiceExclusions(pool, edges));
  }
  return { pools, relations: edges };
}

/** Read-only deployment gate: exercise the actual fallback for every published term. */
export async function assertPublishedChoiceCoverage(sql: Sql | TransactionSql): Promise<number> {
  const { pools } = await readChoiceCatalog(sql, ["en", "ja"]);
  const failures: string[] = [];
  let count = 0;
  for (const pool of pools.values()) {
    // Enrich built-in labels with the live catalogue's glosses/synonym edges.
    const reserve = choiceReserve.map(w => {
      const live = pool.find(c => c.wordId === w.wordId && c.language === w.language);
      return { ...w, gloss: [w.gloss, live?.gloss].filter(Boolean).join(" / "), exclusions: [...(w.exclusions ?? []), ...(live?.exclusions ?? [])], tier: 4, weight: 1 };
    });
    for (const entry of pool) {
      const target = candidateWord(entry);
      try {
        const options = assembleStudyChoices(target, reserve, 0);
        const selected = options.filter(s => s !== target.label).map(s => reserve.find(w => w.label === s && w.language === target.language)!);
        if (selected.some(w => !w || choicesConflict(target, w)) || selected.some((w, i) => selected.slice(i + 1).some(v => choicesConflict(w, v)))) {
          throw new Error("ambiguous reserve");
        }
      } catch { failures.push(`${target.language}:${target.wordId}`); }
      count++;
    }
  }
  if (!count || failures.length) throw new Error(`Study choice coverage failed (${failures.length}/${count}): ${failures.join(", ")}`);
  return count;
}

/** Keep read-only mode inside a transaction; pooled sessions must remain writable. */
export async function auditPublishedChoiceCoverage(sql: Sql): Promise<number> {
  return sql.begin("read only", tx => assertPublishedChoiceCoverage(tx));
}
