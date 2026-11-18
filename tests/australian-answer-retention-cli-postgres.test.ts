import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import postgres from "postgres";
import { installAustralianAnswerRetention } from "../lib/catalogue/australian-answer-retention";

const url = process.env.AU_RETENTION_CLI_TEST_DATABASE_URL;

test("read-only target verification fails closed for missing, changed, disabled and wrong target guards", { skip: !url }, async () => {
  const parsed = new URL(url!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
  assert.equal(parsed.pathname, "/tuji_au_retention_cli_test");
  const sql = postgres(url!, { max: 1 });
  let createdFixture = false;
  const run = (override: Record<string, string> = {}) => spawnSync(process.execPath,
    ["--import", "tsx", "scripts/verify-australian-answer-retention.ts"], {
      encoding: "utf8", env: { ...process.env, AU_RETENTION_VERIFY_DATABASE_URL: url!,
        AU_RETENTION_EXPECTED_HOST: parsed.hostname, AU_RETENTION_EXPECTED_DATABASE: "tuji_au_retention_cli_test", ...override },
    });
  try {
    const [existing] = await sql`SELECT to_regclass('public.words') AS words, to_regclass('public.cards') AS cards,
      to_regprocedure('public.preserve_australian_card_identity()') AS card_fn,
      to_regprocedure('public.preserve_australian_word_identity()') AS word_fn`;
    assert.equal(existing.words, null); assert.equal(existing.cards, null);
    assert.equal(existing.card_fn, null); assert.equal(existing.word_fn, null);
    createdFixture = true;
    await sql`CREATE TABLE public.words(id text primary key, category text)`;
    await sql`CREATE TABLE public.cards(id bigint primary key, word_id text, deck_key text)`;
    assert.equal(run().status, 1);
    assert.equal(run({ AU_RETENTION_EXPECTED_HOST: "wrong-host" }).status, 1);
    assert.equal(run({ AU_RETENTION_EXPECTED_DATABASE: "wrong-database" }).status, 1);
    assert.equal(run({ AU_RETENTION_EXPECTED_HOST: "" }).status, 1);
    assert.equal(run({ AU_RETENTION_VERIFY_DATABASE_URL: "" }).status, 1);
    await installAustralianAnswerRetention(sql);
    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /verified/);
    await sql`ALTER TABLE public.words DISABLE TRIGGER australian_word_identity_retention`;
    assert.equal(run().status, 1);
    await sql`ALTER TABLE public.words ENABLE TRIGGER australian_word_identity_retention`;
    await sql`DROP TRIGGER australian_word_identity_retention ON public.words`;
    await sql`CREATE TRIGGER australian_word_identity_retention BEFORE DELETE ON public.words FOR EACH ROW EXECUTE FUNCTION public.preserve_australian_word_identity()`;
    assert.equal(run().status, 1);
    await installAustralianAnswerRetention(sql);
    const [wordFunction] = await sql`SELECT prosrc FROM pg_proc WHERE oid = 'public.preserve_australian_word_identity()'::regprocedure`;
    const alteredBody = String(wordFunction.prosrc).replaceAll("'rental-bond'", "'changed-bond'");
    assert.notEqual(alteredBody, wordFunction.prosrc);
    await sql.unsafe(`CREATE OR REPLACE FUNCTION public.preserve_australian_word_identity() RETURNS trigger LANGUAGE plpgsql AS $$${alteredBody}$$`);
    assert.equal(run().status, 1);
    await installAustralianAnswerRetention(sql);
    await sql`CREATE OR REPLACE FUNCTION public.preserve_australian_card_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`;
    assert.equal(run().status, 1);
    await installAustralianAnswerRetention(sql);
    assert.equal(run().status, 0);
  } finally {
    if (createdFixture) {
      await sql`DROP TABLE IF EXISTS public.cards, public.words CASCADE`;
      await sql`DROP FUNCTION IF EXISTS public.preserve_australian_card_identity(), public.preserve_australian_word_identity()`;
    }
    await sql.end();
  }
});
