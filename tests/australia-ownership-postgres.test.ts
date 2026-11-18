import assert from 'node:assert/strict';import {once} from 'node:events';import {randomBytes} from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';import postgres from 'postgres';
import {prepareAustralianPlan} from '../lib/catalogue/publish/australia-plan';import {runAustralianPublisher,type AustraliaDatabasePort,type AustraliaManifest} from '../lib/catalogue/publish/australia-journal';
import {acquireAustralianTestBatchLock} from '../lib/catalogue/publish/australia-session-lock';import {AUSTRALIAN_TEST_BATCH_ID,createAustraliaTestOwnership,installAustraliaTestOwnership} from '../lib/catalogue/publish/australia-ownership-test';
import {memoryStorage,FIXTURE_ASSET_BASE} from './helpers/release-fixture';import {syntheticEvidence} from './helpers/australia-evidence';
const url=process.env.AU_TEST_DATABASE_URL,source=process.env.AU_REVIEW_SOURCE,reserved=process.env.AU_RESERVED_IDS;
test('durable claim precedes local journal; crash can discover and restore same original',{skip:!url||!source||!reserved,timeout:30000},async()=>{
 const u=new URL(url!);assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.equal(u.pathname,'/tuji_au_test');
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(url!,{max:1,prepare:false,onnotice:()=>{}});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'au-owned-publisher-'));const alternate=fs.mkdtempSync(path.join(os.tmpdir(),'au-other-publisher-'));const batch=AUSTRALIAN_TEST_BATCH_ID;process.env.NEXT_PUBLIC_ASSET_BASE_URL=FIXTURE_ASSET_BASE;
 let first:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,second:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
 try{
  await installAustraliaTestOwnership(url!,a);const plan=prepareAustralianPlan(source!,reserved!,process.cwd()),planFile=path.join(tmp,'plan.json');fs.writeFileSync(planFile,JSON.stringify(plan));const evidence=syntheticEvidence(plan),{storage,objects}=memoryStorage();let committed=false;
  const database:AustraliaDatabasePort={async preflight(){return {ready:!committed,problems:committed?['committed']:[],beforeStateDigest:'a'.repeat(64)}},async reserveExampleIds(p){return Object.fromEntries(p.newWordIds.flatMap((id,i)=>[[`${id}:0`,String(i*2+1)],[`${id}:1`,String(i*2+2)]]))},async committedMatches(){return committed},async applyAtomic(){committed=true}};
  const target={hostFingerprint:'isolated-test-db',storageFingerprint:'isolated-test-storage',storageBackend:'r2' as const,apiBase:'https://test.invalid'};const req={mode:'apply' as const,confirmHost:target.hostFingerprint,confirmStorage:target.storageFingerprint,manifestDirectory:tmp};
  first=await acquireAustralianTestBatchLock(url!,a,batch);const firstOwner=createAustraliaTestOwnership(url!,a,first);
  const differentBatchLock=await acquireAustralianTestBatchLock(url!,b,'au-different-batch');
  try{assert.throws(()=>createAustraliaTestOwnership(url!,b,differentBatchLock),/noncanonical/)}finally{await differentBatchLock.release()}
  await assert.rejects(acquireAustralianTestBatchLock(url!,b,batch),/locked by another process/);
  const failBeforeFile={...firstOwner,async reserve(file:Parameters<typeof firstOwner.reserve>[0],manifest:Parameters<typeof firstOwner.reserve>[1]){await firstOwner.reserve(file,manifest);throw new Error('simulated crash before file')}};
  await assert.rejects(runAustralianPublisher(planFile,req,evidence,{root:process.cwd(),database,storage,target,freshGuard:async()=>evidence.response,testOwnership:failBeforeFile}),/simulated crash/);
  const original=await firstOwner.originalJournal();assert.equal(original.phase,'reserved');assert.equal(fs.existsSync(original.manifestFile),false);assert.equal(objects.size,0);
  await first.release();first=undefined;second=await acquireAustralianTestBatchLock(url!,b,batch);const secondOwner=createAustraliaTestOwnership(url!,b,second);
  await assert.rejects(runAustralianPublisher(planFile,{...req,manifestDirectory:alternate},evidence,{root:process.cwd(),database,storage,target,freshGuard:async()=>evidence.response,testOwnership:secondOwner}),/batch already claimed/);
  assert.deepEqual(await secondOwner.originalJournal(),original);assert.equal(objects.size,0);
  const resumed=await runAustralianPublisher(planFile,{...req,resume:original.manifestFile},evidence,{root:process.cwd(),database,storage,target,freshGuard:async()=>evidence.response,testOwnership:secondOwner});assert.equal(resumed.status,'database-committed-awaiting-activation');assert.equal(objects.size,287);
  const saved=JSON.parse(fs.readFileSync(original.manifestFile,'utf8'));assert.equal(saved.journalId,original.journalId);assert.equal((await secondOwner.originalJournal()).phase,'active');
  fs.unlinkSync(original.manifestFile);await assert.rejects(secondOwner.prepareResume(original.manifestFile),/active journal is missing/);assert.equal(fs.existsSync(original.manifestFile),false);
 }finally{if(first)await first.release().catch(()=>{});if(second)await second.release().catch(()=>{});await a`DELETE FROM australia_test_journal_reservations WHERE batch_id=${batch}`.catch(()=>{});await a`DELETE FROM australia_release_test_claims WHERE batch_id=${batch}`.catch(()=>{});await Promise.all([a.end(),b.end()]);fs.rmSync(tmp,{recursive:true,force:true});fs.rmSync(alternate,{recursive:true,force:true})}
});

test('in-flight PUT can finish after lock loss; stale process cannot mark success in this interleaving',{skip:!url||!source||!reserved,timeout:30000},async()=>{
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(url!,{max:1,prepare:false,onnotice:()=>{}});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'au-inflight-publisher-')),batch=AUSTRALIAN_TEST_BATCH_ID;process.env.NEXT_PUBLIC_ASSET_BASE_URL=FIXTURE_ASSET_BASE;
 let first:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,second:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,releasePut!:()=>void;
 try{
  await installAustraliaTestOwnership(url!,a);const plan=prepareAustralianPlan(source!,reserved!,process.cwd()),planFile=path.join(tmp,'plan.json');fs.writeFileSync(planFile,JSON.stringify(plan));const evidence=syntheticEvidence(plan),mem=memoryStorage();let entered!:()=>void;const onPut=new Promise<void>(r=>entered=r),proceed=new Promise<void>(r=>releasePut=r);let firstCall=true;
  const storage={...mem.storage,async put(...args:Parameters<typeof mem.storage.put>){if(firstCall){firstCall=false;entered();await proceed}return mem.storage.put(...args)}};let committed=false;
  const database:AustraliaDatabasePort={async preflight(){return {ready:!committed,problems:committed?['committed']:[],beforeStateDigest:'a'.repeat(64)}},async reserveExampleIds(p){return Object.fromEntries(p.newWordIds.flatMap((id,i)=>[[`${id}:0`,String(i*2+1)],[`${id}:1`,String(i*2+2)]]))},async committedMatches(){return committed},async applyAtomic(){committed=true}};
  const target={hostFingerprint:'isolated-test-db',storageFingerprint:'isolated-test-storage',storageBackend:'r2' as const,apiBase:'https://test.invalid'};const req={mode:'apply' as const,confirmHost:target.hostFingerprint,confirmStorage:target.storageFingerprint,manifestDirectory:tmp};
  first=await acquireAustralianTestBatchLock(url!,a,batch);const oldOwner=createAustraliaTestOwnership(url!,a,first);
  const old=runAustralianPublisher(planFile,req,evidence,{root:process.cwd(),database,storage,target,freshGuard:async()=>evidence.response,testOwnership:oldOwner}).then(()=>null,e=>e);await onPut;const original=await oldOwner.originalJournal(),before=fs.readFileSync(original.manifestFile,'utf8');
  await b`SELECT pg_terminate_backend(${first.backendPid})`;second=await acquireAustralianTestBatchLock(url!,b,batch);const newOwner=createAustraliaTestOwnership(url!,b,second);
  releasePut();assert.ok(await old,'old process must fail after lock loss');assert.equal(fs.readFileSync(original.manifestFile,'utf8'),before,'old process did not mark PUT success');assert.equal(mem.objects.size,1,'already-started PUT still completed');assert.equal(committed,false);
  const resumed=await runAustralianPublisher(planFile,{...req,resume:original.manifestFile},evidence,{root:process.cwd(),database,storage,target,freshGuard:async()=>evidence.response,testOwnership:newOwner});assert.equal(resumed.status,'database-committed-awaiting-activation');assert.equal(mem.objects.size,287);
 }finally{releasePut?.();if(first)await first.release().catch(()=>{});if(second)await second.release().catch(()=>{});await a`DELETE FROM australia_test_journal_reservations WHERE batch_id=${batch}`.catch(()=>{});await a`DELETE FROM australia_release_test_claims WHERE batch_id=${batch}`.catch(()=>{});await Promise.all([a.end(),b.end()]);fs.rmSync(tmp,{recursive:true,force:true})}
});

test('separate process crashes after durable reservation; other directory cannot take over',{skip:!url,timeout:20000},async()=>{
 const {spawn}=await import('node:child_process'),{randomUUID}=await import('node:crypto');
 const sql=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'au-ownership-process-')),batch=AUSTRALIAN_TEST_BATCH_ID,journalId=randomUUID(),planDigest='c'.repeat(64),storageFingerprint='isolated-process-storage',file=path.join(tmp,`australia-apply-${journalId}.json`);
 const manifest:AustraliaManifest={version:1,journalId,status:'prepared',createdAt:'test',updatedAt:'test',planDigest,planFileSha256:'d'.repeat(64),target:{hostFingerprint:'test',storageFingerprint,storageBackend:'r2',apiBase:'https://test.invalid'},beforeStateDigest:'e'.repeat(64),resolvedExampleIds:{},storageObjects:[],listeningEvidence:{kind:'user-waived-listening',planDigest,items:[]}};
 let child:ReturnType<typeof spawn>|undefined,lock:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
 try{
  await installAustraliaTestOwnership(url!,sql);child=spawn(process.execPath,['--import','tsx','tests/helpers/australia-ownership-worker.ts'],{cwd:process.cwd(),env:{...process.env,AU_OWNERSHIP_WORKER_PAYLOAD:JSON.stringify({url,batch,file,manifest})},stdio:['pipe','pipe','pipe']});
  const [chunk]=await Promise.race([once(child.stdout!,'data'),once(child,'exit').then(()=>{throw new Error('worker exited before reservation')})]);const response=JSON.parse(String(chunk).trim());assert.equal(response.status,'reserved');
  await assert.rejects(acquireAustralianTestBatchLock(url!,sql,batch),/locked by another process/);
  child.kill('SIGKILL');await once(child,'exit');child=undefined;
  lock=await acquireAustralianTestBatchLock(url!,sql,batch);const owner=createAustraliaTestOwnership(url!,sql,lock),original=await owner.originalJournal();assert.equal(original.journalId,journalId);assert.equal(original.manifestFile,path.join(fs.realpathSync(tmp),path.basename(file)));assert.equal(original.phase,'reserved');
  const different={...manifest,journalId:randomUUID()};await assert.rejects(owner.reserve(path.join(tmp,`australia-apply-${different.journalId}.json`),different),/already claimed/);
  await owner.prepareResume(file);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),manifest);await owner.activate(file,manifest);assert.equal((await owner.originalJournal()).phase,'active');
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit').catch(()=>{})}if(lock)await lock.release().catch(()=>{});await sql`DELETE FROM australia_test_journal_reservations WHERE batch_id=${batch}`.catch(()=>{});await sql`DELETE FROM australia_release_test_claims WHERE batch_id=${batch}`.catch(()=>{});await sql.end();fs.rmSync(tmp,{recursive:true,force:true})}
});

test('lock session from a different isolated DB cannot authorize this DB',{skip:!url||!process.env.AU_OTHER_TEST_DATABASE_URL,timeout:15000},async()=>{
 const otherUrl=process.env.AU_OTHER_TEST_DATABASE_URL!;const other=new URL(otherUrl);assert.ok(['127.0.0.1','localhost','[::1]'].includes(other.hostname));assert.equal(other.pathname,'/tuji_au_test');
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(otherUrl,{max:1,prepare:false,onnotice:()=>{}});let lock:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
 try{lock=await acquireAustralianTestBatchLock(url!,a,AUSTRALIAN_TEST_BATCH_ID);assert.throws(()=>createAustraliaTestOwnership(otherUrl,b,lock!),/different work connection/)}finally{if(lock)await lock.release().catch(()=>{});await Promise.all([a.end(),b.end()])}
});

test('successor waits for old transaction; loss before final check rolls back',{skip:!url,timeout:15000},async()=>{
 const {randomUUID}=await import('node:crypto');
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'au-transaction-owner-'));
 let first:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,second:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,release!:()=>void;
 const reached=new Promise<void>(resolve=>release=resolve);let entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve);
 const journalId=randomUUID(),planDigest='f'.repeat(64),file=path.join(tmp,`australia-apply-${journalId}.json`);
 const manifest:AustraliaManifest={version:1,journalId,status:'prepared',createdAt:'test',updatedAt:'test',planDigest,planFileSha256:'d'.repeat(64),target:{hostFingerprint:'test',storageFingerprint:'test-storage',storageBackend:'r2',apiBase:'https://test.invalid'},beforeStateDigest:'e'.repeat(64),resolvedExampleIds:{},storageObjects:[],listeningEvidence:{kind:'user-waived-listening',planDigest,items:[]}};
 try{
  await installAustraliaTestOwnership(url!,a);await a`CREATE TABLE IF NOT EXISTS australia_test_owner_marker (id text PRIMARY KEY)`;
  first=await acquireAustralianTestBatchLock(url!,a,AUSTRALIAN_TEST_BATCH_ID);const old=createAustraliaTestOwnership(url!,a,first);await old.reserve(file,manifest);fs.writeFileSync(file,JSON.stringify(manifest));await old.activate(file,manifest);
  const transaction=a.begin(async(tx)=>{await old.assertTransaction(tx,manifest);await tx`INSERT INTO australia_test_owner_marker VALUES ('uncommitted')`;entered();await reached;await old.assertTransaction(tx,manifest)}).then(()=>null,e=>e);
  await ready;await b`SELECT pg_terminate_backend(${first.backendPid})`;second=await acquireAustralianTestBatchLock(url!,b,AUSTRALIAN_TEST_BATCH_ID);const successor=createAustraliaTestOwnership(url!,b,second);
  let activated=false;const waiting=successor.activate(file,manifest).then(()=>{activated=true});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(activated,false,'successor must wait for transaction holding the reservation row');
  release();assert.ok(await transaction,'old transaction must abort after losing the lock');await waiting;assert.equal(activated,true);
  assert.equal((await b`SELECT id FROM australia_test_owner_marker`).length,0,'old transaction changes must roll back');
 }finally{release?.();if(first)await first.release().catch(()=>{});if(second)await second.release().catch(()=>{});await a`DELETE FROM australia_test_journal_reservations WHERE batch_id=${AUSTRALIAN_TEST_BATCH_ID}`.catch(()=>{});await a`DELETE FROM australia_release_test_claims WHERE batch_id=${AUSTRALIAN_TEST_BATCH_ID}`.catch(()=>{});await a`DROP TABLE IF EXISTS australia_test_owner_marker`.catch(()=>{});await Promise.all([a.end(),b.end()]);fs.rmSync(tmp,{recursive:true,force:true})}
});

test('successor waits when old transaction commits after its final lock check',{skip:!url,timeout:15000},async()=>{
 const {randomUUID}=await import('node:crypto');
 const a=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'au-owner-commit-'));
 let first:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,second:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,release!:()=>void;
 const proceed=new Promise<void>(resolve=>release=resolve);let entered!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve);
 const journalId=randomUUID(),planDigest='a'.repeat(64),file=path.join(tmp,`australia-apply-${journalId}.json`);
 const manifest:AustraliaManifest={version:1,journalId,status:'prepared',createdAt:'test',updatedAt:'test',planDigest,planFileSha256:'d'.repeat(64),target:{hostFingerprint:'test',storageFingerprint:'test-storage',storageBackend:'r2',apiBase:'https://test.invalid'},beforeStateDigest:'e'.repeat(64),resolvedExampleIds:{},storageObjects:[],listeningEvidence:{kind:'user-waived-listening',planDigest,items:[]}};
 try{
  await installAustraliaTestOwnership(url!,a);await a`CREATE TABLE IF NOT EXISTS australia_test_owner_marker (id text PRIMARY KEY)`;
  first=await acquireAustralianTestBatchLock(url!,a,AUSTRALIAN_TEST_BATCH_ID);const old=createAustraliaTestOwnership(url!,a,first);await old.reserve(file,manifest);fs.writeFileSync(file,JSON.stringify(manifest));await old.activate(file,manifest);
  const transaction=a.begin(async(tx)=>{await old.assertTransaction(tx,manifest);await tx`INSERT INTO australia_test_owner_marker VALUES ('committed')`;await old.assertTransaction(tx,manifest);entered();await proceed});
  await ready;await b`SELECT pg_terminate_backend(${first.backendPid})`;second=await acquireAustralianTestBatchLock(url!,b,AUSTRALIAN_TEST_BATCH_ID);const successor=createAustraliaTestOwnership(url!,b,second);
  let activated=false;const waiting=successor.activate(file,manifest).then(()=>{activated=true});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(activated,false,'successor must wait for the prior transaction');
  release();await transaction;await waiting;assert.equal(activated,true);
  assert.equal((await b`SELECT id FROM australia_test_owner_marker WHERE id='committed'`).length,1,'successor sees the prior committed result after waiting');
 }finally{release?.();if(first)await first.release().catch(()=>{});if(second)await second.release().catch(()=>{});await a`DELETE FROM australia_test_journal_reservations WHERE batch_id=${AUSTRALIAN_TEST_BATCH_ID}`.catch(()=>{});await a`DELETE FROM australia_release_test_claims WHERE batch_id=${AUSTRALIAN_TEST_BATCH_ID}`.catch(()=>{});await a`DROP TABLE IF EXISTS australia_test_owner_marker`.catch(()=>{});await Promise.all([a.end(),b.end()]);fs.rmSync(tmp,{recursive:true,force:true})}
});
