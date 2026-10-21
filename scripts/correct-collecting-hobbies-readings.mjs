// Default is SELECT-only. The apply is scoped to this release's exact before/after values.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import postgres from 'postgres';
const apply=process.argv.includes('--apply');
const file='data/collecting-hobbies-reading-correction-2026-10.json';
const bytes=fs.readFileSync(file),correction=JSON.parse(bytes);
const u=new URL(process.env.DATABASE_URL);
const fingerprint=createHash('sha256').update(`${u.protocol}//${u.username}@${u.hostname}:${u.port}/${u.pathname.replace(/^\//,'')}`).digest('hex').slice(0,12);
assert.equal(fingerprint,'15749fae6d13','unexpected database target');
const planFile='output/collecting-hobbies-publish-prep/publish-plan-'+correction.basePlanSha256+'.json';
assert.equal(createHash('sha256').update(fs.readFileSync(planFile)).digest('hex'),correction.basePlanSha256);
const plan=JSON.parse(fs.readFileSync(planFile));
for(const e of correction.entries){const w=plan.entries.find(p=>p.word.id===e.wordId)?.word;assert.ok(w);assert.equal(e.term,w.ja);assert.equal(e.before.reading,w.jaReading);assert.deepEqual(e.before.readingSegments,w.jaReadingSegments);assert.equal(e.after.readingSegments.map(s=>s.text).join(''),e.term);assert.equal(e.after.readingSegments.map(s=>s.ruby??s.text).join(''),e.after.reading);}
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1,...(!apply?{connection:{default_transaction_read_only:'on'}}:{})});
try {
 const report={checkedAt:new Date().toISOString(),apply,fingerprint,correctionSha256:createHash('sha256').update(bytes).digest('hex'),entries:[]};
 await sql.begin(apply?'read write':'read only',async tx=>{
  for(const e of correction.entries){
   const rows=await tx`SELECT t.term,t.reading,t.pronunciation,t.reading_segments,w.status,w.category,w.deleted_at FROM word_terms t JOIN words w ON w.id=t.word_id WHERE t.word_id=${e.wordId} AND t.language='ja'`;
   assert.equal(rows.length,1);const r=rows[0];assert.equal(r.status,'published');assert.equal(r.category,correction.series);assert.equal(r.deleted_at,null);assert.equal(r.term,e.term);
   const actual={reading:r.reading,pronunciation:r.pronunciation,readingSegments:r.reading_segments};
   const already=isDeepStrictEqual(actual,e.after);if(!already)assert.deepEqual(actual,e.before,`${e.wordId}: live value drift`);
   if(apply&&!already){
    const changed=await tx`UPDATE word_terms SET reading=${e.after.reading},pronunciation=${e.after.pronunciation},reading_segments=${tx.json(e.after.readingSegments)},updated_at=now() WHERE word_id=${e.wordId} AND language='ja' AND term=${e.term} AND reading=${e.before.reading} AND pronunciation=${e.before.pronunciation} AND reading_segments=${tx.json(e.before.readingSegments)} RETURNING word_id`;
    assert.equal(changed.length,1,`${e.wordId}: concurrent edit; rollback`);
    await tx`UPDATE cards SET explanation=concat_ws(' ',${e.term}::text,${e.after.reading}::text) WHERE word_id=${e.wordId} AND deck_key='image-ja' AND back=${e.term}`;
   }
   report.entries.push({wordId:e.wordId,before:actual,after:e.after,action:already?'already-correct':apply?'corrected':'would-correct'});
  }
 });
 const out='output/collecting-hobbies-postrelease/reading-correction-'+(apply?'applied':'dry-run')+'.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log({status:'passed',apply,words:report.entries.length,fingerprint,report:out});
}finally{await sql.end();}
