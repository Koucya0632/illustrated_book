/** Child-process fixture for the isolated PostgreSQL advisory-lock test. */
import postgres from "postgres";
import { acquireAustralianTestBatchLock } from "../../lib/catalogue/publish/australia-session-lock";

async function main() {
const raw=process.env.AU_LOCK_TEST_PAYLOAD;
if(!raw) throw new Error("isolated test payload missing");
const input=JSON.parse(raw) as {databaseUrl:string;batchId:string;journalId:string;planDigest:string;storageFingerprint:string;journalFile:string};
const sql=postgres(input.databaseUrl,{max:1,prepare:false,onnotice:()=>{}});
let lock:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
try {
  lock=await acquireAustralianTestBatchLock(input.databaseUrl,sql,input.batchId);
  const claim=await lock.claimJournal(input);
  const [work]=await sql`SELECT pg_backend_pid() AS pid`;
  process.stdout.write(`${JSON.stringify({status:"acquired",lockPid:lock.backendPid,workPid:work.pid,claimStatus:claim.status})}\n`);
  await new Promise<void>((resolve)=>{process.stdin.once("data",()=>resolve());process.stdin.resume();});
  process.stdin.pause();
  await lock.release();lock=undefined;
  await sql.end();
  process.stdout.write(`${JSON.stringify({status:"released"})}\n`);
} catch(error) {
  process.stdout.write(`${JSON.stringify({status:"error",name:error instanceof Error?error.constructor.name:"Error",message:error instanceof Error?error.message:String(error)})}\n`);
  if(lock) await lock.release().catch(()=>{});
  await sql.end();process.exitCode=1;
}

}
main().catch((error)=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1});
