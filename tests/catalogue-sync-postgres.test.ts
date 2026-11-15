import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { GUARDED_SERIES, RELEASE_EXAMPLE_PAIRS } from "../lib/catalogue/releases";
import { createCatalogueSync, readCatalogueGaps } from "../lib/catalogue/sync";
import { readCatalogueTopics } from "../lib/catalogue/topics";
import { categories } from "../lib/categories";
import { words } from "../lib/words";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;

const CATALOGUE_TABLES = new Set([
  "words", "categories", "category_translations", "word_definitions", "word_terms",
  "word_examples", "word_example_translations", "sentence_spans", "sentence_span_glosses",
  "word_relations", "word_localized_texts", "cards", "word_categories",
]);

/** The real DDL for the catalogue tables, in migrate.ts order: table, column,
 * constraint and index statements only (no RLS, policies or backfills). */
function catalogueDdl(): string[] {
  const migration = readFileSync(new URL("../scripts/migrate.ts", import.meta.url), "utf8");
  const start = migration.indexOf("const DDL = [");
  const end = migration.indexOf("\n];\n", start);
  const statements = [...migration.slice(start, end).matchAll(/`([^`]*)`/g)].map(([, body]) => body.trim());
  const target = (statement: string) =>
    statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ??
    statement.match(/^ALTER TABLE (\w+)\s+(ADD|ALTER|DROP) /)?.[1] ??
    statement.match(/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS \w+\s+ON (\w+)/)?.[1] ??
    statement.match(/^DO \$\$[\s\S]*?ALTER TABLE (\w+)/)?.[1];
  return statements.filter((statement) => {
    const table = target(statement);
    return table !== undefined && CATALOGUE_TABLES.has(table) &&
      !statement.includes("${") && !/ROW LEVEL SECURITY|POLICY|gin_trgm_ops/.test(statement);
  });
}

test("catalogue sync against real PostgreSQL", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  // Its own schema: other suites here create a bare `words` table.
  const schema = `catalogue_sync_${randomUUID().slice(0, 8)}`;
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
  try {
    const ddl = catalogueDdl();
    assert.ok(ddl.some((s) => s.startsWith("CREATE TABLE IF NOT EXISTS words")));
    assert.ok(ddl.some((s) => s.includes("ADD COLUMN IF NOT EXISTS status")));
    for (const statement of ddl) await sql.unsafe(statement);

    const bank = GUARDED_SERIES.find(({ category }) => category === "bank")!;
    const professions = GUARDED_SERIES.find(({ category }) => category === "professions")!;
    const kitchen = words.filter(({ category }) => category === "kitchen").slice(0, 4);
    const seed = { categories, words: [...kitchen, ...words.filter(({ id }) => bank.ids.includes(id))] };
    const log = () => {
      const lines = { info: [] as string[], warn: [] as string[] };
      return { lines, sink: { info: (l: string) => lines.info.push(l), warn: (l: string) => lines.warn.push(l) } };
    };
    const topicIds = async () => (await readCatalogueTopics(sql)).map(({ id }) => id);

    // Deploy 1: the bank release is planned but not published.
    const first = createCatalogueSync(sql, seed, log().sink);
    await first.seedCategories();
    const { seeded, deferred } = await first.seedMissingWords();
    await first.syncWordImages();
    assert.deepEqual(new Set(seeded), new Set(kitchen.map(({ id }) => id)));
    assert.deepEqual(new Set(deferred), new Set(bank.ids));
    const [{ n: bankWords }] = await sql`SELECT count(*)::int AS n FROM words WHERE category = 'bank'`;
    assert.equal(bankWords, 0, "routine seeding never writes a guarded word");
    const [{ n: bankTopic }] = await sql`SELECT count(*)::int AS n FROM categories WHERE id = 'bank'`;
    assert.equal(bankTopic, 0, "nor its topic");
    assert.ok((await topicIds()).includes("kitchen"));

    // The bank publisher: topic first under a working name, then the words with
    // their reviewed example pairs. The live topic list waits for the last word.
    await sql`
      INSERT INTO categories (id, name, name_zh, emoji, description, color, image_url, sort_order)
      VALUES ('bank', 'Working name', '草稿', '🏦', '', '', '', 999)
    `;
    const bankWordsSeed = seed.words.filter(({ id }) => bank.ids.includes(id));
    for (const [index, word] of bankWordsSeed.entries()) {
      await sql`
        INSERT INTO words (id, word, category, part_of_speech, pronunciation, image_url, status)
        VALUES (${word.id}, ${word.word}, 'bank', ${word.partOfSpeech}, ${word.pronunciation}, ${word.imageUrl}, 'published')
      `;
      const pair = RELEASE_EXAMPLE_PAIRS.find(({ id }) => id === word.id)!;
      for (const example of pair.examples) {
        const [{ id: exampleId }] = await sql`
          INSERT INTO word_examples (word_id, sentence, cefr_level, sort_order)
          VALUES (${word.id}, ${example.en}, ${example.cefrLevel}, ${example.sortOrder})
          RETURNING id
        `;
        await sql`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES (${exampleId}, 'ja', ${example.ja}), (${exampleId}, 'zh', ${example.zh})
        `;
      }
      const visible = (await topicIds()).includes("bank");
      assert.equal(visible, index === bankWordsSeed.length - 1, `bank visible after ${index + 1} word(s)`);
    }

    // A word published straight to the database that no release registers.
    await sql`
      INSERT INTO words (id, word, category, part_of_speech, pronunciation, image_url, status)
      VALUES ('catalogue-test-unregistered', 'kettle stand', 'kitchen', 'noun', '', '', 'published')
    `;
    // One planned professions word published early: that topic stays held.
    await sql`
      INSERT INTO categories (id, name, name_zh, emoji, description, color, image_url, sort_order)
      VALUES ('professions', 'Professions', '職業', '🧑', '', '', '', 998)
    `;
    await sql`
      INSERT INTO words (id, word, category, part_of_speech, pronunciation, image_url, status)
      VALUES (${professions.ids[0]}, 'early word', 'professions', 'noun', '', '', 'published')
    `;
    assert.equal((await topicIds()).includes("professions"), false);

    // Deploy 2: the topic record now follows the code; content sync warns about
    // the unregistered word and carries on.
    const second = log();
    const deploy = createCatalogueSync(sql, seed, second.sink);
    await deploy.seedCategories();
    const [bankRow] = await sql`SELECT name FROM categories WHERE id = 'bank'`;
    assert.equal(bankRow.name, categories.find(({ id }) => id === "bank")!.name);
    const [professionsRow] = await sql`SELECT name FROM categories WHERE id = 'professions'`;
    assert.equal(professionsRow.name, "Professions", "a held topic's record is left to its publisher");
    await deploy.seedMissingWords();
    await deploy.syncWordImages();
    const content = await deploy.syncReleasedContent();
    assert.deepEqual(content.unregistered, ["catalogue-test-unregistered"]);
    assert.ok(second.lines.warn.some((line) => line.includes("catalogue-test-unregistered")));
    assert.equal(content.examples.checked, kitchen.length + bank.ids.length);
    assert.equal(content.examples.unchanged, bank.ids.length, "published pairs are recognised");
    assert.equal(content.examples.updated, kitchen.length, "seeded legacy examples move to their pairs");
    const [early] = await sql`
      SELECT count(*)::int AS n FROM word_examples WHERE word_id = ${professions.ids[0]}
    `;
    assert.equal(early.n, 0, "a held release's words are left to its publisher");
    const [{ n: unregisteredExamples }] = await sql`
      SELECT count(*)::int AS n FROM word_examples WHERE word_id = 'catalogue-test-unregistered'
    `;
    assert.equal(unregisteredExamples, 0);

    const gaps = await readCatalogueGaps(sql);
    assert.deepEqual(gaps.unregistered, ["catalogue-test-unregistered"]);
    assert.equal(gaps.guardedTopics.find(({ category }) => category === "bank")?.open, true);
    const heldProfessions = gaps.guardedTopics.find(({ category }) => category === "professions")!;
    assert.equal(heldProfessions.open, false);
    assert.equal(heldProfessions.missing.length, professions.ids.length - 1);

    // Deploy 3 changes nothing, including updated_at stamps.
    const stamps = async () => ({
      words: await sql`SELECT id, updated_at FROM words ORDER BY id`,
      definitions: await sql`SELECT word_id, language, sort_order, definition, updated_at FROM word_definitions ORDER BY 1, 2, 3`,
      terms: await sql`SELECT word_id, language, term, reading, updated_at FROM word_terms ORDER BY 1, 2`,
      examples: await sql`SELECT word_id, sentence, sort_order FROM word_examples ORDER BY 1, 3`,
      spans: await sql`SELECT count(*)::int AS n FROM sentence_spans`,
    });
    const before = await stamps();
    const third = log();
    const again = createCatalogueSync(sql, seed, third.sink);
    await again.seedCategories();
    assert.deepEqual((await again.seedMissingWords()).seeded, []);
    assert.deepEqual(await again.syncWordImages(), []);
    const rerun = await again.syncReleasedContent();
    assert.equal(rerun.examples.updated, 0);
    assert.equal(rerun.examples.spanSentencesUpdated, 0);
    assert.deepEqual(await stamps(), before);
  } finally {
    await sql.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
