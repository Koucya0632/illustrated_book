import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import candidate from '../data/festivals-series-2026-10.json';
import review from '../data/festivals-semantic-review-2026-10.json';
import { categories, publicFallbackCategories, getCategory } from '../lib/categories';
import { words, publicFallbackWords, getWord, getWordsByCategory, searchWords } from '../lib/words';
import { MAIN_WORD_FESTIVALS_IDS } from '../lib/main-word-festivals-2026-10';
import { loadExampleSpanCorpus, validateAuthoredSentence } from '../lib/example-span-corpus';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const compile=(s:string)=>ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});

test('all festivals words and the category stay out of public fallbacks and synchronous helpers',()=>{
 const ids=new Set(MAIN_WORD_FESTIVALS_IDS);
 assert.equal(ids.size,candidate.entries.length);
 assert.ok(ids.size>0);
 assert.equal(words.filter(w=>ids.has(w.id)).length,ids.size);
 assert.equal(categories.filter(c=>c.id==='festivals').length,1);
 assert.equal(publicFallbackCategories.some(c=>c.id==='festivals'),false);
 assert.equal(getCategory('festivals'),undefined);
 assert.equal(publicFallbackWords.some(w=>ids.has(w.id)||w.category==='festivals'),false);
 assert.deepEqual(getWordsByCategory('festivals'),[]);
 for(const id of ids){assert.equal(getWord(id),undefined);assert.equal(searchWords(id).some(w=>ids.has(w.id)),false);}
});

test('all headword readings, examples and contextual annotations match their individually reviewed snapshots',()=>{
 const corpus=loadExampleSpanCorpus();
 assert.equal(review.entries.length,candidate.entries.length*3);
 const keys=review.entries.map(r=>`${r.kind}:${r.wordId}:${'slot'in r?r.slot:''}`);
 assert.equal(new Set(keys).size,keys.length);
 for(const entry of candidate.entries){
  assert.equal(entry.examples.length,2,entry.id);
  assert.deepEqual(entry.examples.map(e=>e.cefrLevel),['A2','B1']);
  assert.notEqual(entry.examples[0].en,entry.examples[1].en);
  assert.ok(entry.pronunciation&&entry.chineseDefinition&&entry.ja&&entry.jaReading);
  if(entry.jaReadingSegments){assert.equal(entry.jaReadingSegments.map(s=>s.text).join(''),entry.ja);assert.equal(entry.jaReadingSegments.map(s=>s.ruby??s.text).join(''),entry.jaReading);}
  const wr=review.entries.find(r=>r.kind==='word'&&r.wordId===entry.id)!;
  assert.equal(wr.verdict,'pass');assert.ok(wr.reason);assert.equal(wr.sourceSha256,hash(entry));
  for(const[slot,example]of entry.examples.entries()){
   for(const language of ['en','ja']as const)assert.deepEqual(validateAuthoredSentence(language,example[language],corpus[language][example[language]]),[],`${entry.id}:${slot}:${language}`);
   const er=review.entries.find(r=>r.kind==='example'&&r.wordId===entry.id&&'slot'in r&&r.slot===slot)!;
   assert.equal(er.verdict,'pass');assert.ok(er.reason);
   assert.equal(er.sourceSha256,hash({example,englishSpans:corpus.en[example.en],japaneseSpans:corpus.ja[example.ja]}));
  }
 }
});

// Exercise the actual routine migration guard without importing/running its production main().
const migration=read('scripts/migrate.ts');
const guardStart=migration.indexOf('async function readGuardedSeriesPublicationState(');
const guardEnd=migration.indexOf('// eslint-disable-next-line',guardStart+1);
const guardSource=migration.slice(guardStart,guardEnd);
const seedStart=migration.indexOf('async function seedCategoriesIntoDb(');
const seedEnd=migration.indexOf('\nasync function ',seedStart+1);
const seedSource=migration.slice(seedStart,seedEnd);
const makeMigration=new Function('GUARDED_PUBLISH_SERIES','GUARDED_PUBLISH_WORD_IDS','seedCategories',compile(`${guardSource}\n${seedSource}\nreturn {readGuardedSeriesPublicationState,seedCategoriesIntoDb};`));

test('ordinary category seeding refuses absent, draft, partial and wrong-category festivals sets',async()=>{
 assert.match(migration,/\{ category: "festivals", ids: MAIN_WORD_FESTIVALS_IDS \}/);
 assert.match(migration,/GUARDED_PUBLISH_WORD_IDS\.has\(word\.id\)/);
 assert.match(migration,/publishedWordIds\.delete\(id\)/);
 const series=[{category:'festivals',ids:MAIN_WORD_FESTIVALS_IDS}];
 const api=makeMigration(series,new Set(MAIN_WORD_FESTIVALS_IDS),[{id:'festivals',name:'Restaurant'},{id:'office',name:'Office'}]);
 const rows=MAIN_WORD_FESTIVALS_IDS.map(id=>({id,category:'festivals',status:'published',deleted_at:null}));
 for(const input of [[],rows.map(r=>({...r,status:'draft'})),rows.slice(1),rows.map((r,i)=>i? r:{...r,category:'office'}),rows.map((r,i)=>i? r:{...r,deleted_at:'2026-10-19'}),rows]){
  const writes:string[]=[];
  const sql=async(parts:TemplateStringsArray,...values:unknown[])=>{
   const query=parts.join('?');
   if(query.includes('SELECT id, category FROM words'))return input.filter((r:any)=>r.status==='published'&&!r.deleted_at);
   if(query.includes('INSERT INTO categories'))writes.push(String(values[0]));
   if(query.includes('count(*)::int AS c'))return [{c:2}];
   return [];
  };
  await api.seedCategoriesIntoDb(sql);
  assert.equal(writes.includes('office'),true);
  assert.equal(writes.includes('festivals'),input===rows);
 }
});

test('database absence, database error and an empty category query all use the guarded fallback',async()=>{
 const source=read('lib/categories-db.ts').replace(/^import .*;\n/gm,'').replace('export async function','async function');
 const create=new Function('getSql','staticCategories','localizeCategory','MAIN_WORD_FESTIVALS_IDS','MAIN_WORD_RESTAURANT_IDS','MAIN_WORD_CONCERT_FAN_SUPPORT_IDS','MAIN_WORD_STATION_COMMUTING_IDS',compile(`${source}\nreturn getCategoriesFromDb;`));
 for(const getSql of [()=>null,()=>async()=>{throw Error('offline');},()=>async()=>[]]){
  const load=create(getSql,publicFallbackCategories,(v:unknown)=>v,MAIN_WORD_FESTIVALS_IDS,[],[],[]);
  const result=await load();
  assert.equal(result.some((c:{id:string})=>c.id==='festivals'),false);
  assert.ok(result.length>0);
 }
 // Healthy DB reads must also enforce complete published membership, beyond the migration guard.
 assert.match(source,/c\.id <> 'festivals' OR NOT EXISTS/);
 assert.match(source,/w\.status = 'published'/);
 assert.match(source,/w\.deleted_at IS NULL/);
});

test('the publisher defaults to read-only and stages verified immutable media before its database transaction',()=>{
 const publisher=read('scripts/publish-festivals-series.ts');
 assert.match(publisher,/const APPLY = process\.argv\.includes\("--apply"\)/);
 assert.match(publisher,/sql\.begin\("read only"/);
 const dry=publisher.indexOf('if (!APPLY) {');
 const confirmation=publisher.indexOf('assertWriteConfirmation(hostFingerprint, storageTargetFingerprint)',dry);
 assert.ok(dry>0&&confirmation>dry);
 const stage=publisher.lastIndexOf('await stageStorage(manifestFile, manifest)');
 const verify=publisher.indexOf('await verifyAllRemoteObjects(manifest.storageObjects)',stage);
 const transaction=publisher.indexOf('await sql.begin',verify);
 assert.ok(stage>confirmation&&verify>stage&&transaction>verify);
 assert.match(publisher,/requireAbsent: true/);
 assert.match(publisher,/unfinished publication exists/);
 assert.match(publisher,/image_source_url, image_license, image_credit, cefr_level/);
 assert.match(publisher,/cefr_level: item\.word\.cefrLevel/);
 assert.match(publisher,/japaneseConflicts.length === 0/);
 assert.match(publisher,/rolled-back-storage-retained/);
 assert.doesNotMatch(publisher,/removePublicObjects/);
});

test('the actual ordinary word seed refuses every planned ID and the whole category before any child write',async()=>{
 const start=migration.indexOf('async function seedV2(');
 const end=migration.indexOf('\n// eslint-disable-next-line',start+1);
 const guardStart=migration.indexOf('const isGuardedPublishWord =');
 const guardEnd=migration.indexOf('\n\n',guardStart);
 const create=new Function('GUARDED_PUBLISH_SERIES','GUARDED_PUBLISH_WORD_IDS','seedWords',compile(`${migration.slice(guardStart,guardEnd)}\n${migration.slice(start,end)}\nreturn seedV2;`));
 const ids=new Set(MAIN_WORD_FESTIVALS_IDS);
 const seed=create([{category:'festivals',ids:[...ids]}],ids,[]);
 const calls:Array<{query:string;values:unknown[]}>=[];
 const sql=async(parts:TemplateStringsArray,...values:unknown[])=>{calls.push({query:parts.join('?'),values});return [];};
 const guarded=candidate.entries.map(e=>({...e,category:'office'}));
 await seed(sql,[...guarded,{...candidate.entries[0],id:'future-series-entry'}]);
 assert.equal(calls.length,0);
 await seed(sql,[{id:'allowed-existing-category',word:'control',category:'office',definitions:[],examples:[],relations:[]}]);
 assert.equal(calls.length,1);
 assert.match(calls[0].query,/INSERT INTO words/);
 assert.equal(calls[0].values[0],'allowed-existing-category');
});
