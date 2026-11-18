/** ISOLATED TEST ONLY: persistent pre-journal ownership, not a production
 * publishing lease and not fencing for in-flight DB or Storage requests. */
import fs from 'node:fs';import path from 'node:path';import postgres from 'postgres';
import {digest} from './plan';import {assertAustralianTestLockWork,australianBatchLockKey,installAustraliaTestClaimTable,type acquireAustralianTestBatchLock} from './australia-session-lock';
import type {AustraliaManifest,AustraliaRunDeps} from './australia-journal';
type Sql=ReturnType<typeof postgres>;type Lock=Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>;
const ownershipClients=new WeakMap<object,Sql>();
export function assertAustraliaTestOwnership(owner:unknown,sql:Sql):void{
 check(typeof owner==='object'&&owner!==null&&ownershipClients.get(owner)===sql,'untrusted ownership or different work connection');
}
/** One conservative test namespace for every Australian mixed-atlas revision. */
export const AUSTRALIAN_TEST_BATCH_ID='australia-atlas-mixed-test';
function check(v:unknown,m:string):asserts v{if(!v)throw new Error(m)}
function isolated(url:string,sql:Sql){const u=new URL(url);check(['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.pathname==='/tuji_au_test'&&sql.options.host.length===1&&sql.options.host[0]===u.hostname&&sql.options.port.length===1&&Number(sql.options.port[0])===Number(u.port||5432)&&sql.options.database==='tuji_au_test'&&sql.options.user===decodeURIComponent(u.username),'ownership requires matching isolated test DB')}
export async function installAustraliaTestOwnership(url:string,sql:Sql){isolated(url,sql);await installAustraliaTestClaimTable(url,sql);await sql`CREATE TABLE IF NOT EXISTS australia_test_journal_reservations(batch_id TEXT PRIMARY KEY REFERENCES australia_release_test_claims(batch_id), journal_id UUID NOT NULL, journal_file TEXT NOT NULL,initial_manifest TEXT NOT NULL,manifest_digest TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN ('reserved','active')))`}
function canonicalFile(file:string,journalId?:string){check(path.isAbsolute(file),'journal must have absolute path');const resolved=path.join(fs.realpathSync(path.dirname(file)),path.basename(file));if(journalId)check(path.basename(resolved)===`australia-apply-${journalId}.json`,'journal path does not match ID');if(fs.existsSync(resolved))check(fs.lstatSync(resolved).isFile()&&fs.realpathSync(resolved)===resolved,'journal must be a regular file');return resolved}
function manifestIdentity(manifest:AustraliaManifest,file:string){
 check(manifest.version===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.journalId)&&/^[a-f0-9]{64}$/.test(manifest.planDigest),'invalid journal ID or plan');
 check(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(manifest.target.storageFingerprint),'invalid storage fingerprint');return {journalFile:canonicalFile(file,manifest.journalId),journalId:manifest.journalId,planDigest:manifest.planDigest,storageFingerprint:manifest.target.storageFingerprint};
}
export function createAustraliaTestOwnership(url:string,sql:Sql,lock:Lock){
 isolated(url,sql);check(lock.batchId===AUSTRALIAN_TEST_BATCH_ID,'noncanonical Australian test batch ID');assertAustralianTestLockWork(lock,sql);
 async function held(tx:postgres.TransactionSql){const [a,b]=australianBatchLockKey(lock.batchId);const [r]=await tx`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND l.granted AND l.pid=${lock.backendPid} AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND l.classid=(${a}::bigint & 4294967295)::oid AND l.objid=(${b}::bigint & 4294967295)::oid AND l.objsubid=2 AND a.backend_start::text=${lock.backendStarted} AND a.application_name=${lock.sessionChallenge}) AS ok`;check(r.ok,'owner lock lost or different lock session')}
 async function assertOwner(){await lock.assertHeld();await sql.begin('read only',async(tx)=>{await held(tx)});await lock.assertHeld()}
 async function row(){const rows=await sql`SELECT c.journal_id::text,c.plan_digest,c.storage_fingerprint,c.journal_file,c.status,r.journal_id::text AS reserved_id,r.journal_file AS reserved_file,r.initial_manifest,r.manifest_digest,r.phase FROM australia_release_test_claims c LEFT JOIN australia_test_journal_reservations r USING(batch_id) WHERE c.batch_id=${lock.batchId}`;check(rows.length===1&&rows[0].initial_manifest&&rows[0].status==='active','original ownership claim missing');const v=rows[0];check(v.journal_id===v.reserved_id&&v.journal_file===v.reserved_file,'reservation differs from original claim');const initial=JSON.parse(v.initial_manifest);check(v.manifest_digest===digest(initial),'stored initial manifest differs from digest');return {journal_id:String(v.journal_id),journal_file:String(v.journal_file),plan_digest:String(v.plan_digest),storage_fingerprint:String(v.storage_fingerprint),manifest_digest:String(v.manifest_digest),phase:String(v.phase),initial_manifest:initial as AustraliaManifest}}
 const owner={
  assertHeld:assertOwner,
  async reserve(file:string,manifest:AustraliaManifest){
   await assertOwner();const identity=manifestIdentity(manifest,file);check(manifest.status==='prepared'&&Object.keys(manifest.resolvedExampleIds).length===0,'only untouched prepared journal may be reserved');
   await sql.begin(async(tx)=>{await held(tx);const inserted=await tx`INSERT INTO australia_release_test_claims(batch_id,journal_id,plan_digest,storage_fingerprint,journal_file,status) VALUES (${lock.batchId},${identity.journalId},${identity.planDigest},${identity.storageFingerprint},${identity.journalFile},'active') ON CONFLICT DO NOTHING RETURNING batch_id`;check(inserted.length===1,'batch already claimed; recover original journal');await tx`INSERT INTO australia_test_journal_reservations(batch_id,journal_id,journal_file,initial_manifest,manifest_digest,phase) VALUES (${lock.batchId},${identity.journalId},${identity.journalFile},${JSON.stringify(manifest)},${digest(manifest)},'reserved')`;await held(tx)});await assertOwner();
  },
  async prepareResume(file:string){
   await assertOwner();const r=await row();const actual=canonicalFile(file,r.journal_id);check(actual===r.journal_file,'resume path is not the original journal');
   if(!fs.existsSync(actual)){check(r.phase==='reserved','active journal is missing; manual reconciliation required');const initial=r.initial_manifest as AustraliaManifest;const id=manifestIdentity(initial,actual);check(id.journalId===r.journal_id&&id.planDigest===r.plan_digest&&id.storageFingerprint===r.storage_fingerprint,'stored original journal identity differs');fs.writeFileSync(actual,`${JSON.stringify(initial,null,2)}\n`,{flag:'wx'});}
   await assertOwner();
  },
  async activate(file:string,manifest:AustraliaManifest){
   await assertOwner();const id=manifestIdentity(manifest,file);const r=await row();check(id.journalId===r.journal_id&&id.journalFile===r.journal_file&&id.planDigest===r.plan_digest&&id.storageFingerprint===r.storage_fingerprint,'journal identity differs from original claim');
   await sql.begin(async(tx)=>{await held(tx);const rows=await tx`SELECT journal_id::text,phase,manifest_digest FROM australia_test_journal_reservations WHERE batch_id=${lock.batchId} FOR UPDATE`;check(rows.length===1&&rows[0].journal_id===id.journalId,'ownership reservation changed');if(rows[0].phase==='reserved'){check(digest(manifest)===rows[0].manifest_digest,'initial journal differs from durable reservation');await tx`UPDATE australia_test_journal_reservations SET phase='active' WHERE batch_id=${lock.batchId}`;}else check(rows[0].phase==='active','invalid ownership phase');await held(tx)});await assertOwner();
  },
  /** The caller holds this row lock through commit/rollback. A successor's
   * activate waits for the old transaction before inspecting its receipt. */
  async assertTransaction(tx:postgres.TransactionSql,manifest:AustraliaManifest){
   await held(tx);const rows=await tx`SELECT c.journal_id::text,c.plan_digest,c.storage_fingerprint,c.status,r.phase FROM australia_release_test_claims c JOIN australia_test_journal_reservations r USING(batch_id) WHERE c.batch_id=${lock.batchId} FOR UPDATE OF r`;
   check(rows.length===1&&rows[0].journal_id===manifest.journalId&&rows[0].plan_digest===manifest.planDigest&&rows[0].storage_fingerprint===manifest.target.storageFingerprint&&rows[0].status==='active'&&rows[0].phase==='active','transaction ownership differs from original journal');await held(tx);
  },
  /** Discover the original ID/path after crash without manufacturing a claim. */
  async originalJournal(){await assertOwner();const r=await row();await assertOwner();return {journalId:r.journal_id,manifestFile:r.journal_file,phase:r.phase as 'reserved'|'active'}},
 } satisfies NonNullable<AustraliaRunDeps['testOwnership']>&{assertTransaction:(tx:postgres.TransactionSql,manifest:AustraliaManifest)=>Promise<void>;originalJournal:()=>Promise<{journalId:string;manifestFile:string;phase:'reserved'|'active'}>};
 ownershipClients.set(owner,sql);return Object.freeze(owner);
}
