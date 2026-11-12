// Seal an immutable, reviewed plan for the existing-category expansion publisher.
// No database or Storage writes. Run prepare-winter-warmth-2026-11.mjs --check-db first.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'), out=path.join(root,'output/winter-warmth-2026-11');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p));
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const digest=x=>sha(JSON.stringify(canonical(x)));
const insist=(v,m)=>{if(!v)throw new Error(m);};
const prefix='output/winter-warmth-2026-11/';
const files={content:'data/winter-warmth-2026-11.json',spans:'data/example-spans-winter-warmth-2026-11.json',imagePrompts:'data/winter-warmth-2026-11-image-prompts.json',images:prefix+'image-manifest.json',audioPlan:prefix+'audio-plan/manifest.json',audio:prefix+'audio-candidates/generated-manifest.json',audioVerification:prefix+'audio-candidates/verification-report.json',frameVerification:prefix+'audio-candidates/mp3-frames-report.json',semanticReview:prefix+'independent-review-content.json',visualReview:prefix+'independent-review-images.json',audioReview:prefix+'independent-review-audio.json',publisher:'scripts/publish-winter-warmth-2026-11.ts',planner:'scripts/prepare-winter-warmth-2026-11-publish-plan.mjs',preparation:'scripts/prepare-winter-warmth-2026-11.mjs'};
files.canonicalImageIntegrationPatch='data/winter-warmth-2026-11-canonical-images.patch';
files.postPublicationIntegrationPatch='data/winter-warmth-2026-11-postpublication-integration.patch';
files.postPublicationIntegrationMetadata='data/winter-warmth-2026-11-postpublication-integration.json';
const sources=Object.fromEntries(Object.entries(files).map(([k,file])=>[k,{file,sha256:sha(read(file))}]));
const candidates=json(files.content),spans=json(files.spans),images=json(files.images),audio=json(files.audio),semantic=json(files.semanticReview),visual=json(files.visualReview),audioReview=json(files.audioReview),db=json(prefix+'database-preflight.json');
images.items=images.entries.map(i=>({...i,
  localPath:path.relative(out,path.resolve(root,i.localFile)),
  sourcePath:path.relative(out,path.resolve(root,i.sourceFile)),
  sha256:i.contentSha256,storagePath:`word-images/${i.storagePath}`,
}));
insist(db.passed&&db.transactionReadOnly&&db.categories.length===2,'Passing SELECT-only DB preflight required');
insist(semantic.status==='pass-content-and-spans'&&semantic.sourceHashes.contentSha256===sources.content.sha256&&semantic.sourceHashes.spansSha256===sources.spans.sha256,'Semantic review is incomplete or stale');
insist(semantic.entries.length===candidates.entries.length&&new Set(semantic.entries.map(e=>e.id)).size===candidates.entries.length&&candidates.entries.every(e=>semantic.entries.some(r=>r.id===e.id&&r.verdict==='pass'&&r.examples.length===2&&new Set(r.examples.map(x=>x.slot)).size===2&&r.examples.every(x=>[0,1].includes(x.slot)&&x.verdict==='pass'))),'Incomplete semantic coverage');
insist(visual.status==='pass-local-images'&&visual.manifestSha256===sources.images.sha256&&visual.entries.length===candidates.entries.length&&new Set(visual.entries.map(e=>e.id)).size===candidates.entries.length,'Image review stale or incomplete');
visual.items=visual.entries.map(e=>({...e,wordId:e.id,sha256:e.files.find(f=>f.role==='localFile'&&f.visuallyViewed)?.sha256}));
insist(audioReview.status==='pass'&&audioReview.generatedManifestSha256===sources.audio.sha256&&audioReview.contentSha256===sources.content.sha256,'Audio review stale or incomplete');
insist(json(files.audioVerification).passed&&json(files.frameVerification).passed,'Audio byte/frame validation required');
const categories=candidates.categories;
const categoriesBefore={categories:db.categories,translations:db.categoryTranslations};
insist(categoriesBefore.categories.map(({id})=>id).join(',')==='bedroom,drugstore'&&categories.every(({id})=>categoriesBefore.translations.some(t=>t.category_id===id&&t.language==='ja')),'Both existing categories and their Japanese translations are required');
const usedKeys=new Set();
const mapClip=(entry,kind,slot,locale)=>{
  const ownerKey=kind==='headword'?entry.id:`${entry.id}:${slot}`,key=`${kind}|${ownerKey}|${locale}`;
  insist(!usedKeys.has(key),'Duplicate audio owner');usedKeys.add(key);
  const clip=audio.generated[key];
  const expected=kind==='headword'?(locale==='ja-JP'?entry.ja:entry.word):entry.examples[slot][locale==='ja-JP'?'ja':'en'];
  insist(clip?.sourceText===expected&&clip.text===expected,`Audio text mismatch ${key}`);
  const localFile=prefix+'audio-candidates/'+clip.file,bytes=read(localFile);
  insist(bytes.length===clip.bytes&&sha(bytes)===clip.sha256,`Audio bytes mismatch ${key}`);
  return {kind,ownerKey,wordId:entry.id,...(slot===null?{}:{slot,sortOrder:slot}),locale,sourceText:expected,sourceLanguage:locale==='ja-JP'?'ja':'en',sourceDigest:sha(`${locale}\0${expected}`),localFile,bytes:clip.bytes,contentSha256:clip.sha256,mimeType:'audio/mpeg',model:'chirp-3-hd',voice:`${locale}-Chirp3-HD-${audio.voice}`,bucket:'word-audio',storagePath:kind==='headword'?`${entry.id}/${locale}/${clip.sha256.slice(0,20)}.mp3`:`examples/{exampleId}/${locale}/${clip.sha256.slice(0,20)}.mp3`,uploadRequired:true};
};
const locales=['en-US','en-GB','ja-JP'];
const mapped=candidates.entries.map(entry=>{
  const im=images.items.find(i=>i.wordId===entry.id),review=visual.items.find(v=>v.wordId===entry.id);
  insist(im&&review?.verdict==='pass'&&review.sha256===im.sha256,`${entry.id} image review mismatch`);
  const localFile=prefix+im.localPath,bytes=read(localFile);insist(bytes.length===im.bytes&&sha(bytes)===im.sha256,'Image bytes changed');
  const image={id:entry.id,bucket:'word-images',storagePath:im.storagePath.replace(/^word-images\//,''),url:`https://img.nexflow.team/${im.storagePath}`,localFile,sourceFile:prefix+im.sourcePath,bytes:im.bytes,contentSha256:im.sha256,mimeType:'image/webp',width:im.width,height:im.height,license:'AI-generated',credit:'OpenAI image generation',uploadRequired:true};
  const word={...entry,imageUrl:image.url};
  const examples=entry.examples.map((example,slot)=>({ownerKey:`${entry.id}:${slot}`,sortOrder:slot,...example,spans:{en:spans.en[example.en],ja:spans.ja[example.ja]},audio:locales.map(l=>mapClip(entry,'example',slot,l))}));
  return {operation:'insert',contentDigest:digest(word),word,image,headwordAudio:locales.map(l=>mapClip(entry,'headword',null,l)),examples};
});
insist(usedKeys.size===Object.keys(audio.generated).length,'Audio coverage mismatch');
const backend=process.env.R2_ACCOUNT_ID?'r2':'supabase';
const identity=backend==='r2'?{backend,accountId:process.env.R2_ACCOUNT_ID??'',bucket:process.env.R2_BUCKET??'',endpoint:process.env.R2_ENDPOINT??'',publicBase:process.env.NEXT_PUBLIC_ASSET_BASE_URL??''}:{backend,supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL??''};
const content={schemaVersion:1,series:'winter-warmth-2026-11',workBatch:'winter-2026-04',mode:'existing-category-expansion',productionWriteAllowed:false,releaseShape:{insertWordIds:mapped.map(x=>x.word.id),updateWordIds:[]},categories,categoriesBefore,sources,entries:mapped,independentReviews:{semantic:'pass',visual:'pass',audio:'pass'},summary:{words:mapped.length,baseNoteRows:mapped.length,localizedNoteRows:mapped.length*2,definitions:mapped.reduce((n,x)=>n+x.word.definitions.length,0),examples:mapped.length*2,spanSentences:mapped.length*4,wordImages:mapped.length,categoryImages:0,audioClips:usedKeys.size,storageObjects:mapped.length+usedKeys.size},applyContract:['Fresh SELECT-only preflight; confirm logical DB and physical Storage targets immediately before separately authorized apply.','Reserve PostgreSQL example IDs and journal owner-key mapping before constructing example-audio paths; candidate word:slot keys are not database IDs.','Create-only immutable media; full remote bytes verification before a single content/publication transaction.','Reuse both existing categories unchanged; no category creation, translation update, cover upload, or rollback deletion.','Verify production content, remote bytes, API projections and ordinary/cache-busting user routes before recording release.'],limitations:['Images depict generic products and do not identify a brand or model.','No subjective full-clip listening review or production/device verification is claimed.']};
content.postPublicationIntegration={
  status:'deferred-until-db-published-and-verified',
  canonicalImagePatch:{...sources.canonicalImageIntegrationPatch,applied:false},
  pairAndSpanPatch:{...sources.postPublicationIntegrationPatch,applied:false},
  integrationMetadata:sources.postPublicationIntegrationMetadata,
  wordIds:mapped.map(x=>x.word.id),
  requiredOrder:[
    'DB完整發布並驗證後，才可在本地套用本批canonical image映射補丁；不得提前增加公開首頁用來計算詞數的映射key。',
    '套用前重新確認補丁仍適用且保留其他映射；commit、push及deploy均須另外授權。',
    '正式上線後的圖片全層稽核，須等待canonical image映射層同步完成，不能以DB已發布代稱全部圖片來源一致。',
  ],
};
const plan={...content,planDigest:digest(content),createdAt:new Date().toISOString(),status:'prepared',databasePreflight:db,storageTarget:{backend,fingerprint:sha(JSON.stringify(identity)).slice(0,12)}};
const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n'),file=`publish-plan-${sha(bytes)}.json`;
fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});
fs.writeFileSync(path.join(out,'publish-plan.json'),bytes);
fs.writeFileSync(path.join(out,'latest-plan.json'),JSON.stringify({file,sha256:sha(bytes),planDigest:plan.planDigest,status:plan.status},null,2)+'\n');
console.log(JSON.stringify({file,planDigest:plan.planDigest,summary:plan.summary,status:plan.status},null,2));
