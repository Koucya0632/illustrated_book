import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import candidate from '../data/airport-series-2026-10.json';
import review from '../data/airport-semantic-review-2026-10.json';
import { categories, publicFallbackCategories, getCategory } from '../lib/categories';
import { words, publicFallbackWords, getWord, getWordsByCategory, searchWords } from '../lib/words';
import { releaseWordIds } from '../lib/catalogue/releases';
import { loadExampleSpanCorpus, validateAuthoredSentence } from '../lib/example-span-corpus';
const MAIN_WORD_AIRPORT_IDS = releaseWordIds('airport-2026-10');
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const compile=(s:string)=>ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});

test('all airport words and the category stay out of public fallbacks and synchronous helpers',()=>{
 const ids=new Set(MAIN_WORD_AIRPORT_IDS);
 assert.equal(ids.size,candidate.entries.length);
 assert.ok(ids.size>0);
 assert.equal(words.filter(w=>ids.has(w.id)).length,ids.size);
 assert.equal(categories.filter(c=>c.id==='airport').length,1);
 assert.equal(publicFallbackCategories.some(c=>c.id==='airport'),false);
 assert.equal(getCategory('airport'),undefined);
 assert.equal(publicFallbackWords.some(w=>ids.has(w.id)||w.category==='airport'),false);
 assert.deepEqual(getWordsByCategory('airport'),[]);
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
  if (/^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+$/u.test(entry.ja)) {
   assert.equal(entry.jaReading,entry.ja,`${entry.id}: kana keeps its written form`);
   assert.ok(entry.jaReadingSegments.every(segment=>segment.ruby===null));
  }
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


test('the ordinary async word loader hides the series when DB is absent or fails',async()=>{
 const source=read('lib/data.ts');
 assert.match(source,/publicFallbackWords as staticWords/);
 assert.match(source,/WHERE w\.deleted_at IS NULL AND w\.status = 'published'/);
 const start=source.indexOf('async function getAllRawEntries(');
 const end=source.indexOf('\n}',start)+2;
 const makeLoader=new Function('dbEnabled','fetchAllFromDb','staticWords','console',compile(`${source.slice(start,end)}\nreturn getAllRawEntries;`));
 for(const enabled of [false,true]){
  const load=makeLoader(()=>enabled,async()=>{throw Error('simulated DB outage');},publicFallbackWords,{warn:()=>{}});
  const result=await load();
  assert.ok(result.length>0);
  assert.equal(result.some((r:any)=>r.word.category==='airport'||MAIN_WORD_AIRPORT_IDS.includes(r.word.id)),false);
 }
});

test('the publisher defaults to read-only and stages verified immutable media before its database transaction',()=>{
 const publisher=read('scripts/publish-airport-series.ts');
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

