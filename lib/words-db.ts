// Server-only DB CRUD for words. Imported by admin API routes.
//
// Phase 2b: this module now writes to the normalized v2 tables
// (word_definitions, word_examples + translations, word_tags, word_relations).
// It also keeps writing the legacy columns (chinese, examples, related_words,
// confusing_words) so the read path stays consistent until Phase 3 drops them.
//
// Throws if DATABASE_URL is missing — admin routes must not silently fall
// back to the read-only static data.

import "server-only";
import { revalidateTag } from "next/cache";
import { getSql } from "./db";
import type {
  CategoryId,
  Definition,
  Example,
  RelationType,
  Word,
  WordRelation,
} from "@/types";
import { primaryChinese } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

interface WordRow {
  id: string;
  word: string;
  also_known_as: string[];
  category: string;
  part_of_speech: string;
  pronunciation: string;
  audio_url: string | null;
  image_url: string;
  cefr_level: string | null;
  status: string;
  collocations: string[];
  note: string | null;
  deleted_at: string | null;
}
interface DefRow { language: string; definition: string; cefr_level: string | null; sort_order: number; }
interface ExRow { id: number; sentence: string; cefr_level: string | null; sort_order: number; }
interface TransRow { example_id: number; language: string; translation: string; }
interface TagRow { tag_id: string; }
interface RelRow { target_word_id: string; relation_type: string; note: string | null; }

function requireSql(): Sql {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

function bustCaches() {
  // No-op outside a Next request context (e.g. the enrich CLI script), where
  // revalidateTag throws. Deployed reads still refresh via the 60s revalidate.
  try {
    revalidateTag("words");
  } catch {
    /* not in a request/render scope */
  }
}

// ---- Reads (admin-facing — includes drafts/archived/soft-deleted) --------

function hydrate(
  row: WordRow,
  defs: DefRow[],
  examples: ExRow[],
  translationsByExample: Map<number, Record<string, string>>,
  tags: string[],
  relations: RelRow[],
): Word {
  const definitions: Definition[] = defs.map((d) => ({
    language: d.language,
    definition: d.definition,
    cefrLevel: (d.cefr_level as Definition["cefrLevel"]) ?? undefined,
    sortOrder: d.sort_order,
  }));
  const examplesOut: Example[] = examples.map((e) => {
    const translations = translationsByExample.get(e.id) ?? {};
    return {
      en: e.sentence,
      zh: translations.zh ?? "",
      translations,
      cefrLevel: (e.cefr_level as Example["cefrLevel"]) ?? undefined,
      sortOrder: e.sort_order,
    };
  });
  const wordRelations: WordRelation[] = relations.map((r) => ({
    wordId: r.target_word_id,
    type: r.relation_type as RelationType,
    note: r.note ?? undefined,
  }));
  const seeAlso = wordRelations.filter((r) => r.type === "see-also").map((r) => r.wordId);
  const confusing = wordRelations
    .filter((r) => r.type === "confusing")
    .map((r) => ({ word: r.wordId, note: r.note ?? "" }));
  return {
    id: row.id,
    word: row.word,
    alsoKnownAs: row.also_known_as.length ? row.also_known_as : undefined,
    category: row.category as CategoryId,
    partOfSpeech: row.part_of_speech,
    pronunciation: row.pronunciation,
    audioUrl: row.audio_url ?? undefined,
    imageUrl: row.image_url,
    cefrLevel: (row.cefr_level as Word["cefrLevel"]) ?? undefined,
    status: row.status as Word["status"],
    definitions,
    chinese: primaryChinese(definitions),
    examples: examplesOut,
    tags,
    relations: wordRelations,
    collocations: row.collocations.length ? row.collocations : undefined,
    note: row.note ?? undefined,
    relatedWords: seeAlso.length ? seeAlso : undefined,
    confusingWords: confusing.length ? confusing : undefined,
  };
}

async function loadChildrenFor(sql: Sql, ids: string[]) {
  if (ids.length === 0) {
    return {
      defsByWord: new Map<string, DefRow[]>(),
      examplesByWord: new Map<string, ExRow[]>(),
      translationsByExample: new Map<number, Record<string, string>>(),
      tagsByWord: new Map<string, string[]>(),
      relationsByWord: new Map<string, RelRow[]>(),
    };
  }
  const [defs, examples, tags, relations] = await Promise.all([
    sql<DefRow & { word_id: string }>`
      SELECT word_id, language, definition, cefr_level, sort_order
      FROM word_definitions
      WHERE word_id = ANY(${ids})
      ORDER BY word_id, language, sort_order
    ` as Promise<Array<DefRow & { word_id: string }>>,
    sql<ExRow & { word_id: string }>`
      SELECT id, word_id, sentence, cefr_level, sort_order
      FROM word_examples
      WHERE word_id = ANY(${ids})
      ORDER BY word_id, sort_order
    ` as Promise<Array<ExRow & { word_id: string }>>,
    sql<TagRow & { word_id: string }>`
      SELECT word_id, tag_id
      FROM word_tags
      WHERE word_id = ANY(${ids})
      ORDER BY word_id, tag_id
    ` as Promise<Array<TagRow & { word_id: string }>>,
    sql<RelRow & { source_word_id: string }>`
      SELECT source_word_id, target_word_id, relation_type, note
      FROM word_relations
      WHERE source_word_id = ANY(${ids})
      ORDER BY source_word_id, relation_type, target_word_id
    ` as Promise<Array<RelRow & { source_word_id: string }>>,
  ]);

  const defsByWord = new Map<string, DefRow[]>();
  for (const d of defs) {
    const list = defsByWord.get(d.word_id) ?? [];
    list.push({ language: d.language, definition: d.definition, cefr_level: d.cefr_level, sort_order: d.sort_order });
    defsByWord.set(d.word_id, list);
  }
  const examplesByWord = new Map<string, ExRow[]>();
  const exampleIds: number[] = [];
  for (const e of examples) {
    const list = examplesByWord.get(e.word_id) ?? [];
    list.push({ id: e.id, sentence: e.sentence, cefr_level: e.cefr_level, sort_order: e.sort_order });
    examplesByWord.set(e.word_id, list);
    exampleIds.push(e.id);
  }
  const translationsByExample = new Map<number, Record<string, string>>();
  if (exampleIds.length) {
    const trs = (await sql`
      SELECT example_id, language, translation
      FROM word_example_translations
      WHERE example_id = ANY(${exampleIds})
    `) as TransRow[];
    for (const t of trs) {
      const map = translationsByExample.get(t.example_id) ?? {};
      map[t.language] = t.translation;
      translationsByExample.set(t.example_id, map);
    }
  }
  const tagsByWord = new Map<string, string[]>();
  for (const t of tags) {
    const list = tagsByWord.get(t.word_id) ?? [];
    list.push(t.tag_id);
    tagsByWord.set(t.word_id, list);
  }
  const relationsByWord = new Map<string, RelRow[]>();
  for (const r of relations) {
    const list = relationsByWord.get(r.source_word_id) ?? [];
    list.push({ target_word_id: r.target_word_id, relation_type: r.relation_type, note: r.note });
    relationsByWord.set(r.source_word_id, list);
  }
  return { defsByWord, examplesByWord, translationsByExample, tagsByWord, relationsByWord };
}

/** Admin list — includes drafts, archived, and soft-deleted (excluded only
 *  when hard-deleted via a true DELETE, which we no longer issue). */
export async function listAll(): Promise<Word[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, word, also_known_as, category, part_of_speech,
           pronunciation, audio_url, image_url, cefr_level, status,
           collocations, note, deleted_at
    FROM words
    ORDER BY category, word
  `) as WordRow[];
  const { defsByWord, examplesByWord, translationsByExample, tagsByWord, relationsByWord } =
    await loadChildrenFor(sql, rows.map((r) => r.id));
  return rows.map((r) =>
    hydrate(
      r,
      defsByWord.get(r.id) ?? [],
      examplesByWord.get(r.id) ?? [],
      translationsByExample,
      tagsByWord.get(r.id) ?? [],
      relationsByWord.get(r.id) ?? [],
    ),
  );
}

export async function getById(id: string): Promise<Word | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, word, also_known_as, category, part_of_speech,
           pronunciation, audio_url, image_url, cefr_level, status,
           collocations, note, deleted_at
    FROM words WHERE id = ${id}
  `) as WordRow[];
  if (!rows[0]) return null;
  const { defsByWord, examplesByWord, translationsByExample, tagsByWord, relationsByWord } =
    await loadChildrenFor(sql, [id]);
  return hydrate(
    rows[0],
    defsByWord.get(id) ?? [],
    examplesByWord.get(id) ?? [],
    translationsByExample,
    tagsByWord.get(id) ?? [],
    relationsByWord.get(id) ?? [],
  );
}

// ---- Writes (transactional across all v2 child tables) ------------------

/** Normalize the incoming Word from the admin form to its canonical sub-table
 *  payloads. Forms still edit `chinese` + legacy `relatedWords` +
 *  `confusingWords` (Phase 2c will give them proper editors), so we project
 *  those into the v2 shape here. */
function decompose(w: Word): {
  definitions: Definition[];
  examples: Example[];
  tags: string[];
  relations: WordRelation[];
} {
  // Definitions: prefer the explicit array; fall back to a single zh def from
  // the legacy chinese field for forms that haven't been upgraded yet.
  const defs = w.definitions?.length
    ? w.definitions
    : [{ language: "zh", definition: w.chinese ?? "", sortOrder: 0 }];

  // Examples: ensure each carries a translations map. Legacy forms only put
  // `zh` on top; promote that into translations for storage.
  const examples = (w.examples ?? []).map((e, i) => ({
    ...e,
    sortOrder: e.sortOrder ?? i,
    translations: e.translations ?? (e.zh ? { zh: e.zh } : {}),
  }));

  const tags = w.tags ?? [];

  // Relations: prefer the explicit typed array. If empty, project the
  // deprecated arrays (`relatedWords` → see-also, `confusingWords` →
  // confusing) so the legacy admin form keeps working.
  const relations: WordRelation[] = w.relations?.length
    ? w.relations
    : [
        ...(w.relatedWords ?? []).map<WordRelation>((id) => ({ wordId: id, type: "see-also" })),
        ...(w.confusingWords ?? []).map<WordRelation>((c) => ({
          wordId: c.word,
          type: "confusing",
          note: c.note,
        })),
      ];

  return { definitions: defs, examples, tags, relations };
}

async function writeChildren(sql: Sql, w: Word) {
  const { definitions, examples, tags, relations } = decompose(w);

  // Replace-all strategy: simpler than diffing. With ≤ a few rows per child
  // this is fine; for larger fan-out we'd switch to upserts.
  await sql`DELETE FROM word_definitions WHERE word_id = ${w.id}`;
  for (let i = 0; i < definitions.length; i++) {
    const d = definitions[i];
    if (!d.definition.trim()) continue;
    await sql`
      INSERT INTO word_definitions (word_id, language, definition, cefr_level, sort_order)
      VALUES (${w.id}, ${d.language}, ${d.definition}, ${d.cefrLevel ?? null}, ${d.sortOrder ?? i})
    `;
  }

  await sql`DELETE FROM word_examples WHERE word_id = ${w.id}`;
  for (let i = 0; i < examples.length; i++) {
    const e = examples[i];
    if (!e.en.trim()) continue;
    const [{ id: exId }] = await sql`
      INSERT INTO word_examples (word_id, sentence, cefr_level, sort_order)
      VALUES (${w.id}, ${e.en}, ${e.cefrLevel ?? null}, ${e.sortOrder ?? i})
      RETURNING id
    `;
    for (const [lang, text] of Object.entries(e.translations ?? {})) {
      if (!text || !text.trim()) continue;
      await sql`
        INSERT INTO word_example_translations (example_id, language, translation)
        VALUES (${exId}, ${lang}, ${text})
      `;
    }
  }

  await sql`DELETE FROM word_tags WHERE word_id = ${w.id}`;
  for (const tagId of new Set(tags.filter((t) => t.trim()))) {
    // Tag rows must exist before linking. Create on demand with empty meta.
    await sql`
      INSERT INTO tags (id, name) VALUES (${tagId}, ${tagId})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO word_tags (word_id, tag_id) VALUES (${w.id}, ${tagId})
      ON CONFLICT DO NOTHING
    `;
  }

  await sql`DELETE FROM word_relations WHERE source_word_id = ${w.id}`;
  // De-dup on the (target, type) composite — same logical rel can't appear twice.
  const seen = new Set<string>();
  for (const r of relations) {
    if (!r.wordId || r.wordId === w.id) continue;
    const k = `${r.wordId}::${r.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    await sql`
      INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
      VALUES (${w.id}, ${r.wordId}, ${r.type}, ${r.note ?? null})
    `;
  }
}

export async function create(w: Word): Promise<void> {
  const sql = requireSql();
  await sql.begin(async (tx: Sql) => {
    await tx`
      INSERT INTO words (
        id, word, also_known_as, category, part_of_speech,
        pronunciation, audio_url, image_url, cefr_level, status,
        collocations, note
      ) VALUES (
        ${w.id}, ${w.word}, ${w.alsoKnownAs ?? []},
        ${w.category}, ${w.partOfSpeech}, ${w.pronunciation},
        ${w.audioUrl ?? null}, ${w.imageUrl},
        ${w.cefrLevel ?? null}, ${w.status ?? "published"},
        ${w.collocations ?? []},
        ${w.note ?? null}
      )
    `;
    await writeChildren(tx, w);
  });
  bustCaches();
}

export async function update(id: string, w: Word): Promise<void> {
  const sql = requireSql();
  await sql.begin(async (tx: Sql) => {
    await tx`
      UPDATE words SET
        word = ${w.word},
        also_known_as = ${w.alsoKnownAs ?? []},
        category = ${w.category},
        part_of_speech = ${w.partOfSpeech},
        pronunciation = ${w.pronunciation},
        audio_url = ${w.audioUrl ?? null},
        image_url = ${w.imageUrl},
        cefr_level = ${w.cefrLevel ?? null},
        status = ${w.status ?? "published"},
        collocations = ${w.collocations ?? []},
        note = ${w.note ?? null},
        updated_at = now()
      WHERE id = ${id}
    `;
    await writeChildren(tx, { ...w, id });
  });
  bustCaches();
}

/** Soft delete — flip status to archived + stamp deleted_at. The public read
 *  path (lib/data.ts) filters these out via `WHERE status = 'published'`.
 *  Child tables stay intact in case the row is later restored. */
export async function softDeleteWord(id: string): Promise<void> {
  const sql = requireSql();
  await sql`
    UPDATE words
    SET status = 'archived', deleted_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  bustCaches();
}

/** Hard delete — kept for parity with the old API but discouraged. Cascades
 *  remove children (definitions, examples, tags, relations, cards). */
export async function remove(id: string): Promise<void> {
  const sql = requireSql();
  await sql`DELETE FROM words WHERE id = ${id}`;
  bustCaches();
}

// ---- AI enrichment (additive; does NOT replace other children) ----------

export interface EnrichmentData {
  synonyms?: string[];
  antonyms?: string[];
  related?: string[];
  forms?: { label: string; value: string }[];
  mnemonic?: string;
  etymology?: string;
}

/** Apply AI-generated enrichment surgically: add synonym/antonym/see-also
 *  relations (skip dups), set etymology + forms, and fill `note` only if empty
 *  (so a curated mnemonic is never clobbered). Unlike `update()` this does not
 *  touch definitions/examples/tags. */
export async function applyEnrichment(id: string, data: EnrichmentData): Promise<void> {
  const sql = requireSql();
  const rels: { target: string; type: RelationType }[] = [
    ...(data.synonyms ?? []).map((w) => ({ target: w, type: "synonym" as RelationType })),
    ...(data.antonyms ?? []).map((w) => ({ target: w, type: "antonym" as RelationType })),
    ...(data.related ?? []).map((w) => ({ target: w, type: "see-also" as RelationType })),
  ];
  const forms = (data.forms ?? []).filter((f) => f?.label?.trim() && f?.value?.trim());
  const etymology = data.etymology?.trim() || null;
  const mnemonic = data.mnemonic?.trim() || null;

  await sql.begin(async (tx: Sql) => {
    for (const r of rels) {
      const target = r.target.trim();
      if (!target || target.toLowerCase() === id.toLowerCase()) continue;
      await tx`
        INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
        VALUES (${id}, ${target}, ${r.type}, NULL)
        ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING
      `;
    }
    await tx`
      UPDATE words SET
        etymology = COALESCE(${etymology}, etymology),
        forms     = CASE WHEN ${forms.length}::int > 0 THEN ${tx.json(forms)} ELSE forms END,
        note      = COALESCE(NULLIF(note, ''), ${mnemonic}),
        updated_at = now()
      WHERE id = ${id}
    `;
  });
  bustCaches();
}
