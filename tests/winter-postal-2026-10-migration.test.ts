import test from "node:test";
import assert from "node:assert/strict";
import { loadExampleSpanCorpus } from "../lib/example-span-corpus";
import { SPANS_VERSION } from "../lib/example-spans";
import { applyMainWordExamplePairs } from "../lib/main-word-example-pair-apply";
import { MAIN_WORD_EXAMPLE_PAIRS, selectMainWordExamplePairs } from "../lib/main-word-example-pairs";
import { MAIN_WORD_WINTER_POSTAL_IDS } from "../lib/main-word-winter-postal-2026-10";
import { words } from "../lib/words";

// Exercise the real normal-migration example synchronizer. This fixture SQL
// allows SELECT only and fails any DML before it could touch a real database.
function migrationFixture(ids: string[], options: { published?: boolean; edit?: boolean } = {}) {
  const queries: string[] = [];
  const pairs = selectMainWordExamplePairs(new Set(ids));
  const corpus = loadExampleSpanCorpus();
  const tx = async (strings: TemplateStringsArray) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push(query);
    assert.match(query, /^SELECT\b/, "up-to-date published batch must not attempt writes");
    if (query.includes("FROM words")) return options.published === false ? [] : ids.map((id) => ({ id }));
    if (query.includes("FROM word_examples e")) {
      return pairs.flatMap((pair) => pair.examples.map((example, slot) => ({
        word_id: pair.id,
        sentence: options.edit && slot === 0 ? "Later editorial change." : example.en,
        cefr_level: example.cefrLevel,
        sort_order: example.sortOrder,
        ja: example.ja,
        zh: example.zh,
      })));
    }
    if (query.includes("FROM sentence_spans s")) {
      return pairs.flatMap((pair) => pair.examples.flatMap((example) =>
        (["en", "ja"] as const).map((language) => {
          const spans = corpus[language][example[language]];
          return { sentence_language: language, sentence: example[language], span_count: spans.length,
            gloss_count: spans.filter((span) => span.z).length * 3, version: SPANS_VERSION };
        })));
    }
    throw new Error(`Unexpected migration query: ${query}`);
  };
  const sql = { begin: async (callback: (tx: unknown) => Promise<unknown>) => callback(tx) };
  return { sql: sql as unknown as Parameters<typeof applyMainWordExamplePairs>[0], queries };
}

test("normal migration recognizes both published winter pairs and leaves corrected spans untouched", async () => {
  const fixture = migrationFixture(MAIN_WORD_WINTER_POSTAL_IDS);
  const result = await applyMainWordExamplePairs(fixture.sql, new Set(MAIN_WORD_WINTER_POSTAL_IDS));
  assert.deepEqual(result, { checked: 2, updated: 0, unchanged: 2, spanSentencesUpdated: 0 });
  assert.equal(fixture.queries.length, 3);
  const request = loadExampleSpanCorpus().ja["年賀はがきを十枚ください。"];
  assert.deepEqual(request[3], { t: "ください" });
  assert.equal(request.filter((span) => span.z).length, 2);
});

test("the complete registered published corpus can pass the real migration no-op path", async () => {
  const ids = MAIN_WORD_EXAMPLE_PAIRS.map(({ id }) => id);
  const fixture = migrationFixture(ids);
  const result = await applyMainWordExamplePairs(fixture.sql, new Set(ids));
  assert.deepEqual(result, { checked: ids.length, updated: 0, unchanged: ids.length, spanSentencesUpdated: 0 });
});

test("unpublished winter IDs are refused before mutation and never added to public fallback words", async () => {
  const fixture = migrationFixture(MAIN_WORD_WINTER_POSTAL_IDS, { published: false });
  await assert.rejects(applyMainWordExamplePairs(fixture.sql, new Set(MAIN_WORD_WINTER_POSTAL_IDS)), /scoped target is not published/);
  assert.equal(words.some(({ id }) => MAIN_WORD_WINTER_POSTAL_IDS.includes(id)), false);
  assert.equal(fixture.queries.length, 1);
});

test("a later edited example aborts before migration may replace or sync anything", async () => {
  const fixture = migrationFixture(MAIN_WORD_WINTER_POSTAL_IDS, { edit: true });
  await assert.rejects(applyMainWordExamplePairs(fixture.sql, new Set(MAIN_WORD_WINTER_POSTAL_IDS)), /edited or incomplete/);
  assert.equal(fixture.queries.length, 2);
});
