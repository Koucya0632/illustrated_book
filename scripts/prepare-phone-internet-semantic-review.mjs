// Convert individually authored review evidence into the guarded publisher schema.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const {entries}=read('data/phone-internet-series-2026-10.json');
const review=read('data/phone-internet-semantic-review-2026-10.json');
const spans=read('data/example-spans-phone-internet-2026-10.json');
const items=[];
if(review.entries.length!==entries.length*3)throw Error('review coverage mismatch');
for(const entry of entries){
 const word=review.entries.filter(r=>r.kind==='word'&&r.wordId===entry.id);
 if(word.length!==1||word[0].verdict!=='pass'||!word[0].reason||word[0].sourceSha256!==sha(entry))throw Error(`${entry.id}: stale or incomplete word review`);
 const headwords={en:entry.word,ja:entry.ja,zh:entry.chinese};
 items.push({id:entry.id,kind:'word',verdict:'pass',headwords,reason:word[0].reason,sourceSha256:sha({...headwords,reading:entry.jaReading,definitions:entry.definitions})});
 for(const[slot,example]of entry.examples.entries()){
  const r=review.entries.filter(r=>r.kind==='example'&&r.wordId===entry.id&&r.slot===slot);
  const source={example,englishSpans:spans.en[example.en],japaneseSpans:spans.ja[example.ja]};
  if(r.length!==1||r[0].verdict!=='pass'||!r[0].reason||r[0].sourceSha256!==sha(source))throw Error(`${entry.id}:${slot}: stale or incomplete example/spans review`);
  items.push({id:`${entry.id}:${slot}`,kind:'example',verdict:'pass',reason:r[0].reason,text:{en:example.en,ja:example.ja,zh:example.zh},cefrLevel:example.cefrLevel,sourceSha256:sha(source)});
 }
}
mkdirSync('output/phone-internet-publish-prep',{recursive:true});
writeFileSync('output/phone-internet-publish-prep/semantic-review.json',JSON.stringify({schemaVersion:1,series:'phone-internet',reviewer:review.reviewer,scope:review.scope,summary:{words:entries.length,examples:entries.length*2,passed:items.length,failed:0},items},null,2)+'\n');
console.log({reviewed:items.length});
