import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import postgres from "postgres";
import { australianRentalGate } from "../lib/catalogue/australian-rental-gate";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../lib/australian-categories";
const url=process.env.AU_TEST_DATABASE_URL;
test("mastery reads hide incomplete rental data without removing stored progress",{skip:!url},async()=>{
 const u=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname));assert.equal(u.pathname,"/tuji_au_test");const sql=postgres(url!,{max:1}),uid="00000000-0000-4000-8000-000000000001";
 const source=ts.createSourceFile("users-db.ts",fs.readFileSync(new URL("../lib/users-db.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
 const load=(name:string)=>{const node=source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);assert(node);const js=ts.transpileModule(node.getText(source).replace(/^export\s+/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;return new Function("requireSql","hiddenAustralianIds","australianRentalGate",`${js}\nreturn ${name}`)(()=>sql,()=>[],australianRentalGate)};
 try{
  await sql`CREATE TEMP TABLE words(id text PRIMARY KEY,category text,status text,deleted_at timestamptz)`;
  await sql`CREATE TEMP TABLE user_words(user_id uuid,word_id text,target_language text,mastery float8,last_reviewed_at timestamptz,review_count int)`;
  await sql`CREATE TEMP TABLE cards(id int,word_id text,deck_key text)`;
  await sql`CREATE TEMP TABLE user_cards(card_id int,user_id uuid,next_review_at timestamptz)`;
  await sql`INSERT INTO words VALUES ('mug','kitchen','published',null)`;
  for(const id of AUSTRALIAN_RENTAL_WORDS)await sql`INSERT INTO words VALUES (${id},${AUSTRALIAN_RENTAL_CATEGORY},'published',null)`;
  await sql`INSERT INTO user_words VALUES (${uid}::uuid,'mug','en',1,null,1),(${uid}::uuid,'rental-bond','en',2,null,1)`;
  await sql`UPDATE words SET status='draft' WHERE id=${AUSTRALIAN_RENTAL_WORDS[0]}`;
  for(const name of ["getAllMastery","getAllMasteryWithSchedule"])assert.deepEqual((await load(name)(uid,"en")).map((r:{word_id:string})=>r.word_id),["mug"]);
  assert.equal((await sql`SELECT * FROM user_words`).length,2);
  await sql`UPDATE words SET status='published' WHERE id=${AUSTRALIAN_RENTAL_WORDS[0]}`;
  for(const name of ["getAllMastery","getAllMasteryWithSchedule"])assert.equal((await load(name)(uid,"en")).length,2);
 }finally{await sql.end()}
});
