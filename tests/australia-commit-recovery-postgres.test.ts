import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';import postgres from 'postgres';
import {acquireAustralianTestBatchLock,installAustraliaTestClaimTable} from '../lib/catalogue/publish/australia-session-lock';
import {acquireAustraliaTestFence,commitAustraliaTestBatch,installAustraliaTestFenceTables,stageAustraliaTestObject,type TestStorage} from '../lib/catalogue/publish/australia-fencing-test';
import {inspectAustraliaTestCommittedBatch,installAustraliaRecoveryTestTables,writeAustraliaTestReceipt} from '../lib/catalogue/publish/australia-commit-recovery-test';
const url=process.env.AU_TEST_DATABASE_URL;
async function setup(){
 const u=new URL(url!);assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.equal(u.pathname,'/tuji_au_test');
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),control=postgres(url!,{max:1,prepare:false,onnotice:()=>{}});
 await installAustraliaTestClaimTable(url!,control);await installAustraliaTestFenceTables(url!,control);await installAustraliaRecoveryTestTables(url!,control);
 const batch=`au-recovery-${randomBytes(8).toString('hex')}`,dir=fs.mkdtempSync(path.join(os.tmpdir(),'au-recovery-'));
 const journalId=randomUUID(),planDigest='a'.repeat(64),storageFingerprint='test-storage',journalFile=path.join(dir,'journal.json');fs.writeFileSync(journalFile,JSON.stringify({version:1,journalId,planDigest,target:{storageFingerprint}}));
 const examples=Array.from({length:38},(_,i)=>({wordId:`word-${String(Math.floor(i/2)).padStart(2,'0')}`,sortOrder:i%2,text:`Reviewed example ${i}`}));
 const bytes=Buffer.from('isolated test object'),sha256=createHash('sha256').update(bytes).digest('hex'),object={key:`australia/audio/test/${sha256}.mp3`,sha256,bytes:bytes.length,mimeType:'audio/mpeg'};
 const objectBytes={...object,bytes},objects=new Map<string,{bytes:Buffer;contentType:string}>();
 const storage:TestStorage={async putIfAbsent(k,v,c){if(objects.has(k))return 'exists';objects.set(k,{bytes:Buffer.from(v),contentType:c});return 'created'},async fetch(k){return objects.get(k)??null}};
 const input={journalId,planDigest,storageFingerprint,journalFile,examples,objects:[object]},lockA=await acquireAustralianTestBatchLock(url!,a,batch),lease=await acquireAustraliaTestFence(url!,a,lockA,input);const locks=[lockA];
 async function insertAndReceipt(tx:postgres.TransactionSql){for(const x of examples)await tx`INSERT INTO australia_recovery_test_examples(batch_id,word_id,sort_order,example_text) VALUES (${batch},${x.wordId},${x.sortOrder},${x.text})`;await writeAustraliaTestReceipt(tx,lease,input)}
 async function commit(){await stageAustraliaTestObject(lease,objectBytes,storage);await commitAustraliaTestBatch(lease,[object.key],insertAndReceipt)}
 async function takeover(){await control`SELECT pg_terminate_backend(${lockA.backendPid})`;const lock=await acquireAustralianTestBatchLock(url!,b,batch);locks.push(lock);return lock}
 async function cleanup(){for(const lock of locks)await lock.release().catch(()=>{});await control`DELETE FROM australia_recovery_test_receipts WHERE batch_id=${batch}`;await control`DELETE FROM australia_recovery_test_examples WHERE batch_id=${batch}`;await control`DELETE FROM australia_fence_test_journals WHERE batch_id=${batch}`;await control`DELETE FROM australia_release_test_claims WHERE batch_id=${batch}`;await Promise.all([a.end(),b.end(),control.end()]);fs.rmSync(dir,{recursive:true,force:true})}
 return {a,b,control,batch,input,lease,lockA,object,objectBytes,objects,storage,commit,takeover,cleanup,insertAndReceipt};
}
test('lost commit acknowledgement: inspect same original claim, stable 38 IDs, no replay',{skip:!url,timeout:20000},async()=>{
 const c=await setup();try{await c.commit();const lock=await c.takeover();const first=await inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage);assert.equal(first.status,'inspected-not-published');assert.equal(first.examples.length,38);assert.equal(new Set(first.examples.map(x=>x.exampleId)).size,38);const second=await inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage);assert.deepEqual(second,first);const [count]=await c.control`SELECT count(*)::int AS n FROM australia_recovery_test_examples WHERE batch_id=${c.batch}`;assert.equal(count.n,38)}finally{await c.cleanup()}
});
test('transaction failure rolls back examples, receipt and marker together',{skip:!url,timeout:20000},async()=>{
 const c=await setup();try{await stageAustraliaTestObject(c.lease,c.objectBytes,c.storage);await assert.rejects(commitAustraliaTestBatch(c.lease,[c.object.key],async(tx)=>{await c.insertAndReceipt(tx);throw new Error('injected failure after receipt')}),/injected failure/);const [row]=await c.control`SELECT (SELECT count(*)::int FROM australia_recovery_test_examples WHERE batch_id=${c.batch}) AS examples,(SELECT count(*)::int FROM australia_recovery_test_receipts WHERE batch_id=${c.batch}) AS receipts,(SELECT phase FROM australia_fence_test_journals WHERE batch_id=${c.batch}) AS phase`;assert.deepEqual({examples:row.examples,receipts:row.receipts,phase:row.phase},{examples:0,receipts:0,phase:'staging'});const lock=await c.takeover();await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage),/not the original committed journal/)}finally{await c.cleanup()}
});
test('missing original claim is rejected and never recreated, including during readback',{skip:!url,timeout:20000},async()=>{
 const c=await setup();try{
  await c.commit();const lock=await c.takeover();
  const removingStorage:TestStorage={...c.storage,async fetch(key){await c.control`DELETE FROM australia_release_test_claims WHERE batch_id=${c.batch}`;return c.storage.fetch(key)}};
  await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,removingStorage),/no matching original claim/);
  const [after]=await c.control`SELECT count(*)::int AS n FROM australia_release_test_claims WHERE batch_id=${c.batch}`;assert.equal(after.n,0,'inspection must not recreate the claim');
  await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage),/no matching original claim/);
  const [again]=await c.control`SELECT count(*)::int AS n FROM australia_release_test_claims WHERE batch_id=${c.batch}`;assert.equal(again.n,0);
 }finally{await c.cleanup()}
});
test('recovery rejects changed rows, missing receipt, wrong plan and corrupt remote bytes',{skip:!url,timeout:20000},async()=>{
 const c=await setup();try{await c.commit();const lock=await c.takeover();await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,{...c.input,examples:c.input.examples.slice(1)},c.storage),/differ/);await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,{...c.input,planDigest:'b'.repeat(64)},c.storage),/journal contents|original claim/);
 await c.control`UPDATE australia_recovery_test_examples SET example_text='tampered' WHERE batch_id=${c.batch} AND word_id=${c.input.examples[0].wordId} AND sort_order=0`;await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage),/differ/);await c.control`UPDATE australia_recovery_test_examples SET example_text=${c.input.examples[0].text} WHERE batch_id=${c.batch} AND word_id=${c.input.examples[0].wordId} AND sort_order=0`;
 c.objects.set(c.object.key,{bytes:Buffer.from('wrong'),contentType:c.object.mimeType});await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage),/object mismatch/);c.objects.set(c.object.key,{bytes:c.objectBytes.bytes,contentType:c.object.mimeType});
 await c.control`DELETE FROM australia_recovery_test_receipts WHERE batch_id=${c.batch}`;await assert.rejects(inspectAustraliaTestCommittedBatch(url!,c.b,lock,c.input,c.storage),/receipt missing/)}finally{await c.cleanup()}
});
test('receipt refuses incomplete examples and mismatched or unverified objects',{skip:!url,timeout:20000},async()=>{
 const c=await setup();try{await stageAustraliaTestObject(c.lease,c.objectBytes,c.storage);await assert.rejects(commitAustraliaTestBatch(c.lease,[c.object.key],async(tx)=>{await tx`INSERT INTO australia_recovery_test_examples(batch_id,word_id,sort_order,example_text) VALUES (${c.batch},${c.input.examples[0].wordId},0,${c.input.examples[0].text})`;await writeAustraliaTestReceipt(tx,c.lease,c.input)}),/differ/);
 await assert.rejects(commitAustraliaTestBatch(c.lease,[c.object.key],async(tx)=>{for(const x of c.input.examples)await tx`INSERT INTO australia_recovery_test_examples(batch_id,word_id,sort_order,example_text) VALUES (${c.batch},${x.wordId},${x.sortOrder},${x.text})`;await writeAustraliaTestReceipt(tx,c.lease,{...c.input,objects:[{...c.object,bytes:c.object.bytes+1}]})}),/objects not fully verified/);
 await c.control`UPDATE australia_fence_test_objects SET status='intent',verified_epoch=NULL WHERE batch_id=${c.batch}`;
 await assert.rejects(commitAustraliaTestBatch(c.lease,[c.object.key],c.insertAndReceipt),/unverified/);
 const [row]=await c.control`SELECT count(*)::int AS n FROM australia_recovery_test_examples WHERE batch_id=${c.batch}`;assert.equal(row.n,0)}finally{await c.cleanup()}
});
