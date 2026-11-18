import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextResponse } from "next/server";
import { publicJson, readLang } from "../lib/cache-headers";
const src=ts.createSourceFile("route.ts",fs.readFileSync(new URL("../app/api/categories/route.ts",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true);
const decl=src.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==="GET");assert(decl);
const js=ts.transpileModule(decl.getText(src).replace(/^export\s+/,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function route(active:boolean,fail=false){
 let direction:string|undefined;const deps={NextResponse,publicJson,readLang,regionalCatalogueActive:active,localizeTopicPresets:()=>[],getCategoriesFromDb:async(_lang:string,d:string|undefined)=>{direction=d;if(fail)throw Error("unavailable");return [{id:"mug"}]}};
 return {GET:new Function(...Object.keys(deps),`${js}\nreturn GET`)(...Object.values(deps)),direction:()=>direction};
}
test("active category route is no-store and propagates direction",async()=>{
 const h=route(true),request=new Request("https://test.invalid/api/categories?lang=zh-Hant&learning=zh-en"),res=await h.GET(request);
 assert.equal(h.direction(),"zh-en");assert.equal(res.status,200);assert.equal(res.headers.get("cache-control"),"no-store");assert.equal(res.headers.get("vercel-cdn-cache-control"),"no-store");
 const cached=await h.GET(new Request(request,{headers:{"if-none-match":res.headers.get("etag")!}}));assert.equal(cached.status,304);assert.equal(cached.headers.get("cache-control"),"no-store");
});
test("legacy category request stays unscoped and database errors do not cache",async()=>{
 const h=route(false),res=await h.GET(new Request("https://test.invalid/api/categories?lang=ja"));assert.equal(h.direction(),undefined);assert.match(res.headers.get("cache-control")!,/max-age=60/);
 const broken=await route(true,true).GET(new Request("https://test.invalid/api/categories?learning=zh-en"));assert.equal(broken.status,503);assert.equal(broken.headers.get("cache-control"),"no-store");assert.equal(broken.headers.get("vercel-cdn-cache-control"),"no-store");
});
