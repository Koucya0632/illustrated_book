import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import test from 'node:test';
import {mintAdminToken} from '../lib/auth';
import {databaseIdentityDigest} from '../lib/database-target-diagnostic';
import postgres from 'postgres';

test('actual Next route requires admin and is not cached', {skip:process.env.TUJI_DIAGNOSTIC_HTTP_TEST!=='1',timeout:60_000}, async()=>{
 const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=(socket.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>socket.close(err=>err?reject(err):resolve()));
 const now=Date.now();const secret='synthetic local-only admin signing key';const previous=process.env.ADMIN_SECRET;process.env.ADMIN_SECRET=secret;
 const token=await mintAdminToken();if(previous===undefined)delete process.env.ADMIN_SECRET;else process.env.ADMIN_SECRET=previous;
 const databaseUrl=process.env.TUJI_DIAGNOSTIC_TEST_DATABASE_URL;let expectedDigest='a'.repeat(64);
 if(databaseUrl){const parsed=new URL(databaseUrl);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.pathname,'/tuji_diagnostic_test');
  const candidate=postgres(databaseUrl,{ssl:'require',max:1,connect_timeout:3});try{const [row]=await candidate`select system_identifier::text as system_id,current_database()::text as database_name from pg_catalog.pg_control_system()`;expectedDigest=databaseIdentityDigest(row.system_id,row.database_name);}finally{await candidate.end();}}
 const env:NodeJS.ProcessEnv={...process.env,VERCEL_ENV:'production',ADMIN_SECRET:secret,DATABASE_TARGET_DIAGNOSTIC_FROM_MS:String(now-1000),DATABASE_TARGET_DIAGNOSTIC_UNTIL_MS:String(now+180_000),DATABASE_TARGET_DIAGNOSTIC_REF:'abcdefghijklmnopqrst',DATABASE_TARGET_DIAGNOSTIC_IDENTITY_SHA256:expectedDigest};
 delete env.DATABASE_URL;
 if(databaseUrl)env.DATABASE_URL=databaseUrl;
 const child=spawn('./node_modules/.bin/next',['dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:'ignore'});
 const url=`http://127.0.0.1:${port}/api/admin/database-target-diagnostic`;
 try{
  let anonymous:Response|undefined;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw new Error('isolated Next server exited before becoming ready');
   try{anonymous=await fetch(url,{method:'POST'});break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}
  }
  assert.ok(anonymous,'isolated server did not become ready');assert.equal(anonymous.status,401);
  assert.match(anonymous.headers.get('cache-control')??'',/no-store/);
  const authenticated=await fetch(url,{method:'POST',headers:{cookie:`eepd_admin=${token}`}});
  assert.equal(authenticated.status,200);assert.match(authenticated.headers.get('cache-control')??'',/no-store/);
  assert.deepEqual(await authenticated.json(),{configuredRefMatches:null,databaseIdentityMatches:databaseUrl?true:null});
 }finally{child.kill('SIGTERM');await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',()=>resolve());setTimeout(resolve,2000).unref();});}
});
