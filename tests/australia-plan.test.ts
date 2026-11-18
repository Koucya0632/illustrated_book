import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import postgres from "postgres";
import { prepareAustralianPlan, preflightAustralianDatabase } from "../lib/catalogue/publish/australia-plan";
import { createAustralianTestDatabaseAdapter } from "../lib/catalogue/publish/australia-database-test-adapter";
import { verifyAustralianPlan } from "../lib/catalogue/publish/australia-gates";

const source = process.env.AU_REVIEW_SOURCE;
const reserved = process.env.AU_RESERVED_IDS;
const root = process.cwd();
const available = Boolean(source && reserved && fs.existsSync(source) && fs.existsSync(reserved));

test("mixed Australian plan verifies real reviewed sources and rejects missing region guard IDs", { skip: !available }, () => {
  const p = prepareAustralianPlan(source!, reserved!, root);
  assert.deepEqual(p.summary, { newWords: 19, artifacts: 287, images: 23, audio: 264 });
  assert.equal(p.productionWriteAllowed, false);
  assert.equal(p.gates.deployedIsolation, "pending");
  assert.equal(p.gates.audioListening, "pending");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-guard-test-"));
  try {
    const incomplete = path.join(tmp, "reserved.json");
    fs.writeFileSync(incomplete, JSON.stringify((JSON.parse(fs.readFileSync(reserved!, "utf8")) as string[]).slice(1)));
    assert.throws(() => prepareAustralianPlan(source!, incomplete, root), /missing from the reserved regional guard/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("reviewed plan rejects changed URL, writer, ownership and preview helpers", { skip: !available }, () => {
  const original = prepareAustralianPlan(source!, reserved!, root);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-plan-pins-"));
  try {
    for (const pin of Object.values(original.sourcePins)) {
      const relative = path.relative(root, pin.file);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      const copy = path.join(scratch, relative);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(pin.file, copy);
    }
    const local = prepareAustralianPlan(source!, reserved!, scratch);
    verifyAustralianPlan(local);
    for (const key of ["publicObjects", "publicWriter", "r2Rest", "previewCode", "testOwnership", "testSessionLock"] as const) {
      const file = local.sourcePins[key].file;
      const bytes = fs.readFileSync(file);
      fs.appendFileSync(file, "\n// injected test change\n");
      assert.throws(() => verifyAustralianPlan(local), /pinned source changed/);
      fs.writeFileSync(file, bytes);
      verifyAustralianPlan(local);
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});

test("test-only writer refuses a mismatched nonlocal postgres client", async () => {
  const remote = postgres("postgres://postgres@db.example.invalid:5432/tuji_au_test", { max: 1 });
  try {
    assert.throws(() => createAustralianTestDatabaseAdapter(remote, "postgres://postgres@127.0.0.1:5432/tuji_au_test"), /restricted to the isolated test database/);
  } finally { await remote.end(); }
});

test("planner CLI never accepts apply or upload flags", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-australian-plan.ts", "--apply"], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported argument --apply/);
});

test("SELECT-only preflight detects ID, alias and Japanese collisions", { skip: !available || !process.env.AU_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.AU_TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/tuji_au_test", "integration test must use an isolated database");
  const sql = postgres(url.toString(), { max: 1 });
  try {
    await sql`CREATE TEMP TABLE words (id TEXT PRIMARY KEY, word TEXT NOT NULL, status TEXT NOT NULL, also_known_as TEXT[] NOT NULL DEFAULT '{}')`;
    await sql`CREATE TEMP TABLE word_terms (word_id TEXT, language TEXT, term TEXT)`;
    const plan = prepareAustralianPlan(source!, reserved!, root);
    const [first, second, third] = plan.headwords;
    await sql`INSERT INTO words (id, word, status, also_known_as) VALUES
      (${first.id}, 'other', 'draft', '{}'), ('existing-english', 'unrelated', 'published', ${[second.en.toUpperCase()]}), ('existing-ja', 'another', 'published', '{}')`;
    await sql`INSERT INTO word_terms (word_id, language, term) VALUES ('existing-ja', 'ja', ${third.ja})`;
    const before = await sql`SELECT * FROM words ORDER BY id`;
    const result = await preflightAustralianDatabase(sql, plan);
    const after = await sql`SELECT * FROM words ORDER BY id`;
    assert.equal(result.readyForGuardedApply, false);
    assert.equal(result.idCollisions.length, 1);
    assert.equal(result.englishCollisions.length, 1);
    assert.equal(result.japaneseCollisions.length, 1);
    assert.deepEqual(after, before, "preflight cannot mutate rows");
  } finally { await sql.end(); }
});
