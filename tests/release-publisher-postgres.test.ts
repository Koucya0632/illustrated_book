import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import postgres from "postgres";
import { prepareReleasePlan, writePublishPlan } from "../lib/catalogue/publish/prepare";
import { databaseHostFingerprint, publishRelease, type ApplyManifest } from "../lib/catalogue/publish/publish";
import { buildReleaseFixture, hasFfmpeg, memoryStorage } from "./helpers/release-fixture";
import { CATALOGUE_TABLES, migrateDdlFor } from "./helpers/migrate-ddl";

const databaseUrl = process.env.CREDIT_TEST_DATABASE_URL;
const root = path.resolve(new URL("..", import.meta.url).pathname);

const PUBLISHER_TABLES = new Set([...CATALOGUE_TABLES, "word_media", "word_example_media", "word_tags", "tags"]);

test("shared publisher against real PostgreSQL", { skip: !databaseUrl || !hasFfmpeg() }, async () => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_credits_test");
  // Its own database: the publisher checks `public.*` tables by name.
  const name = `release_publisher_${randomUUID().slice(0, 8)}`;
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const own = new URL(databaseUrl!);
  own.pathname = `/${name}`;
  const sql = postgres(own.toString(), { max: 1, onnotice: () => {} });
  const fixture = await buildReleaseFixture(root);
  try {
    for (const statement of migrateDdlFor(PUBLISHER_TABLES)) await sql.unsafe(statement);
    // Tables outside the catalogue that only count references to the release.
    await sql.unsafe(`
      CREATE TABLE user_cards (card_id BIGINT);
      CREATE TABLE user_favorites (word_id TEXT);
      CREATE TABLE user_learned (word_id TEXT);
      CREATE TABLE user_words (word_id TEXT);
      CREATE TABLE study_logs (word_id TEXT);
      CREATE TABLE study_reports (word_id TEXT);
      CREATE TABLE user_atlas_items (canonical_word_id TEXT);
      CREATE TABLE user_settings (study_category TEXT, study_categories TEXT);
    `);

    const hostFingerprint = databaseHostFingerprint(own.toString());
    const target = { hostFingerprint, storageBackend: "r2" as const, storageFingerprint: "fixture-store" };
    const plan = await prepareReleasePlan(fixture.descriptor, {
      root,
      storageTarget: { backend: "r2", fingerprint: "fixture-store" },
      database: { sql, hostFingerprint },
    });
    assert.equal(plan.databasePreflight.readyForGuardedApply, true);
    const { file: planFile } = writePublishPlan(fixture.descriptor, plan, root);
    const { storage, objects, state } = memoryStorage();
    const lines: string[] = [];
    const deps = { sql, storage, target, root, log: (line: string) => lines.push(line) };
    const confirmed = { confirmHost: hostFingerprint, confirmStorage: "fixture-store" };
    const ids = fixture.entries.map(({ id }) => id);
    const count = async (query: string) => (await sql.unsafe(query))[0].n as number;
    const words = () => count(`SELECT count(*)::int AS n FROM words WHERE category = '${plan.series}'`);

    // Dry run writes nothing and prints what an apply must confirm.
    const dry = await publishRelease(planFile, { mode: "dry-run" }, deps);
    assert.equal(dry.status, "dry-run");
    assert.equal(await words(), 0);
    assert.equal(objects.size, 0);
    assert.ok(lines.some((line) => line.includes(`--confirm-host ${hostFingerprint}`)));

    await assert.rejects(publishRelease(planFile, { mode: "apply" }, deps), /write refused: pass --confirm-host/);
    await assert.rejects(
      publishRelease(planFile, { mode: "apply", confirmHost: hostFingerprint, confirmStorage: "elsewhere" }, deps),
      /write refused: pass --confirm-storage/,
    );

    // Storage fails part way: nothing reaches the database, the journal remembers.
    state.failAfterPuts = 5;
    await assert.rejects(
      publishRelease(planFile, { mode: "apply", ...confirmed }, deps),
      /simulated Storage outage; recovery manifest: .*apply-manifest-.*\.json/,
    );
    assert.equal(await words(), 0);
    assert.equal(objects.size, 5);
    const manifests = fs.readdirSync(path.dirname(planFile)).filter((f) => f.startsWith("apply-manifest-"));
    assert.equal(manifests.length, 1);
    const manifestFile = path.join(path.dirname(planFile), manifests[0]);
    const failed = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as ApplyManifest;
    assert.equal(failed.status, "failed");
    const reserved = failed.resolvedExampleIds;
    assert.equal(Object.keys(reserved).length, 4);

    // A fresh apply must resume the unfinished journal instead.
    state.failAfterPuts = Infinity;
    await assert.rejects(publishRelease(planFile, { mode: "apply", ...confirmed }, deps), /unfinished publication exists/);
    const resumed = await publishRelease(planFile, { mode: "apply", ...confirmed, resume: manifestFile }, deps);
    assert.equal(resumed.status, "applied");
    const applied = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as ApplyManifest;
    assert.deepEqual(applied.resolvedExampleIds, reserved, "resume keeps the example ids it reserved");
    assert.equal(objects.size, 21);
    assert.equal(applied.storageObjects.filter(({ uploadedByRun }) => uploadedByRun).length, 21);

    const [published] = await sql`
      SELECT count(*)::int AS n FROM words WHERE id = ANY(${ids}) AND status = 'published'
    `;
    assert.equal(published.n, 2);
    assert.equal(await count(`SELECT count(*)::int AS n FROM categories WHERE id = '${plan.series}'`), 1);
    assert.equal(await count(`SELECT count(*)::int AS n FROM cards WHERE word_id LIKE '${plan.series}-%'`), 4);
    assert.equal(await count(`SELECT count(*)::int AS n FROM word_media WHERE word_id LIKE '${plan.series}-%'`), 2 + 6);
    assert.equal(await count(`
      SELECT count(*)::int AS n FROM word_example_media m
      JOIN word_examples e ON e.id = m.example_id WHERE e.word_id LIKE '${plan.series}-%'`), 12);
    assert.equal(await count(`SELECT count(*)::int AS n FROM sentence_span_glosses WHERE gloss LIKE '%${plan.series.slice(-6)}'`), 4);

    await assert.rejects(publishRelease(planFile, { mode: "apply", ...confirmed }, deps), /already published/);

    // Rollback needs the same confirmation, then removes every row it wrote.
    await assert.rejects(
      publishRelease(planFile, { mode: "rollback", manifest: manifestFile }, deps),
      /write refused/,
    );
    const rolled = await publishRelease(planFile, { mode: "rollback", manifest: manifestFile, ...confirmed }, deps);
    assert.equal(rolled.status, "rolled-back-storage-retained");
    assert.equal(await words(), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM categories WHERE id = '${plan.series}'`), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM word_examples WHERE word_id LIKE '${plan.series}-%'`), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM sentence_span_glosses WHERE gloss LIKE '%${plan.series.slice(-6)}'`), 0);
    assert.equal(objects.size, 21, "content-addressed objects are retained");

    // A reviewed input edited after planning stops every later run.
    fs.appendFileSync(path.join(root, fixture.descriptor.files.spans), "\n");
    await assert.rejects(publishRelease(planFile, { mode: "dry-run" }, deps), /reviewed source changed after planning/);
  } finally {
    fixture.cleanup();
    await sql.end();
    await admin.unsafe(`DROP DATABASE ${name}`);
    await admin.end();
  }
});
