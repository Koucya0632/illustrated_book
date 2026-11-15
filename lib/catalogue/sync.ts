// Catalogue sync: what every production deploy does to bring the static
// catalogue (lib/categories.ts, lib/words.ts, lib/catalogue/releases.ts) into
// the database. scripts/migrate.ts calls it; tests drive it against a
// throwaway Postgres.
//
// Guarded releases (lib/catalogue/releases.ts) belong to their own publishers.
// Until every word a guarded topic plans is published in it, this module never
// seeds those words, never writes that topic's record, never syncs their
// images, and leaves their corrections and example pairs alone. The guard
// state is read once per sync and reused, since nothing here can publish a
// guarded word.

import type { Category, Word } from "@/types";
import { applyMainWordCorrections } from "../main-word-corrections";
import {
  applyMainWordExamplePairs,
  type MainWordExamplePairApplyResult,
} from "../main-word-example-pair-apply";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../main-word-example-pairs";
import {
  GUARDED_SERIES,
  GUARDED_WORD_IDS,
  guardedPublicationState,
  isGuardedWord,
  unpublishedGuardedWordIds,
} from "./releases";

// migrate.ts and the tests each pass their own postgres.js client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

export type CatalogueSyncLog = {
  info: (line: string) => void;
  warn: (line: string) => void;
};

const consoleLog: CatalogueSyncLog = {
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
};

export type ReleasedContentResult = {
  corrected: number;
  examples: MainWordExamplePairApplyResult;
  /** Published words with no registered example pair; their examples were
   * left untouched and the deploy continued. */
  unregistered: string[];
};

export type CatalogueGaps = {
  unregistered: string[];
  guardedTopics: { category: string; open: boolean; missing: string[] }[];
};

export function createCatalogueSync(
  sql: Sql,
  catalogue: { categories: readonly Category[]; words: readonly Word[] },
  log: CatalogueSyncLog = consoleLog,
) {
  let guardState: Promise<Map<string, boolean>> | undefined;
  const readGuardState = () =>
    (guardState ??= (async () => {
      const rows = await sql`
        SELECT id, category FROM words
        WHERE id = ANY(${Array.from(GUARDED_WORD_IDS)})
          AND status = 'published'
          AND deleted_at IS NULL
      `;
      return guardedPublicationState(rows as { id: string; category: string }[]);
    })());

  // Seeds the given words and their sub-tables. The example insert assumes the
  // word has no examples yet — true for missing words — so only missing words
  // may be passed. Guarded words are refused here too, so no caller can
  // publish a release by handing over the full static list.
  async function insertWords(list: readonly Word[]) {
    for (const w of list) {
      if (isGuardedWord(w)) continue;
      await sql`
        INSERT INTO words (
          id, word, also_known_as, category, part_of_speech,
          pronunciation, image_url, status, collocations, note, chinese_definition
        ) VALUES (
          ${w.id}, ${w.word}, ${w.alsoKnownAs ?? []}, ${w.category},
          ${w.partOfSpeech}, ${w.pronunciation}, ${w.imageUrl},
          'published', ${w.collocations ?? []}, ${w.note ?? null}, ${w.chineseDefinition ?? null}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      for (const d of w.definitions ?? []) {
        if (!d.definition) continue;
        await sql`
          INSERT INTO word_definitions (word_id, language, definition, sort_order)
          VALUES (${w.id}, ${d.language}, ${d.definition}, ${d.sortOrder})
          ON CONFLICT (word_id, language, sort_order) DO NOTHING
        `;
      }
      for (let i = 0; i < (w.examples ?? []).length; i++) {
        const ex = w.examples[i];
        if (!ex.en) continue;
        const [{ id: exId }] = await sql`
          INSERT INTO word_examples (word_id, sentence, cefr_level, sort_order)
          VALUES (${w.id}, ${ex.en}, ${ex.cefrLevel ?? null}, ${ex.sortOrder ?? i})
          RETURNING id
        `;
        for (const [lang, text] of Object.entries(ex.translations ?? {})) {
          if (!text) continue;
          await sql`
            INSERT INTO word_example_translations (example_id, language, translation)
            VALUES (${exId}, ${lang}, ${text})
            ON CONFLICT (example_id, language) DO NOTHING
          `;
        }
      }
      for (const r of w.relations ?? []) {
        if (!r.wordId || r.wordId === w.id) continue;
        await sql`
          INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
          VALUES (${w.id}, ${r.wordId}, ${r.type}, ${r.note ?? null})
          ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING
        `;
      }
    }
  }

  return {
    guardState: readGuardState,

    /** Upsert every topic record, refreshing every display field (the static
     * list is their source of truth; `/api/categories` serves the rows). A
     * guarded topic is skipped until its releases are fully published.
     * Must run before word seeding: words.category is FK-constrained. */
    async seedCategories(): Promise<void> {
      const state = await readGuardState();
      const { categories } = catalogue;
      for (const c of categories) {
        if (state.get(c.id) === false) continue;
        await sql`
          INSERT INTO categories
            (id, name, name_zh, emoji, description, description_en, color, image_url, sort_order)
          VALUES (
            ${c.id}, ${c.name}, ${c.nameZh}, ${c.emoji},
            ${c.description}, ${c.descriptionEn ?? null}, ${c.color}, ${c.imageUrl},
            ${categories.indexOf(c)}
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            name_zh = EXCLUDED.name_zh,
            emoji = EXCLUDED.emoji,
            description = EXCLUDED.description,
            description_en = EXCLUDED.description_en,
            color = EXCLUDED.color,
            image_url = EXCLUDED.image_url,
            sort_order = EXCLUDED.sort_order
          WHERE (categories.name, categories.name_zh, categories.emoji,
                 categories.description, categories.description_en, categories.color,
                 categories.image_url, categories.sort_order)
            IS DISTINCT FROM
                (EXCLUDED.name, EXCLUDED.name_zh, EXCLUDED.emoji,
                 EXCLUDED.description, EXCLUDED.description_en, EXCLUDED.color,
                 EXCLUDED.image_url, EXCLUDED.sort_order)
        `;
      }
      const [{ c: count }] = await sql`SELECT count(*)::int AS c FROM categories`;
      log.info(`[migrate] categories: ${count} rows`);
    },

    /** Insert the static words the database does not have yet. Idempotent,
     * so new seed entries land on the next deploy. */
    async seedMissingWords(): Promise<{ seeded: string[]; deferred: string[] }> {
      const { words } = catalogue;
      const existing = await sql`SELECT id FROM words`;
      const have = new Set((existing as { id: string }[]).map((r) => r.id));
      const deferred = words.filter((w) => isGuardedWord(w) && !have.has(w.id));
      const missing = words.filter((w) => !isGuardedWord(w) && !have.has(w.id));
      if (deferred.length > 0) {
        log.info(
          `[migrate] deferring ${deferred.length} guarded series word(s) to its dedicated publisher.`,
        );
      }
      if (missing.length === 0) {
        log.info(
          deferred.length > 0
            ? "[migrate] all routine seed words present; guarded series remain deferred."
            : `[migrate] all ${words.length} seed words present — nothing to seed.`,
        );
      } else {
        log.info(`[migrate] seeding ${missing.length} missing word(s) of ${words.length}...`);
        // New words should ship a Storage image (WORD_IMPORT.md §6). Warn,
        // don't fail: a content slip shouldn't block a deploy.
        const badImage = missing.filter((w) => !w.imageUrl || !w.imageUrl.includes("/word-images/"));
        if (badImage.length > 0) {
          log.warn(
            `[migrate] WARNING: ${badImage.length} new word(s) without a Storage image: ${badImage
              .map((w) => w.id)
              .join(", ")}`,
          );
        }
        await insertWords(missing);
        log.info(`[migrate] seed complete.`);
      }
      return { seeded: missing.map((w) => w.id), deferred: deferred.map((w) => w.id) };
    },

    /** Push seed imageUrl edits to existing rows, since seeding only ever sees
     * missing words. A row already on our Storage bucket is never reverted to
     * an outside URL; pointing the seed at a new Storage URL does propagate. */
    async syncWordImages(): Promise<string[]> {
      const state = await readGuardState();
      const seeded = catalogue.words.filter(
        (w) => w.imageUrl && (!isGuardedWord(w) || state.get(w.category) === true),
      );
      const updated = (await sql`
        UPDATE words w
        SET image_url = s.image_url
        FROM unnest(${seeded.map((w) => w.id)}::text[], ${seeded.map((w) => w.imageUrl)}::text[])
          AS s(id, image_url)
        WHERE w.id = s.id
          AND w.status = 'published'
          AND w.deleted_at IS NULL
          AND w.image_url IS DISTINCT FROM s.image_url
          AND (
            w.image_url IS NULL
            OR w.image_url NOT LIKE '%/word-images/%'
            OR s.image_url LIKE '%/word-images/%'
          )
        RETURNING w.id
      `) as { id: string }[];
      log.info(
        updated.length > 0
          ? `[migrate] image_url synced from seed: ${updated.map((r) => r.id).join(", ")}`
          : `[migrate] image_url: no seed changes to sync.`,
      );
      return updated.map((r) => r.id);
    },

    /** Apply reviewed corrections and example pairs to published words.
     * A published word with no registered example pair is listed as a warning
     * and skipped; the deploy goes on (`npm run catalogue:check` lists the
     * same gaps). Guarded topics that are not fully published are skipped. */
    async syncReleasedContent(): Promise<ReleasedContentResult> {
      const published = (await sql`
        SELECT id FROM words WHERE status = 'published' AND deleted_at IS NULL
      `) as { id: string }[];
      const scoped = new Set(published.map(({ id }) => id));
      for (const id of unpublishedGuardedWordIds(await readGuardState())) scoped.delete(id);

      const corrected = await applyMainWordCorrections(sql, scoped);
      log.info(`[migrate] main-word corrections checked (${corrected} rows).`);

      const unregistered = unregisteredIds(scoped);
      if (unregistered.length > 0) {
        log.warn(
          `[migrate] WARNING: ${unregistered.length} published word(s) have no registered example pair; ` +
            `their examples were left as they are: ${unregistered.join(", ")}. ` +
            `Register the release in lib/catalogue/releases.ts (npm run catalogue:check lists gaps).`,
        );
        for (const id of unregistered) scoped.delete(id);
      }
      const examples = await applyMainWordExamplePairs(sql, scoped);
      log.info(
        `[migrate] main-word examples checked (${examples.updated} updated, ${examples.unchanged} unchanged, ${examples.spanSentencesUpdated} span sentences updated).`,
      );
      return { corrected, examples, unregistered };
    },
  };
}

function unregisteredIds(published: Iterable<string>): string[] {
  const registered = new Set(MAIN_WORD_EXAMPLE_PAIRS.map(({ id }) => id));
  return [...published].filter((id) => !registered.has(id)).sort();
}

/** Read-only report of what a deploy would warn about or hold back. */
export async function readCatalogueGaps(sql: Sql): Promise<CatalogueGaps> {
  const published = (await sql`
    SELECT id, category FROM words WHERE status = 'published' AND deleted_at IS NULL
  `) as { id: string; category: string }[];
  const keys = new Set(published.map(({ id, category }) => `${category}:${id}`));
  const state = guardedPublicationState(published);
  const topics = new Map<string, string[]>();
  for (const { category, ids } of GUARDED_SERIES) {
    const missing = topics.get(category) ?? [];
    for (const id of ids) if (!keys.has(`${category}:${id}`)) missing.push(id);
    topics.set(category, missing);
  }
  const held = unpublishedGuardedWordIds(state);
  return {
    unregistered: unregisteredIds(published.map(({ id }) => id).filter((id) => !held.has(id))),
    guardedTopics: [...topics].map(([category, missing]) => ({
      category,
      open: state.get(category) === true,
      missing,
    })),
  };
}
