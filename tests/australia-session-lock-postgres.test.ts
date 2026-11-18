import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import postgres from "postgres";
import { acquireAustralianTestBatchLock, australianBatchLockKey, installAustraliaTestClaimTable, withAustralianTestBatchLock } from "../lib/catalogue/publish/australia-session-lock";

const url=process.env.AU_TEST_DATABASE_URL;
type Result = {status:string;name?:string;message?:string;lockPid?:number;workPid?:number;claimStatus?:string};
function nextLine(child:ChildProcessWithoutNullStreams):Promise<Result> {
 return new Promise((resolve,reject)=>{
  let buffer="";let stderr="";
  const timer=setTimeout(()=>finish(new Error(`worker timed out: ${stderr}`)),10000);
  function finish(error?:Error, result?:Result){clearTimeout(timer);child.stdout.off("data",onData);child.stderr.off("data",onError);child.off("error",onChildError);child.off("exit",onExit);if(error)reject(error);else resolve(result!);}
  function onData(chunk:Buffer){buffer+=chunk.toString();const index=buffer.indexOf("\n");if(index>=0){try{finish(undefined,JSON.parse(buffer.slice(0,index)) as Result)}catch(e){finish(e as Error)}}}
  function onError(chunk:Buffer){stderr+=chunk.toString();}
  function onChildError(error:Error){finish(error);}
  function onExit(code:number|null,signal:NodeJS.Signals|null){finish(new Error(`worker exited ${code??signal} without response: ${stderr}`));}
  child.stdout.on("data",onData);child.stderr.on("data",onError);child.once("error",onChildError);child.once("exit",onExit);
 });
}
function start(input:Record<string,string>){
 return spawn(process.execPath,["--import","tsx","tests/helpers/australia-session-lock-worker.ts"],{cwd:process.cwd(),env:{...process.env,AU_LOCK_TEST_PAYLOAD:JSON.stringify(input)},stdio:["pipe","pipe","pipe"]});
}
function createJournal(dir:string,journalId:string,planDigest:string,storageFingerprint:string){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,"apply-manifest.json");
 fs.writeFileSync(file,JSON.stringify({version:1,journalId,planDigest,target:{storageFingerprint}}));return file;
}
async function waitExit(child:ChildProcessWithoutNullStreams){if(child.exitCode!==null||child.signalCode!==null)return;await once(child,"exit");}

test("dedicated session lock spans processes and directories; crash preserves original journal claim",{skip:!url,timeout:45000},async()=>{
 const parsed=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(parsed.hostname));assert.equal(parsed.pathname,"/tuji_au_test");
 const db=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"au-session-lock-"));
 const suffix=randomBytes(6).toString("hex"),batchId=`au-test-${suffix}`,otherBatch=`au-other-${suffix}`;const children:ChildProcessWithoutNullStreams[]=[];
 try {
  await installAustraliaTestClaimTable(url!,db);
  const aId=randomUUID(),bId=randomUUID(),planDigest="a".repeat(64),storageFingerprint="test-storage-1";
  const aFile=createJournal(path.join(tmp,"journal-a"),aId,planDigest,storageFingerprint),bFile=createJournal(path.join(tmp,"journal-b"),bId,planDigest,storageFingerprint);
  const a={databaseUrl:url!,batchId,journalId:aId,planDigest,storageFingerprint,journalFile:aFile};
  const alternateUrl=new URL(url!);alternateUrl.searchParams.set("application_name","second-journal-process");
  const b={...a,databaseUrl:alternateUrl.toString(),journalId:bId,journalFile:bFile};
  const aProc=start(a);children.push(aProc);const first=await nextLine(aProc);assert.equal(first.status,"acquired");assert.notEqual(first.lockPid,first.workPid,"lock and transaction use separate DB sessions");
  const bProc=start(b);children.push(bProc);const busy=await nextLine(bProc);assert.equal(busy.name,"AustraliaLockBusyError");await waitExit(bProc);
  const otherProc=start({...b,batchId:otherBatch});children.push(otherProc);const other=await nextLine(otherProc);assert.equal(other.status,"acquired","unrelated batch can proceed");
  otherProc.stdin.write("release\n");await waitExit(otherProc);
  aProc.kill("SIGKILL");await waitExit(aProc);
  let afterCrash:Result|undefined;
  for(let attempt=0;attempt<30;attempt++){
   const contender=start(b);children.push(contender);afterCrash=await nextLine(contender);await waitExit(contender);
   if(afterCrash.name!=="AustraliaLockBusyError")break;
   await new Promise((resolve)=>setTimeout(resolve,50));
  }
  assert.equal(afterCrash?.name,"AustraliaRecoveryRequiredError","crash releases session, but new journal in another directory is refused");
  const resume=start(a);children.push(resume);const resumed=await nextLine(resume);assert.equal(resumed.status,"acquired");assert.equal(resumed.claimStatus,"active");
  resume.stdin.write("release\n");await waitExit(resume);
  const [row]=await db`SELECT journal_id::text,plan_digest,journal_file,status FROM australia_release_test_claims WHERE batch_id=${batchId}`;
  assert.equal(row.journal_id,aId);assert.equal(row.plan_digest,planDigest);assert.equal(row.journal_file,fs.realpathSync(aFile));assert.equal(row.status,"active");
 } finally {
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await waitExit(child)}
  await db`DELETE FROM australia_release_test_claims WHERE batch_id=ANY(${[batchId,otherBatch]})`.catch(()=>{});await db.end();fs.rmSync(tmp,{recursive:true,force:true});
 }
});

test("lock loss is detected and the work transaction remains independent",{skip:!url,timeout:15000},async()=>{
 const u=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname));assert.equal(u.pathname,"/tuji_au_test");
 const sql=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),other=postgres(url!,{max:1,prepare:false,onnotice:()=>{}});let lock:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
 try {
  const id=`au-loss-${randomBytes(6).toString("hex")}`;lock=await acquireAustralianTestBatchLock(url!,sql,id);
  const [work]=await sql.begin(async(tx)=>tx`SELECT pg_backend_pid() AS pid, 1 AS value`);assert.notEqual(Number(work.pid),lock.backendPid);assert.equal(work.value,1);await lock.assertHeld();
  const [terminated]=await other`SELECT pg_terminate_backend(${lock.backendPid}) AS ok`;assert.equal(terminated.ok,true);
  await assert.rejects(async()=>{await new Promise((resolve)=>setTimeout(resolve,100));await lock!.assertHeld()},/session|closed|terminated|connection/i);
  await lock.release();lock=undefined;
  const retry=await acquireAustralianTestBatchLock(url!,sql,id);await retry.assertHeld();await retry.release();
 } finally {if(lock)await lock.release().catch(()=>{});await other.end();await sql.end()}
});

test("claim binds plan, storage and journal identity; exceptions release the lock",{skip:!url,timeout:15000},async()=>{
 const u=new URL(url!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname));assert.equal(u.pathname,"/tuji_au_test");
 const sql=postgres(url!,{max:1,prepare:false,onnotice:()=>{}}),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"au-claim-test-"));
 const batchId=`au-claim-${randomBytes(6).toString("hex")}`;
 try {
  await installAustraliaTestClaimTable(url!,sql);
  await assert.rejects(withAustralianTestBatchLock(url!,sql,batchId,async()=>{throw new Error("injected failure")}),/injected failure/);
  const lock=await acquireAustralianTestBatchLock(url!,sql,batchId);
  try {
   const journalId=randomUUID(),planDigest="b".repeat(64),storageFingerprint="storage-target-test";
   const journalFile=createJournal(path.join(tmp,"original"),journalId,planDigest,storageFingerprint);
   const input={journalId,planDigest,storageFingerprint,journalFile};
   assert.equal((await lock.claimJournal(input)).status,"active");
   const changedPlan="c".repeat(64);const replacement=createJournal(path.join(tmp,"replacement"),journalId,changedPlan,storageFingerprint);
   await assert.rejects(lock.claimJournal({...input,planDigest:changedPlan,journalFile:replacement}),/resume its original claim/);
   const sameIdOtherPath=createJournal(path.join(tmp,"different-path"),journalId,planDigest,storageFingerprint);
   await assert.rejects(lock.claimJournal({...input,journalFile:sameIdOtherPath}),/resume its original claim/);
   const changedTarget=createJournal(path.join(tmp,"different-target"),journalId,planDigest,"storage-other");
   await assert.rejects(lock.claimJournal({...input,storageFingerprint:"storage-other",journalFile:changedTarget}),/resume its original claim/);
   await lock.markCompleted(input);
   assert.equal((await lock.claimJournal(input)).status,"completed");
   await assert.rejects(lock.markCompleted(input),/not active/);
  } finally {await lock.release()}
  const reacquired=await acquireAustralianTestBatchLock(url!,sql,batchId);await reacquired.assertHeld();await reacquired.release();await assert.rejects(reacquired.assertHeld(),/lost or released/);
 } finally {await sql`DELETE FROM australia_release_test_claims WHERE batch_id=${batchId}`.catch(()=>{});await sql.end();fs.rmSync(tmp,{recursive:true,force:true})}
});

test("lock keys are batch-stable and invalid identifiers are refused",()=>{
 assert.deepEqual(australianBatchLockKey("australia-atlas-2026-11"),australianBatchLockKey("australia-atlas-2026-11"));
 assert.notDeepEqual(australianBatchLockKey("australia-atlas-2026-11"),australianBatchLockKey("australia-atlas-2026-12"));
 assert.throws(()=>australianBatchLockKey("../release"),/invalid batch ID/);
});

test("test locks reject a multi-connection work pool",{skip:!url},async()=>{
 const pooled=postgres(url!,{max:2,prepare:false,onnotice:()=>{}});
 try{await assert.rejects(acquireAustralianTestBatchLock(url!,pooled,'australia-atlas-mixed-test'),/single work connection/)}finally{await pooled.end()}
});
