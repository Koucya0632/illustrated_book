import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import postgres from "postgres";
import { australianRentalGate } from "../lib/catalogue/australian-rental-gate";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS } from "../lib/australian-categories";
const url=process.env.AU_TEST_DATABASE_URL;
test("real search applies DB batch gate and legacy exclusions before limit",{skip:!url},async()=>{
 const u=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname));assert.equal(u.pathname,"/tuji_au_test");const sql=postgres(url!,{max:1});
 const source=ts.createSourceFile("data.ts",fs.readFileSync(new URL("../lib/data.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
 const node=source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==="searchCardWordsAsync");assert(node);const js=ts.transpileModule(node.getText(source).replace(/^export\s+/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const words=[{id:"common",word:"rent receipt",chinese:""},...AUSTRALIAN_RENTAL_WORDS.map(id=>({id,word:"rent "+id,chinese:""}))];
 const deps={getAllCardWords:async()=>words,dbEnabled:()=>true,getSql:()=>sql,inMemoryMatchCard:()=>{throw Error("unexpected fallback")},australianVariant:()=>undefined,escapeLike:(x:string)=>x,australianRentalGate};
 const search=new Function(...Object.keys(deps),`${js}\nreturn searchCardWordsAsync`)(...Object.values(deps));
 try{
  await sql`CREATE TEMP TABLE words(id text PRIMARY KEY,word text,category text,status text,deleted_at timestamptz,also_known_as text[])`;
  await sql`CREATE TEMP TABLE word_terms(word_id text,term text,reading text)`;
  await sql`CREATE TEMP TABLE word_definitions(word_id text,definition text)`;
  await sql`INSERT INTO words VALUES ('common','rent receipt','office','published',null,ARRAY[]::text[])`;
  for(const id of AUSTRALIAN_RENTAL_WORDS)await sql`INSERT INTO words VALUES (${id},${"rent "+id},${AUSTRALIAN_RENTAL_CATEGORY},'published',null,ARRAY[]::text[])`;
  await sql`UPDATE words SET status='draft' WHERE id=${AUSTRALIAN_RENTAL_WORDS[0]}`;
  assert.deepEqual((await search('rent',{limit:1},'zh-Hant','zh-en')).map((x:{id:string})=>x.id),['common']);
  await sql`UPDATE words SET status='published' WHERE id=${AUSTRALIAN_RENTAL_WORDS[0]}`;
  assert.deepEqual((await search('rent',{limit:1,excludeIds:AUSTRALIAN_RENTAL_WORDS},'zh-Hant','zh-en')).map((x:{id:string})=>x.id),['common']);
 }finally{await sql.end()}
});
