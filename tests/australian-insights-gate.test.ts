import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextResponse } from "next/server";
import { AUSTRALIAN_RENTAL_WORDS, legacyRentalWordVisible } from "../lib/australian-categories";

const src=ts.createSourceFile("route.ts",fs.readFileSync(new URL("../app/api/words/[id]/insights/route.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
const decl=src.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==="GET");assert(decl);
const js=ts.transpileModule(decl.getText(src).replace(/^export\s+/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function handler(ready:boolean|"error",policy:"v1"|"v2"="v2") {
 let reads=0;const deps={NextResponse,AUSTRALIAN_RENTAL_WORDS,legacyRentalWordVisible,headers:{"Cache-Control":"private, no-store"},
  membershipPolicy:()=>policy,readLang:()=>"zh-Hant",readLearningDirection:()=>"zh-en",visibleInDirection:()=>true,getSql:()=>({}),
  australianRentalBatchReady:async()=>{if(ready==="error")throw Error("unavailable");return ready},
  readStoredWordInsights:async()=>{reads++;return null},getCurrentUserId:async()=>null,getMembershipAccess:async()=>({tier:"free"}),presentWordInsights:()=>null};
 return {GET:new Function(...Object.keys(deps),`${js}\nreturn GET`)(...Object.values(deps)),readCount:()=>reads};
}
test("insights refuse incomplete, unscoped and unavailable rental batches",async()=>{
 const request=new Request("https://example.test/api/words/rental-bond/insights?learning=zh-en"),params={params:Promise.resolve({id:"rental-bond"})};
 const unavailable=handler("error");assert.equal((await unavailable.GET(request,params)).status,503);assert.equal(unavailable.readCount(),0);
 const incomplete=handler(false);assert.equal((await incomplete.GET(request,params)).status,404);assert.equal(incomplete.readCount(),0);
 const complete=handler(true);assert.equal((await complete.GET(request,params)).status,200);assert.equal(complete.readCount(),1);
 const legacy=handler(true);assert.equal((await legacy.GET(new Request("https://example.test/api/words/rental-bond/insights"),params)).status,404);assert.equal(legacy.readCount(),0);
});


test("policy v1 returns unavailable without exposing content or accessing it",async()=>{
 const x=handler(true,"v1"),res=await x.GET(new Request("https://example.test/api/words/rental-bond/insights?learning=zh-en"),{params:Promise.resolve({id:"rental-bond"})});
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{available:false,insights:null});assert.equal(x.readCount(),0);
});
