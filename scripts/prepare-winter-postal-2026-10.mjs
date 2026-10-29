// Local preparation and SELECT-only probes; this module has no production writer.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
import sharp from 'sharp';
import {inspectMp3Bytes} from '/Users/rex/.codex/skills/audit-tuji-atlas/scripts/check-word-audio-contract.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'output/winter-postal-2026-10');
const args=new Set(process.argv.slice(2));
if([...args].some(a=>!['--check-db','--check-api','--finalize'].includes(a))) throw new Error('Only --check-db, --check-api and --finalize are supported; no apply command exists.');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p));
const write=(p,value)=>fs.writeFileSync(path.join(out,p),JSON.stringify(value,null,2)+'\n');
const insist=(condition,message)=>{if(!condition) throw new Error(message);};
fs.mkdirSync(out,{recursive:true});
const sourcePath='data/winter-postal-2026-10.json';
const spansPath='data/example-spans-winter-postal-2026-10.json';
const source=json(sourcePath), entries=source.entries, spans=json(spansPath);
const ids=entries.map(e=>e.id);
insist(entries.length>0 && new Set(ids).size===ids.length,'Nonempty unique IDs required');
const issues=[];
for(const lang of ['en','ja']) insist(Object.keys(spans[lang]).length===entries.length*2,`Unexpected ${lang} sentence span coverage`);
for(const e of entries){
  insist(e.category==='postal-services','Only existing postal-services expansion is allowed');
  insist(e.relatedWords.includes('postcard'),`${e.id}: missing related postcard`);
  insist(e.jaReadingSegments.map(s=>s.text).join('')===e.ja,`${e.id}: term segmentation`);
  insist(e.jaReadingSegments.map(s=>s.ruby??s.text).join('')===e.jaReading,`${e.id}: reading segmentation`);
  insist(e.examples.length===2 && /^(A1|A2)$/.test(e.examples[0].cefrLevel) && /^(B1|B2)$/.test(e.examples[1].cefrLevel),`${e.id}: example count or bands`);
  insist(e.examples[0].en!==e.examples[1].en && e.examples[0].ja!==e.examples[1].ja,`${e.id}: duplicate examples`);
  for(const ex of e.examples){
    insist(['en','ja','zh'].every(l=>typeof ex[l]==='string' && ex[l].trim()),`${e.id}: missing translation`);
    for(const lang of ['en','ja']){
      const parts=spans[lang][ex[lang]];
      insist(Array.isArray(parts) && parts.map(s=>s.t).join('')===ex[lang],`${e.id}/${lang}: spans reconstruct`);
      const taps=parts.filter(s=>s.z||s.j||s.e);
      insist(taps.length>=2 && taps.length<=8,`${e.id}/${lang}: tappable count ${taps.length}`);
      for(const s of taps){
        insist(['z','j','e'].every(k=>typeof s[k]==='string' && s[k].trim()),`${e.id}: incomplete gloss`);
        insist(s.t===s.t.trim() && !/^[\s\p{P}]+$/u.test(s.t),`${e.id}: tappable whitespace/punctuation`);
        if(lang==='ja') insist(typeof s.r==='string' && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(s.r),`${e.id}: complete kana reading required`);
        else insist(!s.r,`${e.id}: English span must not have Japanese reading`);
      }
    }
  }
}
const imageManifest=json('output/winter-postal-2026-10/image-manifest.json');
insist(imageManifest.items.length===entries.length,'Image count mismatch');
const imageKeys=new Set();
const images=[];
for(const item of imageManifest.items){
  insist(ids.includes(item.wordId)&&!imageKeys.has(item.wordId),'Image ID mismatch/duplicate');imageKeys.add(item.wordId);
  const file=path.join(out,item.localPath), bytes=fs.readFileSync(file), meta=await sharp(bytes).metadata();
  insist(meta.format==='webp'&&meta.width>=768&&meta.height>=768,'Invalid/low-resolution WebP');
  insist(bytes.length===item.bytes&&sha(bytes)===item.sha256,'Image changed from manifest');
  const sourceBytes=fs.readFileSync(path.join(out,item.sourcePath));
  insist(sha(sourceBytes)===item.sourceSha256,'Image source changed');
  images.push({...item,localFile:path.relative(root,file),url:`https://img.nexflow.team/${item.storagePath}`});
}
insist(new Set(images.map(i=>i.storagePath)).size===images.length,'Image storage-path collision');

if(args.has('--check-api')){
  const probes=[];
  for(const q of ['年賀','喪中','はがき']) for(const learning of ['zh-ja','zh-en']){
    const url=new URL('https://tuji.nexflow.team/api/search');
    Object.entries({q,limit:'200',lang:'zh-Hant',learning}).forEach(([k,v])=>url.searchParams.set(k,v));
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    insist(response.ok,`API ${response.status}`);
    const payload=await response.json();
    probes.push({url:String(url),status:response.status,payload});
  }
  write('api-preflight.json',{checkedAt:new Date().toISOString(),probes});
}
if(args.has('--check-db')){
  insist(process.env.DATABASE_URL,'DATABASE_URL missing');
  const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1});
  try{
    const result=await sql.begin('read only',async tx=>{
      const [identity]=await tx`SELECT current_database() AS name, current_user AS role`;
      const collisionRows=await tx`SELECT id,word,category,status FROM words WHERE id=ANY(${ids}) OR lower(word)=ANY(${entries.map(e=>e.word.toLowerCase())})`;
      const japaneseCollisions=await tx`SELECT word_id,term FROM word_terms WHERE language='ja' AND term=ANY(${entries.map(e=>e.ja)})`;
      const categories=await tx`SELECT id,name,name_zh,emoji,description,description_en,color,image_url FROM categories WHERE id='postal-services'`;
      const categoryTranslations=await tx`SELECT category_id,language,name,description FROM category_translations WHERE category_id='postal-services' ORDER BY language`;
      const related=await tx`SELECT w.id,w.word,w.status,t.term FROM words w LEFT JOIN word_terms t ON t.word_id=w.id AND t.language='ja' WHERE w.id='postcard' AND w.status='published' AND w.deleted_at IS NULL`;
      const sentenceCollisions=await tx`SELECT DISTINCT sentence_language,sentence FROM sentence_spans WHERE (sentence_language='en' AND sentence=ANY(${entries.flatMap(e=>e.examples.map(x=>x.en))})) OR (sentence_language='ja' AND sentence=ANY(${entries.flatMap(e=>e.examples.map(x=>x.ja))}))`;
      const [count]=await tx`SELECT count(*)::int AS count FROM words WHERE status='published' AND deleted_at IS NULL`;
      const dbUrl=new URL(process.env.DATABASE_URL);
      return {checkedAt:new Date().toISOString(),transactionReadOnly:true,databaseHostFingerprint:sha(`${dbUrl.protocol}//${dbUrl.username}@${dbUrl.hostname}:${dbUrl.port}/${dbUrl.pathname.replace(/^\//,'')}`).slice(0,12),logicalTargetFingerprint:sha(`${dbUrl.hostname}:${dbUrl.port}/${identity.name}/${identity.role}`),publishedCount:count.count,collisionRows,japaneseCollisions,categories,categoryTranslations,related,sentenceCollisions,passed:collisionRows.length===0&&japaneseCollisions.length===0&&categories.length===1&&related.length===1&&sentenceCollisions.length===0};
    });
    write('database-preflight.json',result);
    insist(result.passed,'Read-only database preflight found collisions or missing prerequisites');
  }finally{await sql.end();}
}
let audio=null;
const audioManifestPath='output/winter-postal-2026-10/audio-candidates/generated-manifest.json';
if(fs.existsSync(path.join(root,audioManifestPath))){
  const jobs=json('output/winter-postal-2026-10/audio-plan/manifest.json').jobs;
  const generated=json(audioManifestPath);
  const clips=Object.values(generated.generated), results=[];
  for(const job of jobs){
    const key=`${job.kind}|${job.ownerKey}|${job.locale}`;
    const clip=generated.generated[key];insist(clip,`Missing clip ${key}`);
    const bytes=fs.readFileSync(path.join(out,'audio-candidates',clip.file));
    insist(clip.sourceText===job.text&&clip.bytes===bytes.length&&clip.sha256===sha(bytes),`Stale or modified clip ${key}`);
    const inspection=inspectMp3Bytes(bytes);insist(inspection.valid&&inspection.frames>0,`Invalid MP3 ${key}`);
    results.push({key,...inspection});
  }
  insist(clips.length===jobs.length&&new Set(clips.map(c=>c.file)).size===clips.length,'Audio count/path collision');
  audio={clips:clips.map(c=>({...c,localFile:path.relative(root,path.join(out,'audio-candidates',c.file)),storagePath:c.kind==='headword'?`word-audio/words/${c.wordId}/${c.locale}-winter-postal-${c.sha256.slice(0,12)}.mp3`:null,storagePathTemplate:c.kind==='example'?`word-audio/examples/{resolvedExampleId}/${c.locale}-winter-postal-${c.sha256.slice(0,12)}.mp3`:null})),frames:results};
  write('audio-candidates/mp3-frames-report.json',{passed:true,clips:clips.length,results});
}
const semanticPath='output/winter-postal-2026-10/independent-review-content.json';
const visualPath='output/winter-postal-2026-10/independent-review-images.json';
const semantic=fs.existsSync(path.join(root,semanticPath))?json(semanticPath):null;
const visual=fs.existsSync(path.join(root,visualPath))?json(visualPath):null;
const semanticPass=semantic?.status==='pass'&&semantic.sourceHashes?.contentSha256===sha(read(sourcePath))&&semantic.sourceHashes?.spansSha256===sha(read(spansPath));
const visualPass=visual?.status==='pass'&&visual.manifestSha256===sha(read('output/winter-postal-2026-10/image-manifest.json'))&&visual.items.length===images.length&&images.every(i=>visual.items.some(v=>v.wordId===i.wordId&&v.verdict==='pass'&&v.sha256===i.sha256));
const report={checkedAt:new Date().toISOString(),sourceSha256:sha(read(sourcePath)),spansSha256:sha(read(spansPath)),words:entries.length,examples:entries.length*2,spanArrays:entries.length*4,images:images.length,audioClips:audio?.clips.length??0,structure:'passed',localImages:'passed',localAudio:audio?'passed':'pending',independentSemanticReview:semanticPass?'passed':'pending',independentVisualReview:visualPass?'passed':'pending',productionUploads:0,databaseWrites:0,scope:'Local candidate artifacts only; no seed/fallback/runtime registration.',issues};
write('preparation-report.json',report);
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>冬季第一批｜郵局擴充</title><style>body{font:18px/1.7 system-ui;max-width:1000px;margin:40px auto;padding:20px;background:#faf8f5;color:#252525}article{background:white;padding:28px;margin:30px 0;border-radius:18px}img{width:280px;max-width:100%;float:right;margin:0 0 20px 30px}audio{max-width:100%}.note{color:#805522}article:after{content:'';display:block;clear:both}</style><h1>冬季第一批｜郵局擴充</h1><p class="note">本地候選預覽，尚未發布。內容與圖片待獨立審查；正式上傳與資料庫寫入須另行授權。</p>${entries.map(e=>{const image=images.find(i=>i.wordId===e.id);const clips=audio?.clips??[];return `<article><img src="${escape(image.localPath)}" alt="${escape(e.chinese)}"><h2>${escape(e.chinese)}／${escape(e.ja)}</h2><p>${escape(e.jaReading)}｜${escape(e.word)} ${escape(e.pronunciation)}</p><p>${escape(e.chineseDefinition)}</p><p>${escape(e.definitions.find(d=>d.language==='ja').definition)}</p>${clips.filter(c=>c.kind==='headword'&&c.wordId===e.id).map(c=>`<label>${escape(c.locale)} <audio controls src="audio-candidates/${escape(c.file)}"></audio></label>`).join('<br>')}${e.examples.map((x,i)=>`<h3>例句 ${i+1} · ${x.cefrLevel}</h3><p>${escape(x.en)}<br>${escape(x.ja)}<br>${escape(x.zh)}</p>${['en','ja'].map(l=>`<p>${spans[l][x[l]].map(s=>s.z?`<ruby title="${escape(`${s.z} / ${s.j} / ${s.e}`)}">${escape(s.t)}<rt>${escape(s.r??'')}</rt></ruby>`:escape(s.t)).join('')}</p>`).join('')}${clips.filter(c=>c.kind==='example'&&c.wordId===e.id&&c.slot===i).map(c=>`<label>${escape(c.locale)} <audio controls src="audio-candidates/${escape(c.file)}"></audio></label>`).join('<br>')}`).join('')}</article>`}).join('')}<h2>選詞與用法決策</h2>${source.editorialDecisions.map(d=>`<p><b>${escape(d.candidate)}</b> ${escape(d.reason)}</p>`).join('')}<h2>用語來源</h2>${source.references.map(u=>`<p><a href="${escape(u)}">${escape(u)}</a></p>`).join('')}</html>`;
fs.writeFileSync(path.join(out,'preview.html'),html.replace('內容與圖片待獨立審查；',`內容獨立審查：${semanticPass?'通過':'待完成'}；圖片獨立審查：${visualPass?'通過':'待完成'}。圖片為概念插圖，並非當年度官方票樣或可寄用郵品；`));
if(args.has('--finalize')) await import('./prepare-winter-postal-2026-10-publish-plan.mjs');
console.log(JSON.stringify(report,null,2));
