import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { mintAdminToken, verifyAdminToken } from '../lib/auth';
import { configuredProjectMatches, databaseIdentityDigest, inspectDatabaseTarget, mintDiagnosticActivation, validDiagnosticActivation, runTargetDiagnostic, type TargetDiagnosticSql } from '../lib/database-target-diagnostic';

const ref='abcdefghijklmnopqrst', other='zyxwvutsrqponmlkjihg';
const now=1_800_000_000_000;
const key='d'.repeat(64),digest='a'.repeat(64),activation=mintDiagnosticActivation(key,ref,digest,now-1000,2000);
const base={now:()=>now,production:true,activation,key,keyFrom:String(now-5000),keyExpires:String(now+300_000),ref,expectedDigest:digest,authorized:async()=>true,sql:()=>null};

test('only recognized actual driver targets identify a Supabase project',()=>{
 assert.equal(configuredProjectMatches([`db.${ref}.supabase.co`],'postgres',ref),true);
 assert.equal(configuredProjectMatches([`db.${other}.supabase.co`],'postgres',ref),false);
 assert.equal(configuredProjectMatches(['aws-0-region.pooler.supabase.com'],`postgres.${ref}`,ref),true);
 assert.equal(configuredProjectMatches(['aws-0-region.pooler.supabase.com'],`app_user.${other}`,ref),false);
 for(const hosts of [[],['evil.supabase.co'],['aws-0-region.pooler.supabase.com.evil.invalid'],[`db.${ref}.supabase.co`,`db.${other}.supabase.co`]]) assert.equal(configuredProjectMatches(hosts,`postgres.${ref}`,ref),null);
 assert.equal(configuredProjectMatches(['aws-0-region.pooler.supabase.com'],'postgres',ref),null);
});

test('activation is signed, time-limited and never extends past the key cutoff',()=>{
 const verify=(v:string,k=key,from=String(now-5000),until=String(now+300_000),r=ref,d=digest,t=now)=>validDiagnosticActivation(v,k,from,until,r,d,t);
 assert.equal(verify(activation),true);assert.equal(verify(activation,key,String(now-5000),String(now+300_000),ref,digest,now+1000),false);
 assert.equal(verify(activation,'e'.repeat(64)),false);assert.equal(verify(activation,key,String(now-5000),String(now+500)),false);
 assert.equal(verify(mintDiagnosticActivation(key,ref,digest,now+1)),false);assert.equal(verify(activation+'.extra'),false);
 assert.equal(verify(activation,key,String(now-5000),String(now+300_000),other),false);
 assert.equal(verify(activation,key,String(now-5000),String(now+300_000),ref,'0'.repeat(64)),false);
 assert.equal(verify(activation.replace(ref,other),key,String(now-5000),String(now+300_000),other),false);
 assert.equal(verify(activation.replace(digest,'0'.repeat(64)),key,String(now-5000),String(now+300_000),ref,'0'.repeat(64)),false);
 assert.equal(verify(activation,key,String(now-5000),String(now+90_000_000)),false);
 assert.throws(()=>mintDiagnosticActivation(key,ref,digest,now,300_001));
 assert.notEqual(mintDiagnosticActivation(key,ref,digest,now),mintDiagnosticActivation(key,ref,digest,now));
});

test('closed by default, restricted to production, short-lived activation and actual admin auth',async()=>{
 let access=0;const original=process.env.ADMIN_SECRET;process.env.ADMIN_SECRET='local synthetic diagnostic admin signing key';
 try {
  const token=await mintAdminToken();const auth=async()=>verifyAdminToken(token);
  const sql=()=>{access++;return null};
  for(const patch of [{production:false},{activation:undefined},{key:undefined},{keyFrom:undefined},{keyExpires:undefined},{keyExpires:String(now)},{activation:activation+'x'},{ref:undefined},{ref:other},{expectedDigest:'not-valid'},{expectedDigest:'0'.repeat(64)}]) assert.equal(await runTargetDiagnostic({...base,...patch,authorized:auth,sql}),null);
  assert.equal(await runTargetDiagnostic({...base,authorized:()=>verifyAdminToken('bad'),sql}),null);
  assert.equal(await runTargetDiagnostic({...base,authorized:async()=>{throw new Error('synthetic auth failure')},sql}),null);
  assert.equal(access,0);
  assert.deepEqual(await runTargetDiagnostic({...base,authorized:auth,sql}),{configuredRefMatches:null,databaseIdentityMatches:null});assert.equal(access,1);
  let tick=now;assert.equal(await runTargetDiagnostic({...base,now:()=>tick,authorized:async()=>{tick=now+1001;return true},sql}),null);assert.equal(access,1);
  tick=now;
  const slowSql={options:{host:[`db.${ref}.supabase.co`],user:'postgres'},begin:async()=>{tick=now+1001;return []}} as unknown as TargetDiagnosticSql;
  assert.equal(await runTargetDiagnostic({...base,now:()=>tick,authorized:auth,sql:()=>slowSql}),null);
 }finally{if(original===undefined)delete process.env.ADMIN_SECRET;else process.env.ADMIN_SECRET=original;}
});

test('database exceptions are suppressed and never returned',async()=>{
 const sql={options:{host:[`db.${ref}.supabase.co`],user:'postgres'},begin:async()=>{throw new Error('synthetic secret must not appear')}} as TargetDiagnosticSql;
 const result=await runTargetDiagnostic({...base,sql:()=>sql});assert.deepEqual(result,{configuredRefMatches:true,databaseIdentityMatches:null});assert.ok(!JSON.stringify(result).includes('synthetic secret'));
});

const databaseUrl=process.env.TUJI_DIAGNOSTIC_TEST_DATABASE_URL;
test('real PostgreSQL read-only identity comparison matches and rejects another digest',{skip:!databaseUrl},async()=>{
 const parsed=new URL(databaseUrl!);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.pathname,'/tuji_diagnostic_test');
 const sql=postgres(databaseUrl!,{max:1,connect_timeout:3});
 const candidate=postgres(databaseUrl!,{max:1,connect_timeout:3});
 try{
  const [row]=await candidate`select system_identifier::text as system_id,current_database()::text as database_name from pg_catalog.pg_control_system()`;
  const digest=databaseIdentityDigest(row.system_id,row.database_name);
  const live=sql as unknown as TargetDiagnosticSql;
  assert.deepEqual(await inspectDatabaseTarget(live,ref,digest),{configuredRefMatches:null,databaseIdentityMatches:true});
  assert.deepEqual(await inspectDatabaseTarget(live,ref,'0'.repeat(64)),{configuredRefMatches:null,databaseIdentityMatches:false});
  await sql`drop role if exists tuji_diagnostic_reader`;
  await sql`create role tuji_diagnostic_reader login`;
  await sql`revoke execute on function pg_catalog.pg_control_system() from public`;
  const restrictedUrl=new URL(databaseUrl!);restrictedUrl.username='tuji_diagnostic_reader';
  const restricted=postgres(restrictedUrl.toString(),{max:1,connect_timeout:3});
  try { assert.deepEqual(await inspectDatabaseTarget(restricted as unknown as TargetDiagnosticSql,ref,digest),{configuredRefMatches:null,databaseIdentityMatches:null}); }
  finally { await restricted.end(); }
 }finally{await candidate.end();await sql.end();}
});
