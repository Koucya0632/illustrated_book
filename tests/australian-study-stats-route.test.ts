import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextResponse } from "next/server";
import { resolveDirectionThemeScope } from "../lib/study-sources";
import { applyMembershipStudyScope } from "../lib/study-membership";

const file=ts.createSourceFile("route.ts",fs.readFileSync(new URL("../app/api/study/stats/route.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
const declaration=file.statements.find((s)=>ts.isFunctionDeclaration(s)&&s.name?.text==="GET");assert(declaration);
const javascript=ts.transpileModule(declaration.getText(file).replace(/^export\s+/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function route(tier:"free"|"pro") {
 const calls:string[]=[]; const row=(due:number)=>({total:10,seen:2,due,new:8,todayNew:1,byStatus:[]});
 const deps={NextResponse,resolveDirectionThemeScope,applyMembershipStudyScope,
  getCurrentUserIdFast:async()=>"user",getSettings:async()=>({learningDirection:"zh-ja"}),
  readLearningDirection:()=>"zh-ja",getMembershipAccess:async()=>({policy:"v2",tier}),readTimezone:()=>"UTC",
  studyDeckFor:()=>"image-ja",targetLanguageFor:()=>"ja",getLockedAtlasItemIds:async()=>[],
  studyStats:async(_u:string,c:string[])=>{calls.push(`public:${c.join(',')}`);return row(2)},
  atlasStudyStats:async()=>{calls.push("custom");return row(3)},
  savedCommunityStats:async()=>{calls.push("community-stats");return {total:4,seen:2}},
  savedCommunityDueCount:async()=>{calls.push("community-due");return 4},
  savedCommunityNewCount:async()=>{calls.push("community-new");return 2},performance};
 const GET=new Function(...Object.keys(deps),`${javascript}\nreturn GET`)(...Object.values(deps));return {GET,calls};
}
test("stats preserve global review without widening regional-only new learning",async()=>{
 const x=route("pro"),response=await x.GET(new Request("https://test.invalid/api/study/stats?category=australia-housing&learning=zh-ja"));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.stats.new,0);assert.equal(body.stats.due,9);assert.deepEqual(x.calls.sort(),["community-due","custom","public:"].sort());
});
test("stats apply membership and count opted-in community separately",async()=>{
 const x=route("free"),response=await x.GET(new Request("https://test.invalid/api/study/stats?category=australia-housing,community&learning=zh-ja"));
 const body=await response.json();assert.equal(body.stats.new,0);assert.equal(body.stats.due,2);assert(!x.calls.includes("custom")&&!x.calls.includes("community-due")&&!x.calls.includes("community-stats"));
 const y=route("pro"),result=await y.GET(new Request("https://test.invalid/api/study/stats?category=australia-housing,community&learning=zh-ja"));const payload=await result.json();assert.deepEqual(payload.communityStats,{total:4,seen:2});assert.equal(payload.stats.due,9);assert.equal(payload.stats.new,2);assert.equal(payload.stats.total,4);assert.equal(payload.stats.seen,2);
});
