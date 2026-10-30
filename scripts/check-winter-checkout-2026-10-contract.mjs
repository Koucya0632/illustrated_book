// Build a faithful local projection and run the official Tuji example contract.
// A pending independent semantic review is reported separately from mechanics.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'output/winter-checkout-2026-10');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/winter-checkout-2026-10.json')));
const corpus=JSON.parse(fs.readFileSync(path.join(root,'data/example-spans-winter-checkout-2026-10.json')));
const summary=(language,sentence)=>{
  const spans=corpus[language][sentence];
  if(!Array.isArray(spans))throw new Error('Missing authored sentence spans');
  return {spanCount:spans.length,glossedSpanCount:spans.filter(s=>s.z&&s.j&&s.e).length,
    partialGlossCount:spans.filter(s=>(s.z||s.j||s.e)&&!(s.z&&s.j&&s.e)).length,
    missingReadingCount:spans.filter(s=>s.z&&!s.r).length,unexpectedReadingCount:spans.filter(s=>s.r).length,
    reconstructed:spans.map(s=>s.t).join(''),texts:spans.map(s=>s.t),glossed:spans.map(s=>!!(s.z||s.j||s.e)),readings:spans.map(s=>s.r??null),metaGlossCount:0};
};
const fixture={version:1,createdAt:new Date().toISOString(),source:'local candidate projection, not published DB',words:data.entries.map(e=>({id:e.id,enTerm:e.word,jaTerm:e.ja,zhDefinition:e.chineseDefinition,examples:e.examples.map((x,i)=>({id:`${e.id}:${i}`,sortOrder:i,cefrLevel:x.cefrLevel,en:x.en,ja:x.ja,zh:x.zh,clickTranslations:{en:summary('en',x.en),ja:summary('ja',x.ja)}}))}))};
fs.mkdirSync(out,{recursive:true});const input=path.join(out,'official-checker-input.json');
fs.writeFileSync(input,JSON.stringify(fixture,null,2)+'\n');
const args=['/Users/rex/.codex/skills/audit-tuji-atlas/scripts/check-example-contract.mjs','--input',input,'--output-dir',path.join(out,'official-checker'),'--json'];
const reviewIndex=process.argv.indexOf('--review');if(reviewIndex>=0)args.push('--review',path.resolve(root,process.argv[reviewIndex+1]));
const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
fs.writeFileSync(path.join(out,'official-checker.log'),result.stdout+(result.stderr||''));
if(result.error)throw result.error;
const report=JSON.parse(result.stdout);
console.log(JSON.stringify({mechanicalStatus:report.mechanicalStatus,semanticReviewStatus:report.semanticReviewStatus,counts:report.counts,issues:report.issues},null,2));
if(report.mechanicalStatus!=='passed')process.exitCode=1;
