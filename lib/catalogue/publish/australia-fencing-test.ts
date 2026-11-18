/**
 * ISOLATED-TEST ONLY fencing experiment. Not connected to the publisher and
 * not a production adapter. The durable DB journal is authoritative; a local
 * JSON file may be a mirror but must not be trusted for ownership or status.
 * A Storage request already in flight cannot be recalled by a PostgreSQL lock.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { assertAustralianTestLockWork, australianBatchLockKey, type acquireAustralianTestBatchLock } from "./australia-session-lock";

type Sql=ReturnType<typeof postgres>;
type Tx=postgres.TransactionSql;
type Lock=Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>;
type Claim={journalId:string;planDigest:string;storageFingerprint:string;journalFile:string};
export type TestFenceLease={batchId:string;journalId:string;planDigest:string;storageFingerprint:string;journalFile:string;epoch:number;ownerPid:number;backendStarted:string;sessionChallenge:string;workSql:Sql;lock:Lock};
export type TestStorage={putIfAbsent:(key:string,bytes:Buffer,contentType:string)=>Promise<"created"|"exists">;fetch:(key:string)=>Promise<{bytes:Buffer;contentType:string}|null>};
export type TestObject={key:string;bytes:Buffer;sha256:string;mimeType:string};
export class StaleAustraliaFenceError extends Error {}
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
function ensure(ok:unknown,msg:string):asserts ok {if(!ok)throw new Error(msg)}
function isolated(url:string,sql:Sql){
 const u=new URL(url);ensure(["127.0.0.1","localhost","[::1]"].includes(u.hostname)&&u.pathname==="/tuji_au_test"&&sql.options.host.length===1&&sql.options.host[0]===u.hostname&&sql.options.port.length===1&&Number(sql.options.port[0])===Number(u.port||5432)&&sql.options.database==="tuji_au_test"&&sql.options.user===decodeURIComponent(u.username),"fencing prototype requires matching localhost test database");
}
export async function installAustraliaTestFenceTables(url:string,sql:Sql){
 isolated(url,sql);const [db]=await sql`SELECT current_database() AS name,pg_is_in_recovery() AS replica`;ensure(db.name==="tuji_au_test"&&!db.replica,"unexpected test database");
 await sql`CREATE TABLE IF NOT EXISTS australia_fence_test_journals (
  batch_id TEXT PRIMARY KEY,journal_id UUID NOT NULL,plan_digest TEXT NOT NULL,storage_fingerprint TEXT NOT NULL,journal_file TEXT NOT NULL,
  epoch BIGINT NOT NULL,owner_pid INT NOT NULL,backend_started TEXT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,
  phase TEXT NOT NULL CHECK (phase IN ('staging','db-committed'))
 )`;
 await sql`CREATE TABLE IF NOT EXISTS australia_fence_test_objects (
  batch_id TEXT NOT NULL REFERENCES australia_fence_test_journals(batch_id) ON DELETE CASCADE,object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,bytes BIGINT NOT NULL,mime_type TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('intent','verified')),
  verified_epoch BIGINT,PRIMARY KEY(batch_id,object_key)
 )`;
}
async function assertSession(tx:Tx,lease:Pick<TestFenceLease,"batchId"|"ownerPid"|"backendStarted"|"sessionChallenge">){
 const [key1,key2]=australianBatchLockKey(lease.batchId);
 const [state]=await tx`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
  WHERE l.locktype='advisory' AND l.granted AND l.pid=${lease.ownerPid} AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
   AND l.classid=(${key1}::bigint & 4294967295)::oid AND l.objid=(${key2}::bigint & 4294967295)::oid AND l.objsubid=2
   AND a.backend_start::text=${lease.backendStarted} AND a.application_name=${lease.sessionChallenge}) AS held`;
 if(!state.held)throw new StaleAustraliaFenceError("owner advisory-lock session is gone");
}
async function journalForUpdate(tx:Tx,lease:TestFenceLease,phase="staging"){
 const rows=await tx`SELECT batch_id,journal_id::text,plan_digest,storage_fingerprint,journal_file,epoch,owner_pid,backend_started,revision,phase
  FROM australia_fence_test_journals WHERE batch_id=${lease.batchId} FOR UPDATE`;
 const row=rows[0];
 if(rows.length!==1||row.journal_id!==lease.journalId||row.plan_digest!==lease.planDigest||row.storage_fingerprint!==lease.storageFingerprint||
  row.journal_file!==lease.journalFile||Number(row.epoch)!==lease.epoch||row.owner_pid!==lease.ownerPid||row.backend_started!==lease.backendStarted||row.phase!==phase)
  throw new StaleAustraliaFenceError("stale generation, different journal or non-writable phase");
 await assertSession(tx,lease);return row;
}
/** Take over only the same original claim after acquiring a new session lock.
 * Updating epoch under a row lock serializes against in-flight DB transactions. */
export async function acquireAustraliaTestFence(url:string,workSql:Sql,lock:Lock,input:Claim):Promise<TestFenceLease>{
 isolated(url,workSql);assertAustralianTestLockWork(lock,workSql);await lock.assertHeld();const claim=await lock.claimJournal(input);
 ensure(claim.status==='active',"completed original claim cannot be used as a new staging run");
 const journalFile=fs.realpathSync(path.resolve(input.journalFile));
 const leaseBase={batchId:lock.batchId,journalId:input.journalId,planDigest:input.planDigest,storageFingerprint:input.storageFingerprint,journalFile,ownerPid:lock.backendPid,backendStarted:"",sessionChallenge:lock.sessionChallenge,workSql,lock};
 const result=await workSql.begin(async(tx)=>{
  const [session]=await tx`SELECT backend_start::text AS started FROM pg_stat_activity WHERE pid=${lock.backendPid}`;
  ensure(session?.started,"lock backend unavailable");const trial={...leaseBase,backendStarted:session.started};await assertSession(tx,trial);
  const rows=await tx`SELECT journal_id::text,plan_digest,storage_fingerprint,journal_file,epoch,phase FROM australia_fence_test_journals WHERE batch_id=${lock.batchId} FOR UPDATE`;
  let epoch:number;
  if(rows.length===0){epoch=1;await tx`INSERT INTO australia_fence_test_journals (batch_id,journal_id,plan_digest,storage_fingerprint,journal_file,epoch,owner_pid,backend_started,phase)
    VALUES (${lock.batchId},${input.journalId},${input.planDigest},${input.storageFingerprint},${journalFile},${epoch},${lock.backendPid},${session.started},'staging')`;}
  else {const row=rows[0];ensure(row.journal_id===input.journalId&&row.plan_digest===input.planDigest&&row.storage_fingerprint===input.storageFingerprint&&row.journal_file===journalFile,"fence journal does not match original claim");
    ensure(row.phase==='staging',"database commit already recorded; verify and recover instead of staging again");epoch=Number(row.epoch)+1;ensure(Number.isSafeInteger(epoch),"epoch overflow");
    await tx`UPDATE australia_fence_test_journals SET epoch=${epoch},owner_pid=${lock.backendPid},backend_started=${session.started} WHERE batch_id=${lock.batchId}`;}
  await assertSession(tx,trial);return {epoch,backendStarted:session.started};
 });
 return {...leaseBase,...result};
}
async function withLeaseTx<T>(lease:TestFenceLease,body:(tx:Tx)=>Promise<T>){
 return lease.workSql.begin(async(tx)=>{await journalForUpdate(tx,lease);const result=await body(tx);await assertSession(tx,lease);return result;});
}
function verifySpec(object:TestObject){
 ensure(/^[a-f0-9]{64}$/.test(object.sha256)&&hash(object.bytes)===object.sha256&&object.bytes.length>0,"object bytes/hash mismatch");
 ensure(object.key.endsWith(`/${object.sha256}.mp3`)||object.key.endsWith(`/${object.sha256}.webp`),"object path must contain its full content hash");
 ensure((object.key.endsWith('.mp3')&&object.mimeType==='audio/mpeg')||(object.key.endsWith('.webp')&&object.mimeType==='image/webp'),"invalid MIME");
}
/** Journal the intent before any public object request. */
export async function recordAustraliaTestObjectIntent(lease:TestFenceLease,object:TestObject){
 verifySpec(object);await withLeaseTx(lease,async(tx)=>{
  await tx`INSERT INTO australia_fence_test_objects(batch_id,object_key,sha256,bytes,mime_type,status)
   VALUES (${lease.batchId},${object.key},${object.sha256},${object.bytes.length},${object.mimeType},'intent') ON CONFLICT DO NOTHING`;
  const rows=await tx`SELECT sha256,bytes,mime_type FROM australia_fence_test_objects WHERE batch_id=${lease.batchId} AND object_key=${object.key}`;
  ensure(rows.length===1&&rows[0].sha256===object.sha256&&Number(rows[0].bytes)===object.bytes.length&&rows[0].mime_type===object.mimeType,"object intent differs from original");
  await tx`UPDATE australia_fence_test_journals SET revision=revision+1 WHERE batch_id=${lease.batchId}`;
 });
}
/** Fetch the complete object, then CAS the DB journal under the current epoch.
 * An old owner may finish a GET, but it cannot mark a newer journal verified. */
export async function verifyAustraliaTestObject(lease:TestFenceLease,object:TestObject,storage:TestStorage){
 verifySpec(object);const actual=await storage.fetch(object.key);
 ensure(actual&&actual.contentType===object.mimeType&&actual.bytes.length===object.bytes.length&&hash(actual.bytes)===object.sha256,"remote object does not match intent");
 await withLeaseTx(lease,async(tx)=>{
  const rows=await tx`UPDATE australia_fence_test_objects SET status='verified',verified_epoch=${lease.epoch}
   WHERE batch_id=${lease.batchId} AND object_key=${object.key} AND sha256=${object.sha256} AND bytes=${object.bytes.length} AND mime_type=${object.mimeType} RETURNING object_key`;
  ensure(rows.length===1,"object intent missing or changed");
  await tx`UPDATE australia_fence_test_journals SET revision=revision+1 WHERE batch_id=${lease.batchId}`;
 });
}
/** PUT is intentionally outside the DB transaction. It can finish after the
 * lock dies. Atomic create-only plus a mandatory complete readback makes that
 * recoverable; only the current DB epoch may acknowledge it. */
export async function stageAustraliaTestObject(lease:TestFenceLease,object:TestObject,storage:TestStorage){
 await recordAustraliaTestObjectIntent(lease,object);
 await storage.putIfAbsent(object.key,object.bytes,object.mimeType);
 await verifyAustraliaTestObject(lease,object,storage);
}
/** Data writes and a durable commit marker use the same transaction. A new
 * owner cannot advance the epoch while this transaction owns the journal row. */
export async function commitAustraliaTestBatch(lease:TestFenceLease,expectedKeys:string[],write:(tx:Tx)=>Promise<void>){
 ensure(new Set(expectedKeys).size===expectedKeys.length&&expectedKeys.length>0,"invalid object coverage");
 await withLeaseTx(lease,async(tx)=>{
  const rows=await tx`SELECT object_key,status,verified_epoch FROM australia_fence_test_objects WHERE batch_id=${lease.batchId} ORDER BY object_key`;
  ensure(rows.length===expectedKeys.length&&rows.every((r)=>r.status==='verified'&&Number(r.verified_epoch)===lease.epoch)&&JSON.stringify(rows.map((r)=>r.object_key))===JSON.stringify([...expectedKeys].sort()),"object coverage incomplete or unverified for current epoch");
  await write(tx);
  await assertSession(tx,lease);
  const updated=await tx`UPDATE australia_fence_test_journals SET phase='db-committed',revision=revision+1 WHERE batch_id=${lease.batchId} AND epoch=${lease.epoch} AND owner_pid=${lease.ownerPid} AND phase='staging' RETURNING batch_id`;
  if(updated.length!==1)throw new StaleAustraliaFenceError("database commit fence changed");
 });
}
