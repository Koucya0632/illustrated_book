import postgres from 'postgres';
import {acquireAustralianTestBatchLock} from '../../lib/catalogue/publish/australia-session-lock';
import {createAustraliaTestOwnership} from '../../lib/catalogue/publish/australia-ownership-test';
import type {AustraliaManifest} from '../../lib/catalogue/publish/australia-journal';
async function main(){
const input=JSON.parse(process.env.AU_OWNERSHIP_WORKER_PAYLOAD!);const sql=postgres(input.url,{max:1,prepare:false,onnotice:()=>{}});
try{
 const lock=await acquireAustralianTestBatchLock(input.url,sql,input.batch),owner=createAustraliaTestOwnership(input.url,sql,lock);
 await owner.reserve(input.file,input.manifest as AustraliaManifest);
 process.stdout.write(JSON.stringify({status:'reserved',pid:lock.backendPid})+'\n');
 process.stdin.resume();process.stdin.once('data',async()=>{await lock.release();await sql.end();process.exit(0)});
}catch(error){process.stdout.write(JSON.stringify({status:'error',name:(error as Error).name})+'\n');await sql.end();process.exit(1)}

}
void main();
