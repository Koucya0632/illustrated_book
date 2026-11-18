import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { CATALOGUE_TABLES,migrateDdlFor } from "./helpers/migrate-ddl";
import { memoryStorage,FIXTURE_ASSET_BASE } from "./helpers/release-fixture";
import { syntheticEvidence } from "./helpers/australia-evidence";
import { prepareAustralianPlan } from "../lib/catalogue/publish/australia-plan";
import { createAustralianTestDatabaseAdapter, installAustraliaTestReceiptTable } from "../lib/catalogue/publish/australia-database-test-adapter";
import { runAustralianPublisher } from "../lib/catalogue/publish/australia-journal";
import { acquireAustralianTestBatchLock } from "../lib/catalogue/publish/australia-session-lock";
import { AUSTRALIAN_TEST_BATCH_ID, createAustraliaTestOwnership, installAustraliaTestOwnership } from "../lib/catalogue/publish/australia-ownership-test";

const source=process.env.AU_REVIEW_SOURCE,reserved=process.env.AU_RESERVED_IDS,databaseUrl=process.env.AU_TEST_DATABASE_URL;
test("mixed Australian rows are atomic against the actual catalogue schema; shared words are preserved",{skip:!source||!reserved||!databaseUrl,timeout:60000},async()=>{
 const u=new URL(databaseUrl!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(u.hostname));assert.equal(u.pathname,"/tuji_au_test");
 const sql=postgres(databaseUrl!,{max:1,onnotice:()=>{}}), observer=postgres(databaseUrl!,{max:1,onnotice:()=>{}}),monitor=postgres(databaseUrl!,{max:1,onnotice:()=>{}}),tmp=fs.mkdtempSync(path.join(os.tmpdir(),"au-real-db-"));process.env.NEXT_PUBLIC_ASSET_BASE_URL=FIXTURE_ASSET_BASE;
 let lock:Awaited<ReturnType<typeof acquireAustralianTestBatchLock>>|undefined;
 try {
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for(const statement of migrateDdlFor(new Set([...CATALOGUE_TABLES,"word_media","word_example_media","word_tags","tags"])))await sql.unsafe(statement);
  await installAustraliaTestReceiptTable(sql,databaseUrl!);
  await installAustraliaTestOwnership(databaseUrl!,sql);lock=await acquireAustralianTestBatchLock(databaseUrl!,sql,AUSTRALIAN_TEST_BATCH_ID);
  const plan=prepareAustralianPlan(source!,reserved!,process.cwd(),{listeningWaivedByUser:process.env.AU_TEST_WAIVER==='1'});
  const categoryIds=[...new Set(Object.values(plan.categoryAssignments))].filter((id)=>id!==plan.newCategory.id);
  for(const id of categoryIds){await sql`INSERT INTO categories(id,name,name_zh,emoji,description,description_en,color,image_url) VALUES (${id},${id},${id},'📚','test','test','blue','https://fixture.invalid/topic.webp')`;await sql`INSERT INTO category_translations(category_id,language,name,description) VALUES (${id},'ja',${id},'test')`;}
  const pkg=JSON.parse(fs.readFileSync(plan.sourcePins.reviewPackage.file,"utf8"));const snapshots=JSON.parse(fs.readFileSync(plan.sourcePins.existingSnapshots.file,"utf8"));
  const shared=[...plan.existingAudioOwners,"mug"];
  await sql`INSERT INTO words(id,word,category,part_of_speech,pronunciation,image_url,status) VALUES ('transit-ic-card','transit IC card','office','noun','/x/',${plan.japanTransitBaseline.imageUrl},'published')`;
  const jp=JSON.parse(fs.readFileSync(plan.sourcePins.japanTransitDatabaseSnapshot.file,'utf8')).data;
  await sql`INSERT INTO word_terms(word_id,language,term,reading,audio_url) VALUES ('transit-ic-card','ja',${jp.terms[0].term},${jp.terms[0].reading},${jp.terms[0].audio_url})`;
  for(const e of jp.examples){
   await sql`INSERT INTO word_examples(id,word_id,sentence,sort_order,cefr_level) VALUES (${e.example_id},'transit-ic-card',${e.sentence},${e.sort_order},${e.sort_order===0?'A2':'B1'})`;
   await sql`INSERT INTO word_example_translations(example_id,language,translation) VALUES (${e.example_id},'ja',${e.japanese})`;
   await sql`INSERT INTO word_example_media(example_id,locale,url) VALUES (${e.example_id},'ja-JP',${e.japanese_audio_url})`;
  }
  for(const id of shared){
   const word=id==="mug"?"mug":snapshots[id]["zh-Hant"].word;
   await sql`INSERT INTO words(id,word,category,part_of_speech,pronunciation,image_url,status) VALUES (${id},${word},'office','noun','/x/','https://fixture.invalid/original.webp','published')`;
   const clips=plan.artifacts.filter((a)=>a.owner===id&&a.bucket==="word-audio"&&a.locale==="en-AU");
   for(const slot of [0,1]){const clip=clips.find((x)=>x.role===`example-${slot}`)!;await sql`INSERT INTO word_examples(word_id,sentence,sort_order,cefr_level) VALUES (${id},${clip.sourceText!},${slot},${slot===0?'A2':'B1'})`;}
  }
  const before=await sql`SELECT id,word,image_url,status FROM words WHERE id=ANY(${shared}) ORDER BY id`;
  const ownership=createAustraliaTestOwnership(databaseUrl!,sql,lock);
  assert.equal(Object.isFrozen(ownership),true);
  assert.throws(()=>Object.defineProperty(ownership,'assertTransaction',{value:async()=>{}}),TypeError);
  let armFinalCheck=false,releaseCommitWindow!:()=>void,enteredCommitWindow!:()=>void;
  const commitWindowEntered=new Promise<void>(resolve=>enteredCommitWindow=resolve),commitWindowRelease=new Promise<void>(resolve=>releaseCommitWindow=resolve);
  const adapter=createAustralianTestDatabaseAdapter(sql,databaseUrl!,ownership,{async afterFinalOwnershipCheck(){if(armFinalCheck){await observer`SELECT pg_terminate_backend(${lock!.backendPid})`;enteredCommitWindow();await commitWindowRelease;}}});const state=await adapter.preflight(plan);assert.deepEqual(state.problems,[]);
  const withoutOwnership=createAustralianTestDatabaseAdapter(sql,databaseUrl!);
  await assert.rejects(withoutOwnership.applyAtomic(plan,{} as never),/transaction ownership is required/);
  const forged=createAustralianTestDatabaseAdapter(sql,databaseUrl!,{async assertTransaction(){}});
  await assert.rejects(forged.applyAtomic(plan,{} as never),/untrusted ownership/);
  const copied=createAustralianTestDatabaseAdapter(sql,databaseUrl!,{...ownership});
  await assert.rejects(copied.applyAtomic(plan,{} as never),/untrusted ownership/);
  const wrongClient=createAustralianTestDatabaseAdapter(observer,databaseUrl!,ownership);
  await assert.rejects(wrongClient.applyAtomic(plan,{} as never),/different work connection/);
  const testEvidence=syntheticEvidence(plan);
  if(process.env.AU_TEST_WAIVER==='1'){
   testEvidence.reviews.listeningWaiver={decision:'user-waived-listening',planDigest:plan.planDigest,items:testEvidence.reviews.audio.map(({key,digest})=>({key,digest}))};
   testEvidence.reviews.audio=[];
  }
  const target={hostFingerprint:'isolated-real-db',storageFingerprint:'memory-storage',storageBackend:'r2' as const,apiBase:'https://test.invalid'};
  const {storage,objects}=memoryStorage();let deps={root:process.cwd(),database:adapter,storage,target,freshGuard:async()=>testEvidence.response,testOwnership:ownership};
  const planFile=path.join(tmp,'plan.json');fs.writeFileSync(planFile,JSON.stringify(plan));const req={mode:'apply' as const,confirmHost:target.hostFingerprint,confirmStorage:target.storageFingerprint,manifestDirectory:tmp};
  const last=plan.newWordIds.at(-1)!;
  await sql.unsafe(`CREATE FUNCTION reject_test_word() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${last}' THEN RAISE EXCEPTION 'forced atomic rollback'; END IF; RETURN NEW; END $$`);
  await sql.unsafe('CREATE TRIGGER reject_test_word_trigger BEFORE INSERT ON words FOR EACH ROW EXECUTE FUNCTION reject_test_word()');
  await assert.rejects(runAustralianPublisher(planFile,req,testEvidence,deps),/recovery manifest/);
  const failedPath=path.join(tmp,fs.readdirSync(tmp).find((x)=>x.startsWith('australia-apply-'))!);
  const [unwritten]=await sql`SELECT count(*)::int AS n FROM words WHERE id=ANY(${plan.newWordIds})`;assert.equal(unwritten.n,0,'all candidate rows roll back together');
  const [noTopic]=await sql`SELECT count(*)::int AS n FROM categories WHERE id=${plan.newCategory.id}`;assert.equal(noTopic.n,0,'topic also rolls back');
  assert.deepEqual(await sql`SELECT id,word,image_url,status FROM words WHERE id=ANY(${shared}) ORDER BY id`,before,'shared rows untouched after failure');
  const failed=JSON.parse(fs.readFileSync(failedPath,'utf8'));assert.equal(Object.keys(failed.resolvedExampleIds).length,38);assert.equal(objects.size,287);
  await sql.unsafe('DROP TRIGGER reject_test_word_trigger ON words; DROP FUNCTION reject_test_word()');
  await sql`UPDATE words SET image_url='https://fixture.invalid/unexpected-change.webp' WHERE id=${shared[0]}`;
  await assert.rejects(runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps),(error: unknown) => {
   assert.ok(error instanceof Error);
   assert.match(error.message,/recovery manifest/);
   assert.ok(error.cause instanceof Error);
   assert.match(error.cause.message,/before staging/);
   return true;
  });
  const [stillUnwritten]=await sql`SELECT count(*)::int AS n FROM words WHERE id=ANY(${plan.newWordIds})`;assert.equal(stillUnwritten.n,0,'changed shared baseline blocks publication');
  await sql`UPDATE words SET image_url='https://fixture.invalid/original.webp' WHERE id=${shared[0]}`;
  // Simulate an unexpected side effect late in the transaction, after the
  // preflight and ordinary insert checks have passed.
  await sql.unsafe(`CREATE FUNCTION mutate_shared_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE words SET image_url = 'https://fixture.invalid/tampered.webp' WHERE id = '${shared[0]}'; RETURN NEW; END $$`);
  await sql.unsafe('CREATE TRIGGER mutate_shared_test_trigger AFTER INSERT ON word_example_media FOR EACH STATEMENT EXECUTE FUNCTION mutate_shared_test()');
  await assert.rejects(runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps),(error: unknown) => {
   assert.ok(error instanceof Error && error.cause instanceof Error);
   assert.match(error.cause.message,/shared category, word, example, translation or original media changed/);
   return true;
  });
  const [afterSideEffect]=await sql`SELECT count(*)::int AS n FROM words WHERE id=ANY(${plan.newWordIds})`;
  assert.equal(afterSideEffect.n,0,'post-write verification aborts the complete transaction');
  assert.deepEqual(await sql`SELECT id,word,image_url,status FROM words WHERE id=ANY(${shared}) ORDER BY id`,before,'unexpected side effect also rolls back');
  await sql.unsafe('DROP TRIGGER mutate_shared_test_trigger ON word_example_media; DROP FUNCTION mutate_shared_test()');
  await sql.unsafe("CREATE FUNCTION reject_release_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced receipt failure'; END $$");
  await sql.unsafe('CREATE TRIGGER reject_release_receipt_trigger BEFORE INSERT ON australia_test_release_receipts FOR EACH ROW EXECUTE FUNCTION reject_release_receipt()');
  await assert.rejects(runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps),/recovery manifest/);
  const [withoutReceipt]=await sql`SELECT (SELECT count(*)::int FROM words WHERE id=ANY(${plan.newWordIds})) AS words,(SELECT count(*)::int FROM categories WHERE id=${plan.newCategory.id}) AS categories,(SELECT count(*)::int FROM australia_test_release_receipts) AS receipts`;
  assert.deepEqual({words:withoutReceipt.words,categories:withoutReceipt.categories,receipts:withoutReceipt.receipts},{words:0,categories:0,receipts:0},'receipt failure rolls back all real catalogue changes');
  await sql.unsafe('DROP TRIGGER reject_release_receipt_trigger ON australia_test_release_receipts; DROP FUNCTION reject_release_receipt()');
  // Pause the transaction while it publishes the sixth housing entry. A
  // separate connection must see neither the topic nor a partial word set.
  await observer`SELECT pg_advisory_lock(739112)`;
  await sql.unsafe(`CREATE FUNCTION pause_sixth_housing_word() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = 'tenancy-agreement' AND NEW.status = 'published' THEN PERFORM pg_advisory_xact_lock(739112); END IF; RETURN NEW; END $$`);
  await sql.unsafe('CREATE TRIGGER pause_sixth_housing_word_trigger BEFORE UPDATE OF status ON words FOR EACH ROW EXECUTE FUNCTION pause_sixth_housing_word()');
  armFinalCheck=process.env.AU_TEST_COMMIT_WINDOW==='1';
  const publishing=runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps).then(value=>({value,error:null}),error=>({value:null,error}));
  try {
   let blocked=false;
   for(let attempt=0;attempt<200;attempt++){
    const [locks]=await observer`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
    if(locks.n>0){blocked=true;break;}
    await new Promise((resolve)=>setTimeout(resolve,25));
   }
   assert.ok(blocked,'publication reached the held sixth-word lock');
   const [visible]=await observer`SELECT (SELECT count(*)::int FROM categories WHERE id=${plan.newCategory.id}) AS topics,(SELECT count(*)::int FROM words WHERE id=ANY(${plan.newWordIds})) AS words`;
   assert.equal(visible.topics,0,'another connection cannot see the uncommitted topic');
   assert.equal(visible.words,0,'another connection cannot see any partial candidate word set');
  } finally { await observer`SELECT pg_advisory_unlock(739112)`; }
  if(process.env.AU_TEST_COMMIT_WINDOW==='1'){
   await commitWindowEntered;
   await lock.release().catch(()=>{});lock=await acquireAustralianTestBatchLock(databaseUrl!,observer,AUSTRALIAN_TEST_BATCH_ID);
   const takeover=createAustraliaTestOwnership(databaseUrl!,observer,lock),recoveryAdapter=createAustralianTestDatabaseAdapter(observer,databaseUrl!,takeover);
   deps={...deps,database:recoveryAdapter,testOwnership:takeover};
   const [connection]=await observer`SELECT pg_backend_pid() AS pid`;
   let completedRecovery=false;
   const recovery=runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps).then(value=>{completedRecovery=true;return value});
   try{
    let waitingForLock=false;
    for(let attempt=0;attempt<200;attempt++){
     const [state]=await monitor`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${connection.pid}`;
     if(state?.wait_event_type==='Lock'){waitingForLock=true;break;}
     await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(waitingForLock,true,'takeover must reach a database lock wait');
    assert.equal(completedRecovery,false,'takeover must wait while the prior transaction is in progress');
   }finally{releaseCommitWindow();}
   const completed=await publishing;assert.ok(completed.error,'old process must observe loss after transaction commits');
   const recovered=await recovery;
   assert.equal(recovered.status,'database-committed-awaiting-activation');
  }else {const completed=await publishing;assert.ifError(completed.error);assert.equal(completed.value!.status,'database-committed-awaiting-activation');}
  await sql.unsafe('DROP TRIGGER pause_sixth_housing_word_trigger ON words; DROP FUNCTION pause_sixth_housing_word()');
  const [newWords]=await sql`SELECT count(*)::int AS n FROM words WHERE id=ANY(${plan.newWordIds}) AND status='published'`;assert.equal(newWords.n,19);
  const [housing]=await sql`SELECT count(*)::int AS n FROM words WHERE category=${plan.newCategory.id} AND status='published'`;assert.equal(housing.n,6);
  const rentalRows=await sql`SELECT id FROM words WHERE category=${plan.newCategory.id} AND status='published' ORDER BY id`;
  assert.deepEqual(rentalRows.map((row)=>row.id),['bills-included','condition-report','rental-bond','share-house','tenancy-agreement','view-a-room']);
  const [topic]=await sql`SELECT count(*)::int AS n FROM categories WHERE id=${plan.newCategory.id}`;assert.equal(topic.n,1);
  const [newExamples]=await sql`SELECT count(*)::int AS n FROM word_examples WHERE word_id=ANY(${plan.newWordIds})`;assert.equal(newExamples.n,38);
  const [receipt]=await sql`SELECT payload,payload_digest FROM australia_test_release_receipts WHERE plan_digest=${plan.planDigest}`;
  assert.equal(receipt.payload.exampleIds.length,38);assert.equal(receipt.payload.objects.length,287);assert.equal(receipt.payload.planDigest,plan.planDigest);
  const [head]=await sql`SELECT count(*)::int AS n FROM word_media WHERE word_id=ANY(${shared}) AND kind='audio' AND locale='en-AU'`;assert.equal(head.n,8);
  const [clips]=await sql`SELECT count(*)::int AS n FROM word_example_media m JOIN word_examples e ON e.id=m.example_id WHERE e.word_id=ANY(${shared}) AND m.locale='en-AU'`;assert.equal(clips.n,16);
  assert.deepEqual(await sql`SELECT id,word,image_url,status FROM words WHERE id=ANY(${shared}) ORDER BY id`,before,'shared word values preserved');
  assert.deepEqual(JSON.parse(fs.readFileSync(failedPath,'utf8')).resolvedExampleIds,failed.resolvedExampleIds,'resume reuses the original reserved IDs');
  const recovered=await runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps);assert.equal(recovered.status,'database-committed-awaiting-activation');
  const committedManifest=JSON.parse(fs.readFileSync(failedPath,'utf8'));
  assert.equal(receipt.payload.journalId,committedManifest.journalId,'receipt binds original journal ID');
  assert.deepEqual(receipt.payload.listeningEvidence,committedManifest.listeningEvidence,'receipt binds the review decision saved with this manifest');
  if(process.env.AU_TEST_WAIVER==='1'){
   assert.equal(receipt.payload.listeningEvidence.kind,'user-waived-listening');
   assert.equal(receipt.payload.listeningEvidence.items.length,264);
  }
  const differentJournal=JSON.parse(JSON.stringify(committedManifest));differentJournal.journalId=randomUUID();
  await assert.rejects(adapter.committedMatches(plan,differentJournal),/receipt missing or differs/);
  const alteredManifest=JSON.parse(JSON.stringify(committedManifest));alteredManifest.target.storageFingerprint='different-storage';
  await assert.rejects(adapter.committedMatches(plan,alteredManifest),/receipt missing or differs/);
  const alteredIds=JSON.parse(JSON.stringify(committedManifest));alteredIds.resolvedExampleIds[`${plan.newWordIds[0]}:0`]='999999999';
  await assert.rejects(adapter.committedMatches(plan,alteredIds),/receipt missing or differs/);
  await sql`DELETE FROM australia_test_release_receipts WHERE plan_digest=${plan.planDigest}`;
  await assert.rejects(adapter.committedMatches(plan,committedManifest),/receipt missing or differs/);
  await sql`INSERT INTO australia_test_release_receipts(plan_digest,payload,payload_digest) VALUES (${plan.planDigest},${sql.json(receipt.payload)},${receipt.payload_digest})`;
  await sql`INSERT INTO word_media(word_id,kind,locale,url) VALUES ('transit-ic-card','audio','ja-JP','https://fixture.invalid/unexpected.mp3')`;
  await assert.rejects(runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps),/shared category, word, example, translation or original media changed/);
  await sql`DELETE FROM word_media WHERE word_id='transit-ic-card' AND kind='audio' AND locale='ja-JP'`;
  await runAustralianPublisher(planFile,{...req,resume:failedPath},testEvidence,deps);
 }finally{if(lock)await lock.release().catch(()=>{});await observer`SELECT pg_advisory_unlock_all()`;await observer.end();await monitor.end();await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public');await sql.end();fs.rmSync(tmp,{recursive:true,force:true});}
});
