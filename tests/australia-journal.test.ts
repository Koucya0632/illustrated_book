import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import postgres from "postgres";
import { prepareAustralianPlan } from "../lib/catalogue/publish/australia-plan";
import { runAustralianPublisher, type AustraliaDatabasePort } from "../lib/catalogue/publish/australia-journal";
import type { ReviewEvidence, GuardEvidence } from "../lib/catalogue/publish/australia-gates";
import { memoryStorage, FIXTURE_ASSET_BASE } from "./helpers/release-fixture";

const source = process.env.AU_REVIEW_SOURCE, reserved = process.env.AU_RESERVED_IDS, databaseUrl = process.env.AU_TEST_DATABASE_URL;
const available = Boolean(source && reserved && databaseUrl);
import { syntheticEvidence } from "./helpers/australia-evidence";

test("guarded journal stages create-only media, preserves IDs on resume, and uses one database transaction", {skip:!available}, async () => {
  const u=new URL(databaseUrl!); assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname)); assert.equal(u.pathname,"/tuji_au_test");
  const sql=postgres(databaseUrl!,{max:1}); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"au-journal-test-")); process.env.NEXT_PUBLIC_ASSET_BASE_URL=FIXTURE_ASSET_BASE;
  try {
    await sql`CREATE TEMP TABLE australia_publish_fixture (plan_digest TEXT PRIMARY KEY, entry_count INTEGER NOT NULL)`;
    await sql`CREATE TEMP SEQUENCE australia_example_fixture`;
    const plan=prepareAustralianPlan(source!,reserved!,process.cwd()); const planFile=path.join(tmp,"plan.json"); fs.writeFileSync(planFile,JSON.stringify(plan));
    const prepared=syntheticEvidence(plan), {storage,objects,state}=memoryStorage();
    let reserveCalls=0,applyCalls=0,guardCalls=0,failCommit=true;
    const db:AustraliaDatabasePort={
      async preflight(){const rows=await sql`SELECT * FROM australia_publish_fixture`;return {ready:rows.length===0,problems:rows.length?["already committed"]:[],beforeStateDigest:"synthetic-before-state"}},
      async reserveExampleIds(p){reserveCalls++;const rows=await sql`SELECT nextval('australia_example_fixture')::text AS id FROM generate_series(1, ${p.newWordIds.length*2})`;return Object.fromEntries(p.newWordIds.flatMap((id)=>[`${id}:0`,`${id}:1`]).map((key,i)=>[key,rows[i].id]));},
      async committedMatches(p){const rows=await sql`SELECT plan_digest,entry_count FROM australia_publish_fixture WHERE plan_digest=${p.planDigest}`;return rows.length===1&&rows[0].entry_count===p.newWordIds.length;},
      async applyAtomic(p){applyCalls++;await sql.begin(async(tx)=>{await tx`INSERT INTO australia_publish_fixture VALUES (${p.planDigest},${p.newWordIds.length})`;if(failCommit){failCommit=false;throw new Error("synthetic transaction abort")}})}
    };
    const target={hostFingerprint:"isolated-test-db",storageFingerprint:"isolated-test-storage",storageBackend:"r2" as const,apiBase:"https://test.invalid"};
    const deps={root:process.cwd(),database:db,storage,target,freshGuard:async()=>{guardCalls++;return prepared.response}};
    const request={mode:"apply" as const,confirmHost:target.hostFingerprint,confirmStorage:target.storageFingerprint,manifestDirectory:tmp};
    const dry=await runAustralianPublisher(planFile,{mode:"dry-run"},prepared,deps);assert.equal(dry.mode,"dry-run");assert.equal(objects.size,0);
    const bad={...prepared,reviews:{...prepared.reviews,audio:[]}};
    await assert.rejects(runAustralianPublisher(planFile,request,bad,deps),/listening: incomplete/); assert.equal(objects.size,0); assert.equal(reserveCalls,0);
    state.failAfterPuts=5; await assert.rejects(runAustralianPublisher(planFile,request,prepared,deps),/recovery manifest/);
    assert.equal(objects.size,5); assert.equal((await sql`SELECT * FROM australia_publish_fixture`).length,0);
    const manifestFile=path.join(tmp,fs.readdirSync(tmp).find((x)=>x.startsWith("australia-apply-"))!);const failed=JSON.parse(fs.readFileSync(manifestFile,"utf8"));assert.equal(failed.status,"failed");assert.equal(Object.keys(failed.resolvedExampleIds).length,38);
    await assert.rejects(runAustralianPublisher(planFile,request,prepared,deps),/unfinished publication/);
    state.failAfterPuts=Infinity;
    await assert.rejects(runAustralianPublisher(planFile,{...request,resume:manifestFile},prepared,deps),/recovery manifest/);
    assert.equal((await sql`SELECT * FROM australia_publish_fixture`).length,0,"transaction error rolls back all writes");
    const failedAgain=JSON.parse(fs.readFileSync(manifestFile,"utf8"));assert.deepEqual(failedAgain.resolvedExampleIds,failed.resolvedExampleIds);
    const result=await runAustralianPublisher(planFile,{...request,resume:manifestFile},prepared,deps);assert.equal(result.status,"database-committed-awaiting-activation");
    assert.equal(reserveCalls,1);assert.equal(applyCalls,2);assert.equal(objects.size,287);assert.ok(guardCalls>=4);
    const after=JSON.parse(fs.readFileSync(manifestFile,"utf8"));assert.deepEqual(after.resolvedExampleIds,failed.resolvedExampleIds);
    await runAustralianPublisher(planFile,{...request,resume:manifestFile},prepared,deps);assert.equal(applyCalls,2,"recovery recognizes an already committed batch");
    const [missingKey, missingObject] = objects.entries().next().value!;
    objects.delete(missingKey);
    await assert.rejects(runAustralianPublisher(planFile,{...request,resume:manifestFile},prepared,deps), /remote HTTP 404/);
    assert.equal(applyCalls,2,"missing published media must not reapply the database");
    objects.set(missingKey,missingObject);
    const damagedBytes = Buffer.from(missingObject.bytes);
    damagedBytes[0] ^= 1;
    objects.set(missingKey,{...missingObject,bytes:damagedBytes});
    await assert.rejects(runAustralianPublisher(planFile,{...request,resume:manifestFile},prepared,deps), /remote bytes do not match/);
    assert.equal(applyCalls,2,"changed published media must not reapply the database");
    objects.set(missingKey,missingObject);
  } finally { await sql.end(); fs.rmSync(tmp,{recursive:true,force:true}); }
});
