// Bind the individually authored editorial judgments to exact local snapshots.
// This is a format converter, not an automatic semantic judge.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const series='collecting-hobbies';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const {entries}=read(`data/${series}-series-2026-10.json`);
const notes=read(`data/${series}-editorial-notes-2026-10.json`);
const spans=read(`data/example-spans-${series}-2026-10.json`);
if(notes.entries.length!==entries.length||new Set(notes.entries.map(n=>n.wordId)).size!==entries.length)throw Error('Editorial coverage mismatch');
const reviews=[];
for(const entry of entries){
 const note=notes.entries.find(n=>n.wordId===entry.id);
 if(!note?.wordReason?.trim()||note.exampleReasons?.length!==2||note.exampleReasons.some(r=>!r.trim()))throw Error(`${entry.id}: missing individual evidence`);
 reviews.push({kind:'word',wordId:entry.id,verdict:'pass',reason:note.wordReason,sourceSha256:hash(entry)});
 for(const[slot,example]of entry.examples.entries())reviews.push({kind:'example',wordId:entry.id,slot,verdict:'pass',reason:note.exampleReasons[slot],sourceSha256:hash({example,englishSpans:spans.en[example.en],japaneseSpans:spans.ja[example.ja]})});
}
fs.writeFileSync(`data/${series}-semantic-review-2026-10.json`,JSON.stringify({schemaVersion:1,series,reviewer:notes.reviewer,scope:'Every candidate headword, both examples, and all English/Japanese lexical spans; individual reasons in authored editorial notes.',references:notes.references,entries:reviews},null,2)+'\n');
console.log({boundIndividualJudgments:reviews.length});
