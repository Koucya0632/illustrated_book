import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { mintAdminToken, verifyAdminToken } from '../lib/auth';
import { configuredProjectMatches, databaseIdentityDigest, inspectDatabaseTarget, runTargetDiagnostic, type TargetDiagnosticSql } from '../lib/database-target-diagnostic';

const ref='abcdefghijklmnopqrst', other='zyxwvutsrqponmlkjihg';
const now=1_800_000_000_000;
const base={now:()=>now,production:true,from:String(now-1000),until:String(now+1000),ref,expectedDigest:'a'.repeat(64),authorized:async()=>true,sql:()=>null};

test('only recognized actual driver targets identify a Supabase project',()=>{
 assert.equal(configuredProjectMatches([`db.${ref}.supabase.co`],'postgres',ref),true);
 assert.equal(configuredProjectMatches([`db.${other}.supabase.co`],'postgres',ref),false);
 assert.equal(configuredProjectMatches(['aws-0-region.pooler.supabase.com'],`postgres.${ref}`,ref),true);
 assert.equal(configuredProjectMatches(['aws-0-region.pooler.supabase.com'],`app_user.${other}`,ref),false);
 for(const hosts of [[],['evil.supabase.co'],['aws-0-region.pooler.supabase.com.evil.invalid'],[`db.${ref}.supabase.co`,`db.${other}.supabase.co`]]) assert.equal(configuredProjectMatches(hosts,`postgres.${ref}`,ref),null);
 assert.equal(configuredProjectMatches(['aws-0-region.pooler.supabase.com'],'postgres',ref),null);
});

test('closed by default, restricted to production, an explicit short window and actual admin auth',async()=>{
 let access=0;const original=process.env.ADMIN_SECRET;process.env.ADMIN_SECRET='local synthetic diagnostic admin signing key';
 try {
  const token=await mintAdminToken();const auth=async()=>verifyAdminToken(token);
  const sql=()=>{access++;return null};
  for(const patch of [{production:false},{from:undefined},{until:undefined},{from:String(now+1)},{until:String(now)},{until:String(now+301_000)},{ref:undefined},{expectedDigest:'not-valid'}]) assert.equal(await runTargetDiagnostic({...base,...patch,authorized:auth,sql}),null);
  assert.equal(await runTargetDiagnostic({...base,authorized:()=>verifyAdminToken('bad'),sql}),null);
  assert.equal(await runTargetDiagnostic({...base,authorized:async()=>{throw new Error('synthetic auth failure')},sql}),null);
  assert.equal(access,0);
  assert.deepEqual(await runTargetDiagnostic({...base,authorized:auth,sql}),{configuredRefMatches:null,databaseIdentityMatches:null});assert.equal(access,1);
  let tick=now;assert.equal(await runTargetDiagnostic({...base,now:()=>tick,authorized:async()=>{tick=now+1001;return true},sql}),null);assert.equal(access,1);
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
