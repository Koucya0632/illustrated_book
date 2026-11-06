import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import candidates from "../data/winter-food-2026-10.json";
import {primaryChinese, type Word} from "../types";
import {targetLanguageFor, type LearningDirection, type UiLang} from "../lib/settings";
import {localizeWord, localizeSpans, type LocalizedTextMap} from "../lib/word-localize";
import {spansCoverSentence, unlinkSelfReference} from "../lib/example-spans";
import {canStudyCard} from "../lib/study-membership";

// Invoke the real DB-row adapter and detail projection with a local DB-shaped
// fixture, so note language selection is checked without loading Next/DB.
const text=fs.readFileSync(new URL("../lib/data.ts",import.meta.url),"utf8");
const ast=ts.createSourceFile("data.ts",text,ts.ScriptTarget.Latest,true);
function actualFunctions(names:string[]){
 const found=ast.statements.filter((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&!!n.name&&names.includes(n.name.text));
 assert.equal(found.length,names.length);
 return ts.transpileModule(found.map(n=>n.getText(ast).replace(/^export\s+/,"")).join("\n"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
}
const rowToWord=new Function("primaryChinese",actualFunctions(["parseJsonbColumn","rowToWord"])+"\nreturn rowToWord;")(primaryChinese) as (row:unknown)=>{word:Word;localizedTexts:LocalizedTextMap};
const terms=candidates.entries.flatMap(e=>[
 {word_id:e.id,language:"en",term:e.word,pronunciation:e.pronunciation,reading:null,reading_segments:null},
 {word_id:e.id,language:"ja",term:e.ja,pronunciation:e.jaReading,reading:e.jaReading,reading_segments:e.jaReadingSegments},
]);
const raw=candidates.entries.map(e=>rowToWord({id:e.id,word:e.word,category:e.category,part_of_speech:e.partOfSpeech,pronunciation:e.pronunciation,image_url:`https://example.invalid/${e.id}.webp`,also_known_as:[],collocations:[],forms:[],note:e.note,chinese_definition:e.chineseDefinition,definitions:e.definitions.map(d=>({...d,sort_order:d.sortOrder})),examples:e.examples.map((x,i)=>({id:`${e.id}:${i}`,sentence:x.en,cefr_level:x.cefrLevel,sort_order:i,translations:{ja:x.ja,zh:x.zh}})),localized_texts:{"note|en":e.localizedNotes.en,"note|ja":e.localizedNotes.ja},audio_by_locale:{},relations:[],tags:[]}));
const getLearningWord=new Function("getAllRawEntries","jaGlossTermMap","localizeWord","targetLanguageFor","targetTermMap","spansForSentences","spansCoverSentence","localizeSpans","unlinkSelfReference",actualFunctions(["getLearningWord"])+"\nreturn getLearningWord;")(
 async()=>raw,async()=>new Map(terms.filter(t=>t.language==="ja").map(t=>[t.word_id,t])),localizeWord,targetLanguageFor,
 async(direction:LearningDirection)=>new Map(terms.filter(t=>t.language===targetLanguageFor(direction)).map(t=>[t.word_id,t])),
 async()=>new Map(),spansCoverSentence,localizeSpans,unlinkSelfReference,
) as (id:string,lang:UiLang,direction:LearningDirection)=>Promise<Word>;
for(const entry of candidates.entries)for(const lang of ["zh-Hant","en","ja"] as const)for(const direction of ["zh-en","zh-ja"] as const){
 test(`actual detail note projection ${entry.id}/${lang}/${direction}`,async()=>{
  const detail=await getLearningWord(entry.id,lang,direction);
  assert.equal(detail.note,lang==="zh-Hant"?entry.note:entry.localizedNotes[lang]);
  assert.equal(detail.word,direction==="zh-ja"?entry.ja:entry.word);
  assert.equal(detail.category,"convenience-store");
  assert.equal(canStudyCard({policy:"v2",tier:"free"},{source:"public",category:detail.category}),true);
 });
}
