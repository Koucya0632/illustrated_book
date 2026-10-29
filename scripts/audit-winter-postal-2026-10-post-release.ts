// Independent SELECT-only post-release audit. Never imports publisher main/apply/rollback.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
import ts from 'typescript';
import sharp from 'sharp';
import {SPANS_VERSION} from '../lib/example-spans';
import {publicObjectUrl} from '../lib/storage/public-objects';

async function main(){
const ROOT=process.cwd(), DIR=path.join(ROOT,'output/winter-postal-2026-10/post-release-review');
const PLAN_SHA='4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea';
const sha=(x:Buffer|string)=>createHash('sha256').update(x).digest('hex');
const read=(p:string)=>fs.readFileSync(path.resolve(ROOT,p));
const json=(p:string)=>JSON.parse(read(p).toString());
const insist=(v:unknown,m:string)=>{if(!v)throw Error(m)};
const write=(name:string,v:unknown)=>fs.writeFileSync(path.join(DIR,name),JSON.stringify(v,null,2)+'\n');
const planFile=`output/winter-postal-2026-10/publish-plan-${PLAN_SHA}.json`,planBytes=read(planFile),plan=JSON.parse(planBytes.toString());
insist(sha(planBytes)===PLAN_SHA,'sealed plan hash mismatch');
const publisherText=read(plan.sources.publisher.file).toString();
insist(sha(publisherText)===plan.sources.publisher.sha256,'publisher source changed');
// Extract only the previously reviewed comparison functions. Remove row locks,
// then enforce SELECT-only tagged SQL inside a database READ ONLY transaction.
const wanted=['sameValue','canonical','assertRowSet','expectedCategory','assertStoredContentMatchesPlan'];
const ast=ts.createSourceFile('publisher.ts',publisherText,ts.ScriptTarget.Latest,true);
const selected=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name&&wanted.includes(n.name.text));
insist(selected.length===wanted.length,'comparison function extraction failed');
const comparisonSource=selected.map(n=>n.getText(ast)).join('\n').replace(/\bFOR UPDATE(?: OF [a-z]+)?\b/g,'');
const comparisonJS=ts.transpileModule(comparisonSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const compare=new Function('publicObjectUrl','SPANS_VERSION',comparisonJS+'\nreturn assertStoredContentMatchesPlan;')(publicObjectUrl,SPANS_VERSION);
fs.mkdirSync(DIR,{recursive:true});
if(process.argv.includes('--prepare-only')){
  write('readiness.json',{planFile,planSha256:PLAN_SHA,publisherSha256:plan.sources.publisher.sha256,comparatorFunctions:wanted,sqlPolicy:'SELECT-only reader inside READ ONLY transaction; no publisher main/apply/rollback import',remoteObjects:plan.summary.storageObjects,status:'ready; waiting for applied manifest'});
  console.log('Prepared independent read-only audit; no database/API/Storage request performed.');
  process.exit(0);
}
const index=process.argv.indexOf('--manifest');
insist(index>=0&&process.argv[index+1],'--manifest is required');
const manifestFile=process.argv[index+1],manifestBytes=read(manifestFile),manifest=JSON.parse(manifestBytes.toString());
insist(manifest.status==='applied'&&manifest.planSha256===PLAN_SHA,'wait for applied manifest bound to this plan');
for(const s of Object.values(plan.sources) as {file:string;sha256:string}[])insist(sha(read(s.file))===s.sha256,`sealed source changed: ${s.file}`);
const correctionIndex=process.argv.indexOf('--correction-plan');
let correction:any=null;
if(correctionIndex>=0){
 const correctionFile=process.argv[correctionIndex+1],bytes=read(correctionFile),c=JSON.parse(bytes.toString());
 insist(sha(bytes)==='745ad740a5d986a4af64da616ccd127b21757f1521118774b07f727398b773d2'&&c.sources.releasePlan.sha256===PLAN_SHA,'unexpected correction plan');
 for(const s of Object.values(c.sources) as {file:string;sha256:string}[])insist(sha(read(s.file))===s.sha256,`correction source changed: ${s.file}`);
 const journal=json(`output/winter-postal-2026-10/correction-v2/correction-apply-${sha(bytes)}.json`);
 insist(journal.status==='applied'&&journal.planSha256===sha(bytes),'wait for applied correction journal');
 const v2=json(c.sources.v2Spans.file);
 for(const e of plan.entries)for(const ex of e.examples)ex.spans={en:v2.en[ex.en],ja:v2.ja[ex.ja]};
 correction={file:correctionFile,sha256:sha(bytes),sidecarSha256:c.sources.v2Spans.sha256,journalStatus:journal.status,scope:c.scope};
}
const issues:any[]=[], observations:any={planFile,planSha256:PLAN_SHA,manifestFile,manifestSha256:sha(manifestBytes),startedAt:new Date().toISOString(),productionWrites:0};
if(correction)observations.correctionOverlay=correction;
const dbEvidenceName=correction?'database-exact-v2-overlay.json':'database-exact.json';
const keepHeaders=(h:Headers)=>Object.fromEntries(['age','cache-control','content-length','content-type','etag','last-modified','server','cf-cache-status','cf-ray','x-vercel-cache','x-nextjs-cache','date'].flatMap(k=>h.has(k)?[[k,h.get(k)]]:[]));
if(!process.argv.includes('--http-only')){
const sql=postgres(process.env.DATABASE_URL!,{ssl:'require',prepare:false,max:1});
try{
 const snapshot=await sql.begin('isolation level repeatable read read only',async tx=>{
  const queries:string[]=[];
  const reader=(parts:TemplateStringsArray,...values:any[])=>{
   const statement=parts.join('?');insist(/^\s*SELECT\b/i.test(statement)&&! /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|nextval)\b/i.test(statement),'non-SELECT statement refused');
   queries.push(statement);return tx(parts,...values);
  };
  await compare(reader,plan,manifest.resolvedExampleIds,manifest,'published');
  const ids=plan.entries.map((e:any)=>e.word.id);
  const words=await tx`SELECT id,word,category,status,image_url FROM words WHERE id=ANY(${ids}) ORDER BY id`;
  const media=await tx`SELECT word_id,kind,locale,url,storage_path,mime_type,model FROM word_media WHERE word_id=ANY(${ids}) ORDER BY word_id,kind,locale`;
  const examples=await tx`SELECT id::text,word_id,sentence,sort_order,cefr_level FROM word_examples WHERE word_id=ANY(${ids}) ORDER BY word_id,sort_order`;
  const exampleMedia=await tx`SELECT m.example_id::text,m.locale,m.url,m.storage_path,m.mime_type,m.model FROM word_example_media m JOIN word_examples e ON e.id=m.example_id WHERE e.word_id=ANY(${ids}) ORDER BY m.example_id,m.locale`;
  return {status:'pass',transactionReadOnly:true,exactComparatorQueryCount:queries.length,queries,words,media,examples,exampleMedia};
 });
 write(dbEvidenceName,{...snapshot,...(correction?{correctionOverlay:correction}: {})});observations.database='passed';
}catch(e){observations.database='failed';issues.push({layer:'database',message:String(e)});}finally{await sql.end();}

const audioCheckerPath='/Users/rex/.codex/skills/audit-tuji-atlas/scripts/check-word-audio-contract.mjs';
const {inspectMp3Bytes}=await import(audioCheckerPath);
const objects:any[]=[];
if(!process.argv.includes('--reuse-remote')){
for(let i=0;i<manifest.storageObjects.length;i+=5){
 await Promise.all(manifest.storageObjects.slice(i,i+5).map(async(o:any)=>{
  try{
   const response=await fetch(o.url,{cache:'no-store',signal:AbortSignal.timeout(25000)}),bytes=Buffer.from(await response.arrayBuffer());
   insist(response.ok,`${o.key}: HTTP ${response.status}`);
   const mime=response.headers.get('content-type')?.split(';')[0].toLowerCase().trim();insist(mime===o.mimeType,`${o.key}: MIME ${mime}`);
   insist(bytes.length===o.bytes&&sha(bytes)===o.contentSha256,`${o.key}: remote bytes mismatch`);
   let decoded:any;
   if(o.bucket==='word-images'){const m=await sharp(bytes).metadata();insist(m.format==='webp'&&(m.width??0)>=768&&(m.height??0)>=768,'invalid image');decoded={format:m.format,width:m.width,height:m.height};}
   else{decoded=inspectMp3Bytes(bytes);insist(decoded.valid&&decoded.frames>0,'invalid MP3 frame sequence');}
   const name=`remote-${sha(o.key).slice(0,16)}.${o.bucket==='word-images'?'webp':'mp3'}`;fs.writeFileSync(path.join(DIR,name),bytes);
   objects.push({key:o.key,url:o.url,status:'pass',bytes:bytes.length,sha256:sha(bytes),headers:keepHeaders(response.headers),decoded,savedFile:name});
  }catch(e){objects.push({key:o.key,status:'failed',message:String(e)});issues.push({layer:'remote-object',key:o.key,message:String(e)});}
 }));
}
write('remote-objects.json',{expected:plan.summary.storageObjects,checked:objects.length,objects});
observations.remoteMedia=objects.length===plan.summary.storageObjects&&objects.every(o=>o.status==='pass')?'passed':'failed';
}else{
 const media=JSON.parse(fs.readFileSync(path.join(DIR,'remote-objects.json'),'utf8'));
 for(const o of manifest.storageObjects)insist(media.objects.some((r:any)=>r.key===o.key&&r.status==='pass'&&r.sha256===o.contentSha256&&r.bytes===o.bytes),'prior media evidence mismatch');
 observations.remoteMedia='passed';observations.remoteEvidenceReuse='Previous complete remote byte audit retained; correction changes no audio/image text, row, URL or bytes.';
}
}else{
 const db=JSON.parse(fs.readFileSync(path.join(DIR,dbEvidenceName),'utf8'));
 const media=JSON.parse(fs.readFileSync(path.join(DIR,'remote-objects.json'),'utf8'));
 insist(db.status==='pass'&&media.objects.length===manifest.storageObjects.length,'prior DB/media evidence incomplete');
 for(const o of manifest.storageObjects)insist(media.objects.some((r:any)=>r.key===o.key&&r.status==='pass'&&r.sha256===o.contentSha256&&r.bytes===o.bytes),'prior remote bytes evidence does not match applied manifest');
 observations.database='passed';observations.remoteMedia='passed';observations.reusedEvidence='Prior exact DB comparator and all-object remote evidence; this run only rechecks HTTP/cache and local canonical state.';
}

const baseIndex=process.argv.indexOf('--base-url');
const probes:any[]=[],base=baseIndex>=0?process.argv[baseIndex+1]:'https://tuji.nexflow.team',token=Date.now().toString();
insist(['https://tuji.nexflow.team','https://everyday-english-picture-dictionary.vercel.app'].includes(base),'unexpected audit host');
observations.baseUrl=base;
async function get(url:URL,label:string){
 const response=await fetch(url,{signal:AbortSignal.timeout(25000)}),text=await response.text();
 const entry:any={label,url:String(url),status:response.status,headers:keepHeaders(response.headers),bodySha256:sha(text)};
 if(response.headers.get('content-type')?.includes('json'))try{entry.payload=JSON.parse(text);}catch{}
 else entry.text=text;
 probes.push(entry);return entry;
}
function cardShape(w:any){for(const k of ['id','word','chinese','imageUrl','category','pronunciation'])insist(typeof w[k]==='string'&&w[k],`CardWord ${w.id}: missing ${k}`);if(w.readingSegments!=null)insist(Array.isArray(w.readingSegments),'CardWord readingSegments not array');if(w.audioUrls!=null)insist(typeof w.audioUrls==='object'&&!Array.isArray(w.audioUrls)&&Object.values(w.audioUrls).every(v=>typeof v==='string'),'invalid audioUrls');}
for(const learning of ['zh-en','zh-ja'])for(const bust of [false,true]){
 const suffix=bust?'cache-busting':'ordinary';
 try{
  const url=new URL('/api/words',base);url.searchParams.set('lang','zh-Hant');url.searchParams.set('learning',learning);if(bust)url.searchParams.set('review',token);
  const p=await get(url,`words-${learning}-${suffix}`);insist(p.status===200&&Array.isArray(p.payload?.words)&&p.payload.total===p.payload.words.length,'invalid word list/total');
  for(const entry of plan.entries){const w=p.payload.words.find((x:any)=>x.id===entry.word.id);insist(w,`${entry.word.id} missing from ${learning}/${suffix}`);cardShape(w);insist(w.word===(learning==='zh-ja'?entry.word.ja:entry.word.word),'headword projection mismatch');insist(w.imageUrl===entry.image.url,'image projection mismatch');
   const wanted=learning==='zh-ja'?['ja-JP']:['en-US','en-GB'];insist(JSON.stringify(Object.keys(w.audioUrls??{}).sort())===JSON.stringify(wanted.sort()),'audio locale projection mismatch');for(const locale of wanted){const a=entry.headwordAudio.find((x:any)=>x.locale===locale);insist(w.audioUrls[locale]===publicObjectUrl(a.bucket,a.storagePath),'headword audio URL mismatch');}
   if(learning==='zh-ja'){insist(w.reading===entry.word.jaReading,'reading mismatch');const normalized=(segments:any[])=>segments.map(s=>[s.text,s.ruby??null]);insist(JSON.stringify(normalized(w.readingSegments))===JSON.stringify(normalized(entry.word.jaReadingSegments)),'reading segments mismatch');}
  }
 }catch(e){issues.push({layer:'word-api',learning,probe:suffix,message:String(e)});}
 for(const entry of plan.entries){
  try{
   const url=new URL(`/api/words/${entry.word.id}`,base);url.searchParams.set('lang','zh-Hant');url.searchParams.set('learning',learning);if(bust)url.searchParams.set('review',token);
   const p=await get(url,`detail-${entry.word.id}-${learning}-${suffix}`),w=p.payload;insist(p.status===200&&w?.id===entry.word.id,'detail missing');
   insist(w.word===(learning==='zh-ja'?entry.word.ja:entry.word.word),'detail headword mismatch');insist(w.imageUrl===entry.image.url,'detail image mismatch');insist(w.examples?.length===2,'detail example count mismatch');
   for(let i=0;i<2;i++){const live=w.examples[i],wanted=entry.examples[i];insist(live.target===(learning==='zh-ja'?wanted.ja:wanted.en),'detail displayed sentence mismatch');insist(live.zh===wanted.zh,'detail Chinese mismatch');insist(Array.isArray(live.spans)&&live.spans.map((x:any)=>x.text??x.t).join('')===live.target,'detail spans missing or stale');
    const expected=wanted.spans[learning==='zh-ja'?'ja':'en'];insist(live.spans.length===expected.length,'detail span count mismatch');
    for(let j=0;j<expected.length;j++){const actual=live.spans[j],e=expected[j];insist(actual.text===e.t&&(actual.gloss??null)===(e.z??null)&&(actual.reading??null)===(e.r??null),'detail span/gloss/reading differs from exact reviewed overlay');}
    if(correction&&entry.word.id==='new-years-postcard'&&i===0&&learning==='zh-ja'){const k=live.spans[3];insist(k.text==='ください'&&!k.gloss&&!k.reading&&!k.pronunciation&&!k.wordId,'kudasai remains tappable after correction');}
   }
  }catch(e){issues.push({layer:'detail-api',wordId:entry.word.id,learning,probe:suffix,message:String(e)});}
 }
}
for(const bust of [false,true]){
 try{const u=new URL('/api/categories?lang=zh-Hant',base);if(bust)u.searchParams.set('review',token);const p=await get(u,`categories-${bust?'cache-busting':'ordinary'}`);const rows=Array.isArray(p.payload)?p.payload:p.payload?.categories;insist(p.status===200&&Array.isArray(rows)&&rows.some((x:any)=>x.id==='postal-services'),'postal category missing');}
 catch(e){issues.push({layer:'category-api',message:String(e)});}
 for(const pathname of ['/category/postal-services',...plan.entries.map((e:any)=>`/word/${e.word.id}`)]){
  try{const u=new URL(pathname,base);if(bust)u.searchParams.set('review',token);const p=await get(u,`page-${pathname}-${bust?'cache-busting':'ordinary'}`);insist(p.status===200,'page HTTP failure');}
  catch(e){issues.push({layer:'page-route',path:pathname,message:String(e)});}
 }
}
// Save full evidence separately; summary never calls unreviewed catalog layers healthy.
write('http-probes.json',{probes});
write(`http-probes-${new URL(base).hostname}.json`,{probes});
observations.api=issues.some(i=>['word-api','detail-api','category-api','page-route'].includes(i.layer))?'failed':'passed';
observations.canonicalMapping=plan.entries.every((e:any)=>json('lib/image-urls.json')[e.word.id]===e.image.url)?'passed':'pending-local-post-publication-integration';
observations.semanticReview='reused exact source-bound individual review only if database exact comparator passed';
observations.subjectiveAudioListening='not checked';
observations.finishedAt=new Date().toISOString();observations.issues=issues;observations.status=issues.length?'failed':'passed';
write('summary.json',observations);console.log(JSON.stringify(observations,null,2));
write(`summary-${new URL(base).hostname}.json`,observations);
if(issues.length)process.exitCode=1;
}
main().catch(e=>{console.error(String(e));process.exitCode=1;});
