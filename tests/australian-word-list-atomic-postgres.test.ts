import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import postgres from "postgres";
import { australianRentalGate } from "../lib/catalogue/australian-rental-gate";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../lib/australian-categories";
const url=process.env.AU_TEST_DATABASE_URL;
test("word-list insert rechecks a complete rental batch atomically and keeps existing entries",{skip:!url},async()=>{
 const parsed=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(parsed.hostname));assert.equal(parsed.pathname,"/tuji_au_test");
 const sql=postgres(url!,{max:1}), listId="00000000-0000-4000-8000-000000000001";
 const source=ts.createSourceFile("db.ts",fs.readFileSync(new URL("../lib/word-lists/db.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
 const node=source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==="addWordToList");assert(node);
 const js=ts.transpileModule(node.getText(source).replace(/^export\s+/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const add=new Function("requireSql","hiddenAustralianIds","australianRentalGate","AUSTRALIAN_RENTAL_WORDS",`${js}\nreturn addWordToList`)(()=>sql,()=>[],australianRentalGate,AUSTRALIAN_RENTAL_WORDS);
 try {
  await sql`CREATE TEMP TABLE words (id text PRIMARY KEY, category text, status text, deleted_at timestamptz)`;
  await sql`CREATE TEMP TABLE user_word_lists (id uuid PRIMARY KEY, updated_at timestamptz)`;
  await sql`CREATE TEMP TABLE user_word_list_items (list_id uuid, word_id text, UNIQUE(list_id,word_id))`;
  await sql`INSERT INTO user_word_lists VALUES (${listId}::uuid,now())`;
  for(const id of AUSTRALIAN_RENTAL_WORDS)await sql`INSERT INTO words VALUES (${id},${AUSTRALIAN_RENTAL_CATEGORY},'published',null)`;
  const list={id:listId,targetLanguage:"en"}; const first=AUSTRALIAN_RENTAL_WORDS[0],last=AUSTRALIAN_RENTAL_WORDS.at(-1)!;
  await sql`UPDATE words SET status='draft' WHERE id=${last}`;
  assert.deepEqual(await add("fixture",list,first,()=>null),{unknownWord:true});
  assert.equal((await sql`SELECT * FROM user_word_list_items`).length,0);
  await sql`UPDATE words SET status='published' WHERE id=${last}`;
  assert.deepEqual(await add("fixture",list,first,()=>null),{ok:true});
  await sql`UPDATE words SET status='draft' WHERE id=${last}`;
  assert.deepEqual(await add("fixture",list,first,()=>null),{ok:true});
  assert.equal((await sql`SELECT * FROM user_word_list_items`).length,1);
 }finally{await sql.end()}
});
