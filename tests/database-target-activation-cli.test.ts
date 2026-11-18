import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {validDiagnosticActivation} from '../lib/database-target-diagnostic';

test('offline activation file is private, create-only and never printed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tuji-diag-'));const keyFile=path.join(dir,'key'),refFile=path.join(dir,'ref'),digestFile=path.join(dir,'digest'),out=path.join(dir,'activation'),key='e'.repeat(64),ref='abcdefghijklmnopqrst',digest='a'.repeat(64);
 const run=(source:string,dest:string)=>spawnSync(process.execPath,['--import','tsx','scripts/mint-database-diagnostic-activation.ts','--key-file',source,'--ref-file',refFile,'--digest-file',digestFile,'--output',dest],{encoding:'utf8'});
 try {
  fs.writeFileSync(keyFile,key,{mode:0o600});fs.writeFileSync(refFile,ref,{mode:0o600});fs.writeFileSync(digestFile,digest,{mode:0o600});const first=run(keyFile,out);assert.equal(first.status,0);
  const token=fs.readFileSync(out,'utf8').trim();assert.equal(fs.statSync(out).mode&0o777,0o600);assert.equal(validDiagnosticActivation(token,key,String(Date.now()-10000),String(Date.now()+300000),ref,digest,Date.now()),true);
  assert.ok(!first.stdout.includes(token)&&!first.stdout.includes(key));
  const duplicate=run(keyFile,out);assert.notEqual(duplicate.status,0);assert.equal(fs.readFileSync(out,'utf8').trim(),token);assert.ok(!duplicate.stderr.includes(key)&&!duplicate.stderr.includes(token));
  fs.chmodSync(keyFile,0o644);assert.notEqual(run(keyFile,path.join(dir,'not-created')).status,0);
  fs.chmodSync(keyFile,0o600);fs.symlinkSync(keyFile,path.join(dir,'link'));assert.notEqual(run(path.join(dir,'link'),path.join(dir,'also-not-created')).status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
