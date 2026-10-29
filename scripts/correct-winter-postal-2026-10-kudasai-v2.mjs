// Local preparation / SELECT-only by default. Production apply belongs to the
// coordinating agent after explicit authorization and independent review.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import postgres from 'postgres';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'output/winter-postal-2026-10/correction-v2');
const IDS=['new-years-postcard','mourning-postcard'];
const EXAMPLE_IDS=['3707','3708','3709','3710'];
const SENTENCE='年賀はがきを十枚ください。';
const ORIGINAL_SPANS='data/example-spans-winter-postal-2026-10.json';
const V2_SPANS='data/example-spans-winter-postal-2026-10-v2.json';
const RELEASE_PLAN='output/winter-postal-2026-10/publish-plan-4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea.json';
const RELEASE_MANIFEST='output/winter-postal-2026-10/apply-manifest-2026-10-29T08-51-06-358Z.json';
const sha=x=>createHash('sha256').update(x).digest('hex');
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canon(v)])):x;
const equal=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
const insist=(x,m)=>{if(!x)throw new Error(m);};
const read=p=>fs.readFileSync(path.resolve(ROOT,p));
const json=p=>JSON.parse(read(p));
const atomic=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const target=s=>s.sentence_language==='ja'&&s.sentence===SENTENCE&&s.sort_order===3;

export function deriveAfter(before){
  const after=structuredClone(before);
  const rows=after.spans.filter(target);
  insist(rows.length===1&&rows[0].text==='ください'&&rows[0].reading==='ください','Expected old kudasai span missing or changed');
  insist(rows[0].base_form===null&&rows[0].part_of_speech===null&&rows[0].word_id===null,'Unexpected old lexical metadata');
  const glosses=after.glosses.filter(target);
  insist(equal(glosses.map(g=>[g.language,g.gloss]).sort(),[['en','please give me'],['ja','ください'],['zh-Hant','請給我']]),'Expected old three-language glosses differ');
  rows[0].reading=null;rows[0].base_form=null;rows[0].part_of_speech=null;rows[0].word_id=null;
  after.glosses=after.glosses.filter(g=>!target(g));
  return after;
}
export function snapshotState(actual,plan){
  if(equal(actual,plan.before))return 'before';
  if(equal(actual,plan.after))return 'after';
  throw new Error('compare-and-swap refused: word/example/sentence/span/gloss/media snapshot drift');
}

async function snapshot(tx){
  const release=json(RELEASE_PLAN);
  const ens=release.entries.flatMap(e=>e.examples.map(x=>x.en));
  const jas=release.entries.flatMap(e=>e.examples.map(x=>x.ja));
  const rows=async q=>(await q).map(x=>x.row);
  return {
    words:await rows(tx`SELECT to_jsonb(w) AS row FROM words w WHERE id=ANY(${IDS}) ORDER BY id`),
    terms:await rows(tx`SELECT to_jsonb(t) AS row FROM word_terms t WHERE word_id=ANY(${IDS}) ORDER BY word_id,language`),
    definitions:await rows(tx`SELECT to_jsonb(d) AS row FROM word_definitions d WHERE word_id=ANY(${IDS}) ORDER BY word_id,language,sort_order,id`),
    examples:await rows(tx`SELECT to_jsonb(e) AS row FROM word_examples e WHERE word_id=ANY(${IDS}) ORDER BY word_id,sort_order,id`),
    translations:await rows(tx`SELECT to_jsonb(t) AS row FROM word_example_translations t WHERE example_id=ANY(${EXAMPLE_IDS}) ORDER BY example_id,language`),
    spans:await rows(tx`SELECT to_jsonb(s) AS row FROM sentence_spans s WHERE (sentence_language='en' AND sentence=ANY(${ens})) OR (sentence_language='ja' AND sentence=ANY(${jas})) ORDER BY sentence_language,sentence,sort_order`),
    glosses:await rows(tx`SELECT to_jsonb(g) AS row FROM sentence_span_glosses g WHERE (sentence_language='en' AND sentence=ANY(${ens})) OR (sentence_language='ja' AND sentence=ANY(${jas})) ORDER BY sentence_language,sentence,sort_order,language`),
    wordMedia:await rows(tx`SELECT to_jsonb(m) AS row FROM word_media m WHERE word_id=ANY(${IDS}) ORDER BY id`),
    exampleMedia:await rows(tx`SELECT to_jsonb(m) AS row FROM word_example_media m WHERE example_id=ANY(${EXAMPLE_IDS}) ORDER BY example_id,locale`),
    sentenceOwners:await rows(tx`SELECT DISTINCT e.word_id,e.id::text AS example_id,e.sentence,to_jsonb(e) AS row FROM word_examples e LEFT JOIN word_example_translations t ON t.example_id=e.id WHERE e.sentence=ANY(${ens}) OR (t.language='ja' AND t.translation=ANY(${jas})) ORDER BY e.word_id,e.id::text`),
  };
}
function validateBefore(before){
  insist(before.words.length===2&&before.words.every(w=>IDS.includes(w.id)&&w.status==='published'&&w.deleted_at===null),'Only the two published main words allowed');
  insist(before.examples.length===4&&equal(before.examples.map(e=>String(e.id)).sort(),[...EXAMPLE_IDS].sort()),'Example owner/ID mismatch');
  const example=before.examples.find(e=>String(e.id)==='3707');
  insist(example.word_id==='new-years-postcard'&&example.sort_order===0&&example.sentence==="I'd like ten New Year's postcards.",'Target example identity mismatch');
  insist(before.translations.some(t=>String(t.example_id)==='3707'&&t.language==='ja'&&t.translation===SENTENCE),'Displayed target sentence changed');
  insist(before.sentenceOwners.every(e=>IDS.includes(e.word_id)),'Sentence shared outside batch; correction refused');
  insist(before.spans.filter(s=>s.sentence_language==='ja'&&s.sentence===SENTENCE).map(s=>s.text).join('')===SENTENCE,'Sentence reconstruction mismatch');
  deriveAfter(before);
}
function fileSource(file){return {file,sha256:sha(read(file))};}
export async function main(){
  const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const prepare=args.includes('--prepare'),apply=args.includes('--apply'),resume=args.includes('--resume');
  insist(!(prepare&&apply),'Do not combine --prepare and --apply');
  insist(!resume||apply,'--resume requires --apply');
  const databaseUrl=process.env.DATABASE_URL;insist(databaseUrl,'DATABASE_URL missing');
  const url=new URL(databaseUrl);
  const fingerprint=sha(`${url.protocol}//${url.username}@${url.hostname}:${url.port}/${url.pathname.replace(/^\//,'')}`).slice(0,12);
  const sql=postgres(databaseUrl,{ssl:'require',prepare:false,max:1});
  try{
    if(prepare){
      insist(sha(read(RELEASE_PLAN))==='4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea','Applied original plan changed');
      const manifest=json(RELEASE_MANIFEST);insist(manifest.status==='applied'&&manifest.databaseHostFingerprint===fingerprint,'Wrong release manifest/DB');
      const before=await sql.begin('isolation level repeatable read read only',snapshot);validateBefore(before);
      const original=json(ORIGINAL_SPANS),v2=structuredClone(original);
      insist(equal(v2.ja[SENTENCE][3],{t:'ください',z:'請給我',j:'ください',e:'please give me',r:'ください'}),'Original local span changed');
      v2.ja[SENTENCE][3]={t:'ください'};
      const v2Bytes=Buffer.from(JSON.stringify(v2,null,2)+'\n'),v2File=path.join(ROOT,V2_SPANS);
      if(fs.existsSync(v2File))insist(fs.readFileSync(v2File).equals(v2Bytes),'Refuse overwriting different v2 spans');else fs.writeFileSync(v2File,v2Bytes,{flag:'wx'});
      const plan={schemaVersion:1,kind:'winter-postal-kudasai-untap-v2',state:'prepared-awaiting-independent-review',productionWriteAllowed:false,databaseHostFingerprint:fingerprint,scope:{wordId:'new-years-postcard',exampleId:'3707',language:'ja',sentence:SENTENCE,sortOrder:3},sources:{releasePlan:fileSource(RELEASE_PLAN),releaseManifest:fileSource(RELEASE_MANIFEST),originalSpans:fileSource(ORIGINAL_SPANS),v2Spans:fileSource(V2_SPANS),tool:fileSource('scripts/correct-winter-postal-2026-10-kudasai-v2.mjs')},before,after:deriveAfter(before),expectedMutations:{deletedGlossRows:3,updatedSpanRows:1,changes:['target span reading: ください -> null','target span base_form/part_of_speech/word_id remain null','delete only the target en/ja/zh gloss rows'],unchanged:['displayed sentences','headwords','definitions','readings outside target span','other spans and glosses','word/example audio','images','example IDs','source v1 and applied release artifacts']},recovery:'Use this immutable full before/after snapshot and the deterministic apply journal to recover a lost acknowledgement. --resume checks before/after; unexpected drift refuses. Reversal is a separately authorized operation, never automatic.'};
      const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n'),filename=`correction-plan-${sha(bytes)}.json`;
      fs.mkdirSync(OUT,{recursive:true});const targetFile=path.join(OUT,filename);
      if(fs.existsSync(targetFile))insist(fs.readFileSync(targetFile).equals(bytes),'Immutable plan collision');else fs.writeFileSync(targetFile,bytes,{flag:'wx'});
      atomic(path.join(OUT,'latest-plan.json'),{file:filename,sha256:sha(bytes)});
      console.log(JSON.stringify({mode:'prepared-read-only',plan:filename,sha256:sha(bytes),databaseHostFingerprint:fingerprint,expectedMutations:plan.expectedMutations},null,2));return;
    }
    const pointer=json(path.relative(ROOT,path.join(OUT,'latest-plan.json')));
    const planFile=value('--plan')?path.resolve(ROOT,value('--plan')):path.join(OUT,pointer.file);
    const bytes=fs.readFileSync(planFile),plan=JSON.parse(bytes),planSha256=sha(bytes);
    insist(plan.kind==='winter-postal-kudasai-untap-v2'&&plan.productionWriteAllowed===false,'Wrong correction plan');
    insist(plan.databaseHostFingerprint===fingerprint,'Wrong logical DB');
    for(const s of Object.values(plan.sources))insist(sha(read(s.file))===s.sha256,`Source changed: ${s.file}`);
    validateBefore(plan.before);insist(equal(deriveAfter(plan.before),plan.after),'After snapshot is not the minimal untap change');
    if(!apply){const actual=await sql.begin('isolation level repeatable read read only',snapshot);const state=snapshotState(actual,plan);console.log(JSON.stringify({mode:'dry-run',plan:planFile,planSha256,databaseHostFingerprint:fingerprint,state,readyForApply:state==='before',beforeSha256:sha(JSON.stringify(canon(plan.before))),afterSha256:sha(JSON.stringify(canon(plan.after))),databaseWrites:0},null,2));return;}
    insist(value('--confirm-host')===fingerprint&&value('--confirm-plan')===planSha256,'Apply requires exact --confirm-host and --confirm-plan from fresh dry run');
    insist(value('--review'),'Apply requires --review independent report');
    const review=json(value('--review'));insist(review.status==='pass'&&review.planSha256===planSha256&&review.toolSha256===plan.sources.tool.sha256,'Independent review absent, incomplete or stale');
    const journalFile=path.join(OUT,`correction-apply-${planSha256}.json`);
    if(fs.existsSync(journalFile))insist(resume,'Existing apply journal requires --resume; do not start a second apply');
    let journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile)):{schemaVersion:1,planFile:path.relative(ROOT,planFile),planSha256,databaseHostFingerprint:fingerprint,createdAt:new Date().toISOString(),status:'prepared',before:plan.before,expectedAfter:plan.after};
    insist(journal.planSha256===planSha256&&journal.databaseHostFingerprint===fingerprint,'Resume identity mismatch');
    atomic(journalFile,journal);
    try{
      const result=await sql.begin('isolation level serializable',async tx=>{
        await tx.unsafe('LOCK TABLE words, word_terms, word_definitions, word_examples, word_example_translations, sentence_spans, sentence_span_glosses, word_media, word_example_media IN SHARE ROW EXCLUSIVE MODE');
        const current=await snapshot(tx),state=snapshotState(current,plan);
        if(state==='after')return {state:'already-applied',after:current,deletedGlossRows:0,updatedSpanRows:0};
        const deleted=await tx`DELETE FROM sentence_span_glosses WHERE sentence_language='ja' AND sentence=${SENTENCE} AND sort_order=3 AND language IN ('en','ja','zh-Hant') RETURNING *`;
        insist(deleted.length===3,'Expected exactly three target gloss deletions');
        const updated=await tx`UPDATE sentence_spans SET reading=NULL,base_form=NULL,part_of_speech=NULL,word_id=NULL WHERE sentence_language='ja' AND sentence=${SENTENCE} AND sort_order=3 AND text='ください' AND reading='ください' AND base_form IS NULL AND part_of_speech IS NULL AND word_id IS NULL RETURNING *`;
        insist(updated.length===1,'Expected exactly one old-value-matching target span update');
        const after=await snapshot(tx);insist(equal(after,plan.after),'Postcondition failed: non-target content changed');
        return {state:'applied',after,deletedGlossRows:deleted.length,updatedSpanRows:updated.length};
      });
      journal={...journal,status:'applied',updatedAt:new Date().toISOString(),result};atomic(journalFile,journal);
      console.log(JSON.stringify({status:journal.status,journal:path.relative(ROOT,journalFile),deletedGlossRows:result.deletedGlossRows,updatedSpanRows:result.updatedSpanRows},null,2));
    }catch(error){journal={...journal,status:'failed',updatedAt:new Date().toISOString(),failure:error.message};atomic(journalFile,journal);throw error;}
  }finally{await sql.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
