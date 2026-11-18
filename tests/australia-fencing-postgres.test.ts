import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import { acquireAustralianTestBatchLock, installAustraliaTestClaimTable } from '../lib/catalogue/publish/australia-session-lock';
import { acquireAustraliaTestFence, commitAustraliaTestBatch, installAustraliaTestFenceTables, stageAustraliaTestObject, type TestObject, type TestStorage } from '../lib/catalogue/publish/australia-fencing-test';

const url=process.env.AU_TEST_DATABASE_URL;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}}
function makeStorage():TestStorage & {objects:Map<string,{bytes:Buffer;contentType:string}>} {
 const objects=new Map<string,{bytes:Buffer;contentType:string}>();
 return {objects,async putIfAbsent(key,bytes,contentType){if(objects.has(key))return 'exists';objects.set(key,{bytes:Buffer.from(bytes),contentType});return 'created'},async fetch(key){return objects.get(key)??null}};
}
function makeObject():TestObject {const bytes=Buffer.from('isolated fencing test audio');const sha256=createHash('sha256').update(bytes).digest('hex');return {key:`australia/audio/test/en-AU/${sha256}.mp3`,bytes,sha256,mimeType:'audio/mpeg'}}
async function setup(){
 const u=new URL(url!);assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.equal(u.pathname,'/tuji_au_test');
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),control=postgres(url!,{max:1,prepare:false,onnotice:()=>{}});
 await installAustraliaTestClaimTable(url!,control);await installAustraliaTestFenceTables(url!,control);
 await control`CREATE TABLE IF NOT EXISTS australia_fence_test_data(batch_id text PRIMARY KEY,marker text NOT NULL)`;
 const batch=`au-fence-${randomBytes(8).toString('hex')}`,dir=fs.mkdtempSync(path.join(os.tmpdir(),'au-fencing-'));
 const journalId=randomUUID(),planDigest='a'.repeat(64),storageFingerprint='isolated-test-target',journalFile=path.join(dir,'journal.json');
 fs.writeFileSync(journalFile,JSON.stringify({version:1,journalId,planDigest,target:{storageFingerprint}}));
 const input={journalId,planDigest,storageFingerprint,journalFile};
 const lockA=await acquireAustralianTestBatchLock(url!,a,batch),leaseA=await acquireAustraliaTestFence(url!,a,lockA,input);
 const locks=[lockA];
 async function takeover(){await control`SELECT pg_terminate_backend(${lockA.backendPid})`;const lock=await acquireAustralianTestBatchLock(url!,b,batch);locks.push(lock);return {lock,lease:await acquireAustraliaTestFence(url!,b,lock,input)}}
 async function cleanup(){for(const l of locks)await l.release().catch(()=>{});await control`DELETE FROM australia_fence_test_data WHERE batch_id=${batch}`;await control`DELETE FROM australia_fence_test_journals WHERE batch_id=${batch}`;await control`DELETE FROM australia_release_test_claims WHERE batch_id=${batch}`;await Promise.all([a.end(),b.end(),control.end()]);fs.rmSync(dir,{recursive:true,force:true})}
 return {a,b,control,batch,input,lockA,leaseA,locks,takeover,cleanup};
}
for(const oldFinishesFirst of [false,true])test(`in-flight create-only PUT, lost lock, ${oldFinishesFirst?'old':'new'} request wins`,{skip:!url,timeout:15000},async()=>{
 const ctx=await setup(),storage=makeStorage(),object=makeObject(),entered=deferred(),proceed=deferred();let calls=0;
 const put=storage.putIfAbsent.bind(storage);storage.putIfAbsent=async(...args)=>{if(++calls===1){entered.resolve();await proceed.promise}return put(...args)};
 try{
  const pending=stageAustraliaTestObject(ctx.leaseA,object,storage).then(()=>null,e=>e);await entered.promise;
  const {lease}=await ctx.takeover();assert.equal(lease.epoch,2);
  if(oldFinishesFirst){proceed.resolve();assert.match(String(await pending),/stale|gone/i);await stageAustraliaTestObject(lease,object,storage)}
  else {await stageAustraliaTestObject(lease,object,storage);proceed.resolve();assert.match(String(await pending),/stale|gone/i)}
  assert.deepEqual(storage.objects.get(object.key)?.bytes,object.bytes);
  const [row]=await ctx.control`SELECT status,verified_epoch FROM australia_fence_test_objects WHERE batch_id=${ctx.batch}`;assert.equal(row.status,'verified');assert.equal(Number(row.verified_epoch),2);
 }finally{proceed.resolve();await ctx.cleanup()}
});

test('existing object with incorrect bytes is not trusted or overwritten',{skip:!url,timeout:15000},async()=>{
 const ctx=await setup(),storage=makeStorage(),object=makeObject();storage.objects.set(object.key,{bytes:Buffer.from('incorrect'),contentType:object.mimeType});
 try{await assert.rejects(stageAustraliaTestObject(ctx.leaseA,object,storage),/does not match/);assert.equal(storage.objects.get(object.key)?.bytes.toString(),'incorrect');const [row]=await ctx.control`SELECT status FROM australia_fence_test_objects WHERE batch_id=${ctx.batch}`;assert.equal(row.status,'intent')}
 finally{await ctx.cleanup()}
});

test('lost session aborts in-flight transaction; new owner re-verifies objects before commit',{skip:!url,timeout:15000},async()=>{
 const ctx=await setup(),storage=makeStorage(),object=makeObject(),entered=deferred(),proceed=deferred();
 try{
  await stageAustraliaTestObject(ctx.leaseA,object,storage);
  const old=commitAustraliaTestBatch(ctx.leaseA,[object.key],async(tx)=>{await tx`INSERT INTO australia_fence_test_data VALUES (${ctx.batch},'old')`;entered.resolve();await proceed.promise}).then(()=>null,e=>e);
  await entered.promise;await ctx.control`SELECT pg_terminate_backend(${ctx.lockA.backendPid})`;
  const lockB=await acquireAustralianTestBatchLock(url!,ctx.b,ctx.batch);ctx.locks.push(lockB);
  let completed=false;const takeover=acquireAustraliaTestFence(url!,ctx.b,lockB,ctx.input).then(v=>{completed=true;return v});
  await new Promise(r=>setTimeout(r,150));assert.equal(completed,false,'new epoch waits for old transaction row lock');
  assert.equal((await ctx.control`SELECT * FROM australia_fence_test_data WHERE batch_id=${ctx.batch}`).length,0);
  proceed.resolve();assert.match(String(await old),/gone|session/i);const lease=await takeover;assert.equal(lease.epoch,2);
  assert.equal((await ctx.control`SELECT * FROM australia_fence_test_data WHERE batch_id=${ctx.batch}`).length,0,'failed transaction rolled back');
  await assert.rejects(commitAustraliaTestBatch(lease,[object.key],async()=>{}),/unverified for current epoch/);
  await stageAustraliaTestObject(lease,object,storage);
  await commitAustraliaTestBatch(lease,[object.key],async(tx)=>{await tx`INSERT INTO australia_fence_test_data VALUES (${ctx.batch},'new')`});
  const [row]=await ctx.control`SELECT marker FROM australia_fence_test_data WHERE batch_id=${ctx.batch}`;assert.equal(row.marker,'new');
  const [journal]=await ctx.control`SELECT phase FROM australia_fence_test_journals WHERE batch_id=${ctx.batch}`;assert.equal(journal.phase,'db-committed');
 }finally{proceed.resolve();await ctx.cleanup()}
});
