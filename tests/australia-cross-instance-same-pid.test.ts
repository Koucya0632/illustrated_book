import assert from 'node:assert/strict';import test from 'node:test';import postgres from 'postgres';
import {acquireAustralianTestBatchLock,australianBatchLockKey} from '../lib/catalogue/publish/australia-session-lock';
import {AUSTRALIAN_TEST_BATCH_ID,createAustraliaTestOwnership,installAustraliaTestOwnership} from '../lib/catalogue/publish/australia-ownership-test';
import {acquireAustraliaTestFence} from '../lib/catalogue/publish/australia-fencing-test';
import {inspectAustraliaTestCommittedBatch} from '../lib/catalogue/publish/australia-commit-recovery-test';
const urlA=process.env.AU_TEST_DATABASE_URL,urlB=process.env.AU_OTHER_TEST_DATABASE_URL;
test('same backend PID and lock key on separate PostgreSQL instances cannot authorize the other client',{skip:!urlA||!urlB,timeout:20000},async()=>{
 for(const url of [urlA!,urlB!]){const u=new URL(url);assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname));assert.equal(u.pathname,'/tuji_au_test')}
 assert.notEqual(new URL(urlA!).port,new URL(urlB!).port,'must use two independent test instances');
 const a=postgres(urlA!,{max:1,prepare:false,onnotice:()=>{}}),b=postgres(urlB!,{max:1,prepare:false,onnotice:()=>{}});let lockA:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined,lockB:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
 try{
  await installAustraliaTestOwnership(urlA!,a);await installAustraliaTestOwnership(urlB!,b);
  lockA=await acquireAustralianTestBatchLock(urlA!,a,AUSTRALIAN_TEST_BATCH_ID);lockB=await acquireAustralianTestBatchLock(urlB!,b,AUSTRALIAN_TEST_BATCH_ID);
  // Align test backends deterministically if the containers spawned different
  // numbers of startup processes. Each retry creates one new lock backend.
  for(let attempt=0;attempt<50&&lockA.backendPid!==lockB.backendPid;attempt++){
   if(lockA.backendPid<lockB.backendPid){await lockA.release();lockA=await acquireAustralianTestBatchLock(urlA!,a,AUSTRALIAN_TEST_BATCH_ID)}
   else{await lockB.release();lockB=await acquireAustralianTestBatchLock(urlB!,b,AUSTRALIAN_TEST_BATCH_ID)}
  }
  assert.equal(lockA.backendPid,lockB.backendPid,'test must reproduce same backend PID; start two fresh matching containers');
  assert.notEqual(lockA.sessionChallenge,lockB.sessionChallenge);
  const [k1,k2]=australianBatchLockKey(AUSTRALIAN_TEST_BATCH_ID);
  const [observed]=await b`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity s ON s.pid=l.pid WHERE l.pid=${lockA.backendPid} AND l.locktype='advisory' AND l.granted AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND l.classid=(${k1}::bigint & 4294967295)::oid AND l.objid=(${k2}::bigint & 4294967295)::oid AND l.objsubid=2) AS vulnerable_old_check,EXISTS(SELECT 1 FROM pg_stat_activity s WHERE s.pid=${lockA.backendPid} AND s.application_name=${lockA.sessionChallenge}) AS challenge_found`;
  assert.equal(observed.vulnerable_old_check,true,'old PID-only logic would have incorrectly accepted');assert.equal(observed.challenge_found,false,'distinct session challenge detects foreign lock');
  assert.throws(()=>createAustraliaTestOwnership(urlB!,b,lockA!),/different work connection/);
  const fabricated={...lockB,assertHeld:async()=>{}} as typeof lockB;
  assert.throws(()=>createAustraliaTestOwnership(urlB!,b,fabricated),/not an authentic test lock/);
  const input={journalId:'00000000-0000-4000-8000-000000000000',journalFile:'/tmp/not-used.json',planDigest:'a'.repeat(64),storageFingerprint:'test'};
  await assert.rejects(acquireAustraliaTestFence(urlB!,b,lockA!,input),/different work connection/);
  await assert.rejects(inspectAustraliaTestCommittedBatch(urlB!,b,lockA!,{...input,examples:[],objects:[]},{async putIfAbsent(){return 'created'},async fetch(){return null}}),/different work connection/);
  await createAustraliaTestOwnership(urlA!,a,lockA).assertHeld();await createAustraliaTestOwnership(urlB!,b,lockB).assertHeld();
 }finally{if(lockA)await lockA.release().catch(()=>{});if(lockB)await lockB.release().catch(()=>{});await Promise.all([a.end(),b.end()])}
});
