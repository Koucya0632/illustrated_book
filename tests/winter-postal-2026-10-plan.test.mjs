import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const evidenceRoot='docs/releases/winter-postal-2026-10';
const source=path.join(root,evidenceRoot,'evidence/publish-plan-4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea.json');
const restoration=JSON.parse(fs.readFileSync(path.join(root,evidenceRoot,'restoration-index.json')));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const refresh=plan=>{
  const {planDigest,createdAt,status,databasePreflight,storageTarget,...content}=plan;
  plan.planDigest=digest(content);
};
function invoke(mutator,refreshDigest=true){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'winter-postal-plan-'));
  try{
    const plan=JSON.parse(fs.readFileSync(source));
    // These tests exercise the publisher's pre-DB integrity gates offline.
    // Keep the historical plan immutable; use a derived sandbox plan with
    // synthetic media bytes, never pretending to revalidate the real MP3/WebP.
    for(const source of Object.values(plan.sources)){
      const archived=restoration.artifacts.find(a=>a.originalPath===source.file);
      source.file=path.join(root,archived?archived.portablePath:source.file);
    }
    const allMedia=plan.entries.flatMap(item=>[item.image,...item.headwordAudio,...item.examples.flatMap(e=>e.audio)]);
    allMedia.forEach((artifact,index)=>{
      const bytes=Buffer.from(`offline integrity-gate fixture ${index}`);
      const localFile=path.join(dir,`media-${index}.fixture`);fs.writeFileSync(localFile,bytes);
      artifact.localFile=localFile;artifact.bytes=bytes.length;
      artifact.contentSha256=createHash('sha256').update(bytes).digest('hex');
    });
    refresh(plan);mutator(plan);
    if(refreshDigest) refresh(plan);
    const file=path.join(dir,'plan.json');fs.writeFileSync(file,JSON.stringify(plan));
    const env={...process.env};delete env.DATABASE_URL;
    // No --apply or --rollback flags and no DB URL: every case is non-mutating.
    const result=spawnSync(path.join(root,'node_modules/.bin/tsx'),['scripts/publish-winter-postal-2026-10.ts','--plan',file],{cwd:root,env,encoding:'utf8',timeout:15000});
    assert.notEqual(result.status,0);
    return result.stderr+result.stdout;
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('offline derived plan reaches DB configuration only after local integrity validation',()=>{
  assert.match(invoke(()=>{}),/missing DATABASE_URL/);
});
test('tampered content digest is rejected before database access',()=>{
  assert.match(invoke(p=>{p.entries[0].word.word='tampered';},false),/content digest changed/);
});
test('existing-category expansion rejects category cover uploads',()=>{
  assert.match(invoke(p=>{p.summary.categoryImages=1;}),/invalid or incomplete/);
});
test('existing-category expansion rejects a different category',()=>{
  assert.match(invoke(p=>{p.category.id='new-category';}),/invalid or incomplete/);
});
test('independent semantic pass is required',()=>{
  assert.match(invoke(p=>{p.independentReviews.semantic='pending';}),/invalid or incomplete/);
});
test('changed reviewed source hash is rejected even with recomputed plan digest',()=>{
  assert.match(invoke(p=>{p.sources.content.sha256='0'.repeat(64);}),/reviewed source changed after planning/);
});
test('changed media size is rejected before database access',()=>{
  assert.match(invoke(p=>{p.entries[0].image.bytes+=1;}),/local bytes no longer match/);
});
