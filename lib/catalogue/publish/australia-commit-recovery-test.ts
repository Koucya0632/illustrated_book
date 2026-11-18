/** ISOLATED TEST ONLY. A durable receipt experiment, not a production adapter.
 * Receipt, written examples, and the fenced commit marker must share a DB
 * transaction. Recovery only inspects state; it never retries or publishes. */
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { assertAustralianTestLockWork, type acquireAustralianTestBatchLock } from './australia-session-lock';
import { type TestFenceLease, type TestStorage } from './australia-fencing-test';

type Sql=ReturnType<typeof postgres>;
type Tx=postgres.TransactionSql;
type Lock=Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>;
export type ExpectedExample={wordId:string;sortOrder:number;text:string};
export type ExpectedObject={key:string;sha256:string;bytes:number;mimeType:string};
export type RecoveryInput={journalId:string;planDigest:string;storageFingerprint:string;journalFile:string;examples:ExpectedExample[];objects:ExpectedObject[]};
type Snapshot=ExpectedExample&{exampleId:string};
const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
function requireValue(value:unknown,message:string):asserts value {if(!value)throw new Error(message)}
function isolated(url:string,sql:Sql){const u=new URL(url);requireValue(['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.pathname==='/tuji_au_test'&&sql.options.host.length===1&&sql.options.host[0]===u.hostname&&sql.options.port.length===1&&Number(sql.options.port[0])===Number(u.port||5432)&&sql.options.database==='tuji_au_test'&&sql.options.user===decodeURIComponent(u.username),'requires matching isolated localhost database')}
function exampleKey(x:ExpectedExample){return `${x.wordId}\0${x.sortOrder}`}
function normalizeExamples(examples:ExpectedExample[]){
 requireValue(examples.length>0,'empty expected examples');const sorted=examples.map(x=>({wordId:x.wordId,sortOrder:x.sortOrder,text:x.text})).sort((a,b)=>exampleKey(a).localeCompare(exampleKey(b)));
 requireValue(sorted.every(x=>/^[a-z0-9-]+$/.test(x.wordId)&&Number.isInteger(x.sortOrder)&&x.sortOrder>=0&&x.text.length>0)&&new Set(sorted.map(exampleKey)).size===sorted.length,'invalid or duplicate expected examples');return sorted;
}
function normalizeObjects(objects:ExpectedObject[]){
 requireValue(objects.length>0,'empty expected objects');const sorted=objects.map(x=>({key:x.key,sha256:x.sha256,bytes:x.bytes,mimeType:x.mimeType})).sort((a,b)=>a.key.localeCompare(b.key));
 requireValue(sorted.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)&&Number.isSafeInteger(x.bytes)&&x.bytes>0&&['audio/mpeg','image/webp'].includes(x.mimeType)&&x.key.endsWith(`/${x.sha256}.${x.mimeType==='audio/mpeg'?'mp3':'webp'}`))&&new Set(sorted.map(x=>x.key)).size===sorted.length,'invalid or duplicate expected objects');return sorted;
}
function validateSnapshot(rows:Snapshot[],expected:ExpectedExample[]){
 const ordered=rows.map(x=>({wordId:x.wordId,sortOrder:Number(x.sortOrder),text:x.text,exampleId:String(x.exampleId)})).sort((a,b)=>exampleKey(a).localeCompare(exampleKey(b)));
 requireValue(JSON.stringify(ordered.map(({wordId,sortOrder,text})=>({wordId,sortOrder,text})))===JSON.stringify(normalizeExamples(expected)),'example rows differ from reviewed expected set');
 requireValue(ordered.every(x=>/^\d+$/.test(x.exampleId))&&new Set(ordered.map(x=>x.exampleId)).size===ordered.length,'example IDs invalid or duplicated');return ordered;
}
async function readExamples(sql:Tx,batchId:string):Promise<Snapshot[]>{
 const rows=await sql`SELECT word_id,sort_order,example_text,id::text FROM australia_recovery_test_examples WHERE batch_id=${batchId}`;
 return rows.map(x=>({wordId:x.word_id,sortOrder:x.sort_order,text:x.example_text,exampleId:x.id}));
}
export async function installAustraliaRecoveryTestTables(url:string,sql:Sql){
 isolated(url,sql);const [identity]=await sql`SELECT current_database() AS db,pg_is_in_recovery() AS replica`;requireValue(identity.db==='tuji_au_test'&&!identity.replica,'wrong isolated database');
 await sql`CREATE TABLE IF NOT EXISTS australia_recovery_test_examples(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,batch_id TEXT NOT NULL,word_id TEXT NOT NULL,sort_order INT NOT NULL,example_text TEXT NOT NULL,UNIQUE(batch_id,word_id,sort_order))`;
 await sql`CREATE TABLE IF NOT EXISTS australia_recovery_test_receipts(batch_id TEXT PRIMARY KEY REFERENCES australia_fence_test_journals(batch_id),journal_id UUID NOT NULL,plan_digest TEXT NOT NULL,storage_fingerprint TEXT NOT NULL,epoch BIGINT NOT NULL,payload JSONB NOT NULL,payload_sha256 TEXT NOT NULL)`;
}
/** Called inside commitAustraliaTestBatch's work callback, after inserts. */
export async function writeAustraliaTestReceipt(tx:Tx,lease:TestFenceLease,input:Pick<RecoveryInput,'examples'|'objects'>){
 const examples=validateSnapshot(await readExamples(tx,lease.batchId),input.examples),objects=normalizeObjects(input.objects);
 const rows=await tx`SELECT journal_id::text,plan_digest,storage_fingerprint,epoch,owner_pid,phase FROM australia_fence_test_journals WHERE batch_id=${lease.batchId}`;
 const row=rows[0];requireValue(rows.length===1&&row.journal_id===lease.journalId&&row.plan_digest===lease.planDigest&&row.storage_fingerprint===lease.storageFingerprint&&Number(row.epoch)===lease.epoch&&row.owner_pid===lease.ownerPid&&row.phase==='staging','wrong fenced journal');
 const staged=await tx`SELECT object_key,sha256,bytes,mime_type,status,verified_epoch FROM australia_fence_test_objects WHERE batch_id=${lease.batchId}`;
 const mapped=staged.map(x=>({key:x.object_key,sha256:x.sha256,bytes:Number(x.bytes),mimeType:x.mime_type})).sort((a,b)=>a.key.localeCompare(b.key));
 requireValue(JSON.stringify(mapped)===JSON.stringify(objects)&&staged.every(x=>x.status==='verified'&&Number(x.verified_epoch)===lease.epoch),'receipt objects not fully verified in this epoch');
 const payload={version:1,batchId:lease.batchId,journalId:lease.journalId,planDigest:lease.planDigest,storageFingerprint:lease.storageFingerprint,epoch:lease.epoch,examples,objects};
 const payloadSha256=digest(JSON.stringify(payload));
 await tx`INSERT INTO australia_recovery_test_receipts(batch_id,journal_id,plan_digest,storage_fingerprint,epoch,payload,payload_sha256) VALUES (${lease.batchId},${lease.journalId},${lease.planDigest},${lease.storageFingerprint},${lease.epoch},${tx.json(payload)},${payloadSha256})`;
 return {payload,payloadSha256};
}
/** Read-only, requires the same original journal and an exclusive test batch
 * lock. A successful result is a point-in-time observation, not a release. */
export async function inspectAustraliaTestCommittedBatch(url:string,sql:Sql,lock:Lock,input:RecoveryInput,storage:TestStorage){
 isolated(url,sql);assertAustralianTestLockWork(lock,sql);await lock.assertHeld();await lock.verifyOriginalClaim(input);const expected=normalizeExamples(input.examples),objects=normalizeObjects(input.objects);
 const inspect=async()=>sql.begin('isolation level repeatable read read only',async(tx)=>{
  const rows=await tx`SELECT j.journal_id::text,j.plan_digest,j.storage_fingerprint,j.epoch,j.phase,r.journal_id::text AS receipt_journal,r.plan_digest AS receipt_plan,r.storage_fingerprint AS receipt_storage,r.epoch AS receipt_epoch,r.payload,r.payload_sha256 FROM australia_fence_test_journals j LEFT JOIN australia_recovery_test_receipts r ON r.batch_id=j.batch_id WHERE j.batch_id=${lock.batchId}`;
  requireValue(rows.length===1,'journal missing');const row=rows[0];requireValue(row.phase==='db-committed'&&row.journal_id===input.journalId&&row.plan_digest===input.planDigest&&row.storage_fingerprint===input.storageFingerprint,'not the original committed journal');
  requireValue(row.payload&&row.receipt_journal===input.journalId&&row.receipt_plan===input.planDigest&&row.receipt_storage===input.storageFingerprint&&Number(row.receipt_epoch)===Number(row.epoch),'receipt missing or mismatched');
  const payload=row.payload;requireValue(payload.version===1&&payload.batchId===lock.batchId&&payload.journalId===input.journalId&&payload.planDigest===input.planDigest&&payload.storageFingerprint===input.storageFingerprint&&Number(payload.epoch)===Number(row.epoch),'receipt payload identity mismatch');
  const actual=validateSnapshot(await readExamples(tx,lock.batchId),expected);
  requireValue(Array.isArray(payload.examples)&&Array.isArray(payload.objects),'malformed receipt payload');
  requireValue(JSON.stringify(validateSnapshot(payload.examples,expected))===JSON.stringify(actual)&&JSON.stringify(normalizeObjects(payload.objects))===JSON.stringify(objects),'receipt does not match current rows or reviewed objects');
  const canonical={version:1,batchId:lock.batchId,journalId:input.journalId,planDigest:input.planDigest,storageFingerprint:input.storageFingerprint,epoch:Number(row.epoch),examples:actual,objects};
  requireValue(row.payload_sha256===digest(JSON.stringify(canonical)),'receipt digest mismatch');return {payloadSha256:row.payload_sha256,examples:actual,objects};
 });
 const first=await inspect();
 for(const object of first.objects){const found=await storage.fetch(object.key);requireValue(found&&found.bytes.length===object.bytes&&found.contentType===object.mimeType&&digest(found.bytes)===object.sha256,`object mismatch: ${object.key}`)}
 await lock.verifyOriginalClaim(input);const last=await inspect();requireValue(first.payloadSha256===last.payloadSha256&&JSON.stringify(first.examples)===JSON.stringify(last.examples),'database changed during recovery inspection');await lock.verifyOriginalClaim(input);
 return {status:'inspected-not-published' as const,receiptSha256:last.payloadSha256,examples:last.examples,objectCount:last.objects.length};
}
