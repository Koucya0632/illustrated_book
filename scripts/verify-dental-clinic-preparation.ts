// Read-only production category probe and local payload/annotation verification.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import postgres from 'postgres';
import assert from 'node:assert/strict';
import candidate from '../data/dental-clinic-series-2026-10.json';
import editorial from '../data/dental-clinic-semantic-review-2026-10.json';
import corpus from '../data/example-spans-dental-clinic-2026-10.json';
import {words} from '../lib/words';
import {publicFallbackCategories} from '../lib/categories';
import {localizeCategory,localizeWord} from '../lib/word-localize';
import type {ExampleSpanCorpus} from '../lib/example-span-corpus';
const out='output/dental-clinic-preparation';
const compile=(s:string)=>ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
const read=(p:string)=>fs.readFileSync(p,'utf8');
const write=(p:string,v:unknown)=>fs.writeFileSync(`${out}/${p}`,JSON.stringify(v,null,2)+'\n');

async function main(){
 const checks=await import(pathToFileURL('/Users/rex/.codex/skills/audit-tuji-atlas/scripts/check-example-contract.mjs').href);
 const spanAudit=(language:'en'|'ja',text:string)=>{
  const spans=(corpus as ExampleSpanCorpus)[language][text];
  const glossed=spans.map(s=>'z'in s&&Boolean(s.z));
  return {spanCount:spans.length,glossedSpanCount:glossed.filter(Boolean).length,partialGlossCount:spans.filter((s:any)=>s.z&&(!s.j||!s.e)).length,missingReadingCount:spans.filter((s:any)=>language==='ja'&&s.z&&!s.r).length,unexpectedReadingCount:spans.filter((s:any)=>language==='en'&&s.r).length,reconstructed:spans.map(s=>s.t).join(''),texts:spans.map(s=>s.t),glossed,readings:spans.map((s:any)=>s.r??null),metaGlossCount:0};
 };
 const snapshot={scope:'LOCAL CANDIDATES; example IDs below are temporary candidate keys, not database IDs',words:candidate.entries.map(e=>({id:e.id,enTerm:e.word,jaTerm:e.ja,zhDefinition:e.chinese,examples:e.examples.map((ex,slot)=>({id:`candidate:${e.id}:${slot}`,sortOrder:slot,...ex,clickTranslations:{en:spanAudit('en',ex.en),ja:spanAudit('ja',ex.ja)}}))}))};
 const normalized=checks.normalizeWordsPayload(snapshot);
 const review=checks.createSemanticReviewTemplate(normalized);
 for(const w of review.words){
  const wr=editorial.entries.find(r=>r.kind==='word'&&r.wordId===w.id)!;
  w.pairVerdict=wr.verdict;w.pairReason=wr.reason;
  for(const ex of w.examples){const er=editorial.entries.find(r=>r.kind==='example'&&r.wordId===w.id&&'slot'in r&&r.slot===ex.sortOrder)!;ex.verdict=er.verdict;ex.reason=er.reason;}
 }
 const mechanical=checks.auditExampleWords(normalized,'local-candidate');
 const semantic=checks.auditSemanticReview(normalized,review);
 write('example-snapshot.json',snapshot);write('example-semantic-review.json',review);
 write('example-contract-check.json',{mechanical,semantic});
 assert.equal(mechanical.length,0,JSON.stringify(mechanical));
 assert.equal(semantic.issues.length,0,JSON.stringify(semantic));

 // Execute the actual category SQL with all current membership guards in a
 // READ ONLY transaction, rather than relying on a mock SQL implementation.
 const source=read('lib/categories-db.ts');
 const imports=[...source.matchAll(/import \{ (MAIN_WORD_[A-Z_]+_IDS) \} from "(.+)";/g)];
 const dependencies=await Promise.all(imports.map(async([,name,relative])=>{const module=await import(pathToFileURL(new URL(`../lib/${relative}.ts`,import.meta.url).pathname).href);return module[name];}));
 const create=new Function('getSql','staticCategories','localizeCategory',...imports.map(m=>m[1]),compile(source.replace(/^import .*;\n/gm,'').replace('export async function','async function')+'\nreturn getCategoriesFromDb;'));
 const sql=postgres(process.env.DATABASE_URL!,{ssl:'require',prepare:false,max:1});
 try{await sql.begin('read only',async tx=>{
  const load=create(()=>tx,publicFallbackCategories,localizeCategory,...dependencies);
  const categories=await load();
  assert.ok(categories.length>0);assert.equal(categories.some((c:any)=>c.id===candidate.series),false);
  write('category-query-probe.json',{checkedAt:new Date().toISOString(),transaction:'read only',query:'actual getCategoriesFromDb query',categoriesReturned:categories.length,newCategoryVisible:false,passed:true});
 });}finally{await sql.end();}

 // Exercise the current card projection function against reviewed local rows.
 // These are candidate API shapes, not production response evidence.
 const data=read('lib/data.ts');
 const start=data.indexOf('export async function getAllCardWords('),end=data.indexOf('\n}',start)+2;
 const plan=JSON.parse(read('output/dental-clinic-publish-prep/publish-plan.json'));
 const raw=candidate.entries.map(e=>({word:{...words.find(w=>w.id===e.id)!,audioUrls:Object.fromEntries(plan.entries.find((p:any)=>p.word.id===e.id).headwordAudio.map((a:any)=>[a.locale,`https://img.nexflow.team/word-audio/${a.storagePath}`]))}}));
 const terms=new Map(candidate.entries.map(e=>[e.id,{term:e.ja,reading:e.jaReading,reading_segments:e.jaReadingSegments}]));
 const makeCard=new Function('getAllRawEntries','targetLanguageFor','targetTermMap','jaGlossTermMap','localizeWord',compile(data.slice(start,end).replace('export async function','async function')+'\nreturn getAllCardWords;'));
 const load=makeCard(async()=>raw,(d:string)=>d==='zh-ja'?'ja':'en',async(d:string)=>d==='zh-ja'?terms:new Map(),async()=>null,localizeWord);
 const api=await import(pathToFileURL('/Users/rex/.codex/skills/audit-tuji-atlas/scripts/check-api-contract.mjs').href);
 for(const direction of ['zh-en','zh-ja']){
  const cards=await load('zh-Hant',direction),payload={words:cards,total:cards.length};
  const issues=api.auditWordsPayload(payload,'local-candidate');assert.equal(issues.length,0,JSON.stringify(issues));
  for(const c of cards)assert.deepEqual(Object.keys(c.audioUrls),direction==='zh-ja'?['ja-JP']:['en-US','en-GB']);
  write(`api-candidate-${direction}.json`,payload);write(`api-candidate-${direction}-check.json`,{scope:'local projection only; live API pending publication',words:cards.length,issues,passed:true});
 }
 console.log({localWords:candidate.entries.length,examples:candidate.entries.length*2,mechanicalIssues:mechanical.length,semanticIssues:semantic.issues.length,liveCategoryQuery:'read-only passed',localApiProjections:'both passed'});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
