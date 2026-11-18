import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import postgres from "postgres";
import ts from "typescript";
import { installAustralianAnswerRetention, verifyAustralianAnswerRetention } from "../lib/catalogue/australian-answer-retention";
import { schedule, humanizeInterval } from "../lib/srs";
import { applyAnswer, masteryLevel } from "../lib/mastery";
import { hintDefinition } from "../lib/study-hint";
import reservedIds from "../data/australian-only-word-ids.json";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../lib/australian-categories";
import { canStudyCard, FREE_STUDY_CATEGORIES } from "../lib/study-membership";

const url = process.env.AU_TEST_DATABASE_URL;
const user = "00000000-0000-4000-8000-000000000001";

// Execute the actual route and DB functions, with authentication/cache and
// unrelated branches stubbed; the SQL, SRS and response bodies are real.
function loadFunctions(path: string, names: string[], dependencies: Record<string, unknown>) {
  const file = ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const parts = names.map((name) => {
    const node = file.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
    assert.ok(node, `${path}: missing ${name}`);
    return node.getText(file).replace(/^export\s+/, "");
  });
  const js = ts.transpileModule(parts.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn {${names.join(",")}}`)(...Object.values(dependencies));
}

test("withdrawn Australian cards accept old-client answers and identities survive rollback", { skip: !url }, async () => {
  const parsed = new URL(url!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
  assert.equal(parsed.pathname, "/tuji_au_test");
  const sql = postgres(url!, { max: 1 });
  const schema = `answer_retention_${process.pid}_${Date.now()}`;
  try {
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    await sql.unsafe(`SET search_path TO ${schema}`);
    await sql.unsafe(`
      CREATE TABLE words (id text PRIMARY KEY, word text, category text, status text, deleted_at timestamptz,
        chinese_definition text, image_url text, pronunciation text);
      CREATE TABLE cards (id bigint PRIMARY KEY, word_id text REFERENCES words(id) ON DELETE CASCADE,
        card_type text, front text, back text, explanation text, tags text[], deck_key text);
      CREATE TABLE user_cards (user_id uuid, card_id bigint REFERENCES cards(id) ON DELETE CASCADE,
        status text, interval_days numeric, next_review_at timestamptz, review_count int, mistake_count int,
        last_rating text, last_reviewed_at timestamptz, updated_at timestamptz, PRIMARY KEY(user_id, card_id));
      CREATE TABLE user_words (user_id uuid, word_id text REFERENCES words(id) ON DELETE CASCADE,
        target_language text, mastery numeric, last_reviewed_at timestamptz, review_count int, updated_at timestamptz,
        PRIMARY KEY(user_id,word_id,target_language));
      CREATE TABLE word_terms (word_id text, language text, term text, pronunciation text, reading text, reading_segments jsonb);
      CREATE TABLE word_definitions (word_id text, language text, definition text, sort_order int);
      CREATE TABLE study_logs (user_id uuid, word_id text, target_language text, activity text, rating int,
        is_correct boolean, response_ms int, interval_before numeric, interval_after numeric, ease_before numeric,
        ease_after numeric, mastery_before numeric, mastery_after numeric, client_session_id text, metadata jsonb);
    `);
    const verify = () => sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      return verifyAustralianAnswerRetention(tx, schema);
    });
    assert.equal((await verify()).length, 2);
    await installAustralianAnswerRetention(sql);
    await installAustralianAnswerRetention(sql); // repeated deployments are safe
    assert.deepEqual(await verify(), []);
    await sql`ALTER TABLE cards DISABLE TRIGGER australian_card_identity_retention`;
    assert.match((await verify()).join(" "), /australian_card_identity_retention/);
    await sql`ALTER TABLE cards ENABLE TRIGGER australian_card_identity_retention`;
    await sql`CREATE OR REPLACE FUNCTION preserve_australian_word_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`;
    assert.match((await verify()).join(" "), /australian_word_identity_retention/);
    await installAustralianAnswerRetention(sql);
    assert.deepEqual(await verify(), []);
    await sql`INSERT INTO words VALUES ('rental-bond','bond','australia-housing','published',null,'deposit','image','bond'),('mug','mug','kitchen','published',null,'cup','image','mug')`;
    await sql`INSERT INTO cards VALUES (10,'rental-bond','回想卡','front','back',null,'{}','image-en'),(11,'mug','回想卡','front','back',null,'{}','image-en')`;
    await sql`UPDATE words SET status='archived', deleted_at=now() WHERE id='rental-bond'`;
    await assert.rejects(sql`DELETE FROM words WHERE id='rental-bond'`, /archive instead/);
    await assert.rejects(sql`UPDATE words SET id='changed-bond' WHERE id='rental-bond'`, /identity cannot be changed/);
    await assert.rejects(sql`DELETE FROM cards WHERE id=10`, /archive the word/);
    await assert.rejects(sql`UPDATE cards SET id=12 WHERE id=10`, /identity cannot be changed/);
    await assert.rejects(sql`UPDATE cards SET word_id='mug' WHERE id=10`, /identity cannot be changed/);
    await assert.rejects(sql`UPDATE cards SET deck_key='image-ja' WHERE id=10`, /identity cannot be changed/);
    await assert.rejects(sql`UPDATE words SET category='bedroom' WHERE id='rental-bond'`, /category is retained/);
    for (const [index, id] of reservedIds.filter((id) => id !== "rental-bond").entries()) {
      await sql`INSERT INTO words VALUES (${id},${id},'test','draft',null,'','','')`;
      await sql`INSERT INTO cards VALUES (${100 + index},${id},'回想卡','front','back',null,'{}','image-en')`;
      await assert.rejects(sql`DELETE FROM words WHERE id=${id}`, /archive instead/);
      await assert.rejects(sql`DELETE FROM cards WHERE id=${100 + index}`, /archive the word/);
      if ((AUSTRALIAN_RENTAL_WORDS as readonly string[]).includes(id)) {
        await sql`UPDATE words SET category=${AUSTRALIAN_RENTAL_CATEGORY} WHERE id=${id}`;
        await assert.rejects(sql`UPDATE words SET category='bedroom' WHERE id=${id}`, /category is retained/);
      }
    }
    await sql`DELETE FROM cards WHERE id=11`;
    await sql`DELETE FROM words WHERE id='mug'`;
    // A failed rollback transaction may not partially hide or delete the batch.
    await assert.rejects(sql.begin(async (tx) => {
      await tx`UPDATE words SET status='published', deleted_at=null WHERE id='rental-bond'`;
      await tx`DELETE FROM cards WHERE id=10`;
    }));
    assert.equal((await sql`SELECT status FROM words WHERE id='rental-bond'`)[0].status, "archived");

    const db = { requireSql: () => sql, hintDefinition };
    const cards = loadFunctions("lib/cards-db.ts", ["getCardById", "upsertReview"], db);
    const users = loadFunctions("lib/users-db.ts", ["upsertMastery", "insertStudyLog"], db);
    // Use the integrated membership module and its real category constants;
    // only the account's tier/policy is a test fixture.
    assert.equal(AUSTRALIAN_RENTAL_CATEGORY, "australia-housing");
    assert.ok(FREE_STUDY_CATEGORIES.includes(AUSTRALIAN_RENTAL_CATEGORY));
    const freeAccess = { policy: "v2", tier: "free" } as const;
    assert.equal(canStudyCard(freeAccess, { source: "public", category: AUSTRALIAN_RENTAL_CATEGORY, wordId: "rental-bond" }), true);
    for (const id of AUSTRALIAN_RENTAL_WORDS) {
      assert.equal(canStudyCard(freeAccess, { source: "public", category: AUSTRALIAN_RENTAL_CATEGORY, wordId: id }), true);
    }
    assert.equal(canStudyCard(freeAccess, { source: "public", category: "kitchen", wordId: "not-a-free-spot" }), false);
    const route = loadFunctions("app/api/study/answer/route.ts",
      ["defaultActivity", "invalidUuid", "clampReplayCount", "listeningMetadata", "clampResponseMs", "computeReview", "answerResponse", "POST"],
      {
        ...cards, ...users, schedule, humanizeInterval, applyAnswer, masteryLevel,
        VALID_RATINGS: ["重來", "困難", "穩定", "熟練"],
        RATING_TO_SMALLINT: { 重來: 0, 困難: 1, 穩定: 2, 熟練: 3 },
        NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
        getCurrentUserIdFast: async () => user,
        studyAnswerOwnerMatches: (owner: string | undefined, id: string) => !owner || owner === id,
        getMembershipAccess: async () => freeAccess, canStudyCard,
        getStreakMilestoneFacts: async () => ({}), crossedStreakMilestone: () => null,
        readTimezone: () => "Asia/Taipei", revalidateTag: () => {},
      });
    const request = () => new Request("http://local/api/study/answer", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "10", rating: "穩定", sessionId: "old-device-session" }),
    });
    const response = await route.POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal((await sql`SELECT review_count FROM user_cards WHERE card_id=10`)[0].review_count, 1);
    assert.equal((await sql`SELECT review_count FROM user_words WHERE word_id='rental-bond'`)[0].review_count, 1);
    assert.equal((await sql`SELECT count(*)::int AS n FROM study_logs`)[0].n, 1);
    await sql`INSERT INTO words VALUES ('paid-fixture','paid','kitchen','published',null,'paid','image','paid')`;
    await sql`INSERT INTO cards VALUES (20,'paid-fixture','回想卡','front','back',null,'{}','image-en')`;
    const paidRequest = new Request("http://local/api/study/answer", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "20", rating: "穩定" }),
    });
    const paidResponse = await route.POST(paidRequest);
    assert.equal(paidResponse.status, 200);
    assert.deepEqual(await paidResponse.json(), { ok: false, gated: "membership_required" });
    assert.equal((await sql`SELECT count(*)::int AS n FROM user_cards WHERE card_id=20`)[0].n, 0);
    const wrongOwner = new Request("http://local/api/study/answer", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "10", rating: "穩定", ownerUserId: "00000000-0000-4000-8000-000000000002" }),
    });
    assert.equal((await route.POST(wrongOwner)).status, 403);
    assert.equal((await sql`SELECT review_count FROM user_cards WHERE card_id=10`)[0].review_count, 1);
    // Old clients have no per-answer ID. Two identical requests are ambiguous;
    // recording this behavior prevents an unsafe claim of idempotent replay.
    assert.equal((await (await route.POST(request())).json()).ok, true);
    assert.equal((await sql`SELECT review_count FROM user_cards WHERE card_id=10`)[0].review_count, 2);
    assert.equal((await sql`SELECT count(*)::int AS n FROM study_logs`)[0].n, 2);
    await sql`UPDATE words SET status='published', deleted_at=null WHERE id='rental-bond'`;
    assert.equal((await sql`SELECT review_count FROM user_cards WHERE card_id=10`)[0].review_count, 2);
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.end();
  }
});
