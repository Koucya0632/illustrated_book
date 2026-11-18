/** ISOLATED TEST DATABASE ONLY. This adapter deliberately cannot connect to
 * production: direct public DB reads bypass the deployed Web region guard.
 * Do not remove the loopback/database guard until DB-level isolation is proven
 * and independently reviewed. No production CLI uses this module. */
import fs from "node:fs";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { digest } from "./plan";
import { insertDraftContent, publishDraft, reserveExampleIds, assertStoredContentMatchesPlan } from "./database";
import type { prepareAustralianPlan } from "./australia-plan";
import type { AustraliaDatabasePort, AustraliaManifest } from "./australia-journal";
import { SPANS_VERSION } from "../../example-spans";
import { assertAustraliaTestOwnership } from "./australia-ownership-test";

type Plan = ReturnType<typeof prepareAustralianPlan>;
type Sql = ReturnType<typeof postgres>;
type Tx = Parameters<typeof insertDraftContent>[0];
// Exact stored rows and candidate formats are verified at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const h = (s: string) => createHash("sha256").update(s).digest("hex");
function check(v: unknown, m: string): asserts v { if (!v) throw new Error(m); }
function checkIsolatedClient(sql: Sql, databaseUrl: string) {
  const url = new URL(databaseUrl), hosts = sql.options.host, ports = sql.options.port;
  check(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname === "/tuji_au_test" &&
    hosts.length === 1 && hosts[0] === url.hostname && ports.length === 1 && Number(ports[0]) === Number(url.port || 5432) &&
    sql.options.database === "tuji_au_test", "Australia adapter is restricted to the isolated test database");
}
/** Test-only table. This is not a production migration or a release ledger. */
export async function installAustraliaTestReceiptTable(sql: Sql, databaseUrl: string) {
  checkIsolatedClient(sql, databaseUrl);
  const [db] = await sql`SELECT current_database() AS name, pg_is_in_recovery() AS replica`;
  check(db.name === "tuji_au_test" && !db.replica, "unexpected isolated database");
  await sql`CREATE TABLE IF NOT EXISTS australia_test_release_receipts (
    plan_digest TEXT PRIMARY KEY, payload JSONB NOT NULL, payload_digest TEXT NOT NULL
  )`;
}
/** Bind the durable receipt to the original manifest identity and content. */
function receiptPayload(plan: Plan, manifest: AustraliaManifest) {
  check(manifest.planDigest === plan.planDigest && /^[a-f0-9]{64}$/.test(manifest.planFileSha256) &&
    /^[a-f0-9]{64}$/.test(manifest.beforeStateDigest), "receipt plan or before-state mismatch");
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.journalId), "invalid receipt journal ID");
  const expectedKeys = plan.newWordIds.flatMap((id) => [0, 1].map((slot) => `${id}:${slot}`)).sort();
  const ids = Object.entries(manifest.resolvedExampleIds).sort(([a], [b]) => a.localeCompare(b));
  check(JSON.stringify(ids.map(([key]) => key)) === JSON.stringify(expectedKeys) &&
    ids.every(([, value]) => /^\d+$/.test(value)) && new Set(ids.map(([, value]) => value)).size === ids.length,
    "receipt example IDs incomplete or duplicated");
  check(manifest.storageObjects.length === plan.artifacts.length, "receipt object coverage mismatch");
  const objects = manifest.storageObjects.map((o) => ({ key:o.key, bucket:o.bucket, storagePath:o.storagePath,
    url:o.url, bytes:o.bytes, contentSha256:o.contentSha256, mimeType:o.mimeType })).sort((a,b)=>a.key.localeCompare(b.key));
  const expected = plan.artifacts.map((a) => ({ key:`${a.bucket}|${a.proposedStoragePath}`, bucket:a.bucket,
    storagePath:a.proposedStoragePath, bytes:a.bytes, contentSha256:a.sha256, mimeType:a.mimeType })).sort((a,b)=>a.key.localeCompare(b.key));
  check(new Set(objects.map((o)=>o.key)).size === objects.length && manifest.storageObjects.every((o)=>o.verified) &&
    objects.every((o,i)=> /^https:\/\//.test(o.url) && digest({key:o.key,bucket:o.bucket,storagePath:o.storagePath,bytes:o.bytes,contentSha256:o.contentSha256,mimeType:o.mimeType}) === digest(expected[i])),
    "receipt object details incomplete or unverified");
  return { version:1, journalId:manifest.journalId, planDigest:manifest.planDigest, planFileSha256:manifest.planFileSha256,
    beforeStateDigest:manifest.beforeStateDigest, target:manifest.target, exampleIds:ids, objects,
    listeningEvidence:manifest.listeningEvidence };
}
async function verifyReceipt(tx: Tx, plan: Plan, manifest: AustraliaManifest) {
  const expected=receiptPayload(plan,manifest);
  const rows=await tx`SELECT payload,payload_digest FROM australia_test_release_receipts WHERE plan_digest=${plan.planDigest}`;
  check(rows.length===1 && rows[0].payload_digest===digest(expected) && digest(rows[0].payload)===digest(expected),
    "committed receipt missing or differs from original manifest");
}
function pkg(plan: Plan) { return JSON.parse(fs.readFileSync(plan.sourcePins.reviewPackage.file, "utf8")); }
function matchingArtifact(plan: Plan, owner: string, role: string, locale?: string) {
  const found = plan.artifacts.filter((a) => a.owner === owner && a.role === role && a.locale === locale);
  check(found.length === 1, `${owner}:${role}:${locale ?? "image"}: missing artifact`); return found[0];
}
function commonAudio(a: ReturnType<typeof matchingArtifact>, voice: string) {
  check(a.locale && a.sourceText, `${a.owner}: missing source text`);
  return { bucket: a.bucket, storagePath: a.proposedStoragePath, mimeType: a.mimeType, locale: a.locale,
    sourceText: a.sourceText, sourceDigest: h(`${a.locale}\0${a.sourceText}`), contentSha256: a.sha256,
    model: "macOS say", voice };
}
function commonSpans(spans: Json[]) {
  return spans.map((s) => ({ t:s.text, ...(s.reading ? {r:s.reading} : {}),
    ...(s.gloss ? {z:s.gloss["zh-Hant"],j:s.gloss.ja,e:s.gloss.en} : {}) }));
}
function categoryForRow(row: Json) {
  return { id:row.id,name:row.name,nameZh:row.name_zh,emoji:row.emoji,description:row.description,
    descriptionEn:row.description_en,color:row.color,imageUrl:row.image_url,nameJa:row.name_ja,descriptionJa:row.description_ja };
}
function makeCommonPlan(plan: Plan, entry: Json, categoryRow: Json) {
  const w=entry.candidate, category=categoryForRow(categoryRow), image=matchingArtifact(plan,w.id,"image");
  const original=entry.image;
  const item={
    word:{ id:w.id, word:w.word, chinese:w.gloss["zh-Hant"], chineseDefinition:w.explanation["zh-Hant"],
      category:category.id,partOfSpeech:w.partOfSpeech,pronunciation:w.pronunciation,cefrLevel:"A2",
      definitions:[{language:"en",definition:w.explanation.en,sortOrder:0},{language:"ja",definition:w.explanation.ja,sortOrder:0},{language:"zh",definition:w.gloss["zh-Hant"],sortOrder:0}],
      ja:w.ja,jaReading:w.reading,jaReadingSegments:w.readingSegments,relatedWords:[] },
    image:{ bucket:image.bucket,storagePath:image.proposedStoragePath,mimeType:image.mimeType,contentSha256:image.sha256,width:original.width,height:original.height,
      license:"AI-generated for Tuji",credit:"Tuji",sourceFile:original.source },
    headwordAudio:["en-US","en-GB","en-AU","ja-JP"].map((locale)=>{
      const clip=entry.audio.find((a:Json)=>a.kind==="headword"&&a.locale===locale);
      return commonAudio(matchingArtifact(plan,w.id,"headword",locale),clip.voice);
    }),
    examples:w.examples.map((example:Json,slot:number)=>({
      ownerKey:`${w.id}:${slot}`,sortOrder:slot,cefrLevel:example.level,en:example.en,ja:example.ja,zh:example.zh,
      spans:{en:commonSpans(entry.spans.find((s:Json)=>s.order===slot&&s.language==="en").spans),ja:commonSpans(entry.spans.find((s:Json)=>s.order===slot&&s.language==="ja").spans)},
      audio:["en-US","en-GB","en-AU","ja-JP"].map((locale)=>{
        const clip=entry.audio.find((a:Json)=>a.kind===`example-${slot}`&&a.locale===locale);
        return commonAudio(matchingArtifact(plan,w.id,`example-${slot}`,locale),clip.voice);
      }),
    })),
  };
  return {series:category.id,category,entries:[item],summary:{words:1,examples:2}};
}
async function inspect(tx: Tx, plan: Plan) {
  const data=pkg(plan), ids=plan.newWordIds, headwords=plan.headwords.map((x)=>x.en.toLowerCase()), ja=plan.headwords.map((x)=>x.ja);
  const collisions=await tx`SELECT id,word,status FROM words WHERE id=ANY(${ids}) OR lower(word)=ANY(${headwords}) OR EXISTS(SELECT 1 FROM unnest(also_known_as) AS alias WHERE lower(alias)=ANY(${headwords})) ORDER BY id`;
  const terms=await tx`SELECT word_id,language,term FROM word_terms WHERE (language='ja' AND term=ANY(${ja})) OR (language='en' AND lower(term)=ANY(${headwords})) ORDER BY word_id,language`;
  const categoryIds=[...new Set(Object.values(plan.categoryAssignments))].filter((id)=>id!==plan.newCategory.id).sort();
  const newCategoryRows=await tx`SELECT id,name,name_zh,emoji,description,description_en,color,image_url FROM categories WHERE id=${plan.newCategory.id}`;
  const newCategoryTranslations=await tx`SELECT category_id,language,name,description FROM category_translations WHERE category_id=${plan.newCategory.id}`;
  const categories=await tx`SELECT c.id,c.name,c.name_zh,c.emoji,c.description,c.description_en,c.color,c.image_url,t.name AS name_ja,t.description AS description_ja FROM categories c LEFT JOIN category_translations t ON t.category_id=c.id AND t.language='ja' WHERE c.id=ANY(${categoryIds}) ORDER BY c.id`;
  const audioClips=plan.artifacts.filter((a)=>a.bucket==='word-audio'&&a.locale==='en-AU'&&!ids.includes(a.owner)&&a.owner!=='transit-ic-card');
  const audioOwners=[...new Set(audioClips.map((a)=>a.owner))].sort();
  const existingOwners=[...new Set([...audioOwners,'transit-ic-card'])].sort();
  const existing=await tx`SELECT id,word,category,part_of_speech,pronunciation,image_url,audio_url,status,deleted_at FROM words WHERE id=ANY(${existingOwners}) ORDER BY id`;
  const examples=await tx`SELECT e.id::text,e.word_id,e.sentence,e.sort_order FROM word_examples e WHERE e.word_id=ANY(${existingOwners}) ORDER BY e.word_id,e.sort_order,e.id`;
  const transitTerms=await tx`SELECT word_id,language,term,reading,audio_url FROM word_terms WHERE word_id='transit-ic-card' AND language='ja'`;
  const transitExamples=await tx`SELECT e.id::text AS example_id,e.word_id,e.sort_order,e.sentence,t.translation AS japanese,m.url AS japanese_audio_url FROM word_examples e LEFT JOIN word_example_translations t ON t.example_id=e.id AND t.language='ja' LEFT JOIN word_example_media m ON m.example_id=e.id AND m.locale='ja-JP' WHERE e.word_id='transit-ic-card' ORDER BY e.sort_order,e.id`;
  const transitBaseline=JSON.parse(fs.readFileSync(plan.sourcePins.japanTransitDatabaseSnapshot.file,'utf8')).data;
  const translations=await tx`SELECT e.word_id,e.sort_order,t.language,t.translation FROM word_example_translations t JOIN word_examples e ON e.id=t.example_id WHERE e.word_id=ANY(${existingOwners}) ORDER BY e.word_id,e.sort_order,t.language`;
  const sharedWordMedia=await tx`SELECT id::text,word_id,kind,locale,url,storage_path,mime_type,metadata FROM word_media WHERE word_id=ANY(${existingOwners}) AND NOT (word_id=ANY(${audioOwners}) AND kind='audio' AND locale='en-AU') ORDER BY id`;
  const sharedExampleMedia=await tx`SELECT m.id::text,e.word_id,e.sort_order,m.locale,m.url,m.storage_path,m.mime_type FROM word_example_media m JOIN word_examples e ON e.id=m.example_id WHERE e.word_id=ANY(${existingOwners}) AND NOT (e.word_id=ANY(${audioOwners}) AND m.locale='en-AU') ORDER BY m.id`;
  const oldHeadwordAudio=await tx`SELECT word_id,locale,url,storage_path FROM word_media WHERE word_id=ANY(${audioOwners}) AND kind='audio' AND locale='en-AU' ORDER BY word_id`;
  const oldExampleAudio=await tx`SELECT e.word_id,e.sort_order,m.locale,m.url,m.storage_path FROM word_example_media m JOIN word_examples e ON e.id=m.example_id WHERE e.word_id=ANY(${audioOwners}) AND m.locale='en-AU' ORDER BY e.word_id,e.sort_order`;
  const allSpans=[...data.wordEntries.flatMap((r:Json)=>r.spans),...data.opalRegionalCandidate.spans];
  const en=allSpans.filter((r:Json)=>r.language==='en').map((r:Json)=>r.sentence), japanese=allSpans.filter((r:Json)=>r.language==='ja').map((r:Json)=>r.sentence);
  const spanCollisions=await tx`SELECT DISTINCT sentence_language,sentence FROM sentence_spans WHERE (sentence_language='en' AND sentence=ANY(${en})) OR (sentence_language='ja' AND sentence=ANY(${japanese})) ORDER BY sentence_language,sentence`;
  const problems:string[]=[];
  if(collisions.length||terms.length)problems.push('candidate ID/headword/alias collision');
  if(categories.length!==categoryIds.length||categories.some((c)=>!c.name_ja))problems.push('an assigned existing category or its Japanese translation is absent');
  if(newCategoryRows.length||newCategoryTranslations.length)problems.push('Australia housing category already exists; overwrite refused');
  if(existing.length!==existingOwners.length||existing.some((w)=>w.status!=='published'||w.deleted_at))problems.push('shared word missing, unpublished or deleted');
  if(oldHeadwordAudio.length||oldExampleAudio.length)problems.push('shared en-AU audio already exists; overwrite refused');
  if(spanCollisions.length)problems.push('candidate or Opal sentence already has spans');
  if(JSON.stringify(transitTerms)!==JSON.stringify(transitBaseline.terms)||JSON.stringify(transitExamples)!==JSON.stringify(transitBaseline.examples)||existing.find((w)=>w.id==='transit-ic-card')?.image_url!==plan.japanTransitBaseline.imageUrl)problems.push('Japanese transit word, image, examples or audio baseline changed');
  for(const clip of audioClips){
    const word=existing.find((w)=>w.id===clip.owner);
    if(clip.role==='headword' ? word?.word!==clip.sourceText : examples.filter((e)=>e.word_id===clip.owner&&e.sort_order===Number(clip.role.slice(-1))&&e.sentence===clip.sourceText).length!==1) problems.push(`${clip.owner}:${clip.role}: shared source text changed`);
  }
  const snapshot={collisions,terms,categories,newCategoryRows,newCategoryTranslations,existing,examples,transitTerms,transitExamples,translations,sharedWordMedia,sharedExampleMedia,oldHeadwordAudio,oldExampleAudio,spanCollisions};
  return {ready:problems.length===0,problems,beforeStateDigest:digest(snapshot),categories,existing,examples,snapshot};
}

async function committedMatchesInTransaction(tx: Tx, plan: Plan, manifest: AustraliaManifest, requireReceipt = true): Promise<boolean> {
        const rows=await tx`SELECT id,status FROM words WHERE id=ANY(${plan.newWordIds}) ORDER BY id`;
        if(rows.length===0){
          const receipts=await tx`SELECT plan_digest FROM australia_test_release_receipts WHERE plan_digest=${plan.planDigest}`;
          check(receipts.length===0,'committed receipt exists without candidate rows');return false;
        }
        check(rows.length===plan.newWordIds.length&&rows.every((x)=>x.status==='published'),"partial candidate database state; recovery refused");
        if(requireReceipt)await verifyReceipt(tx,plan,manifest);
        const categoryIds=[...new Set(Object.values(plan.categoryAssignments))];
        const categories=await tx`SELECT c.id,c.name,c.name_zh,c.emoji,c.description,c.description_en,c.color,c.image_url,t.name AS name_ja,t.description AS description_ja FROM categories c JOIN category_translations t ON t.category_id=c.id AND t.language='ja' WHERE c.id=ANY(${categoryIds})`;
        for(const entry of pkg(plan).wordEntries){
          const row=categories.find((c)=>c.id===plan.categoryAssignments[entry.id]);check(row,`${entry.id}: category changed`);
          const sub=makeCommonPlan(plan,entry,row);
          await assertStoredContentMatchesPlan(tx,sub,manifest.resolvedExampleIds,{...manifest,series:sub.series,categoryExistedBefore:true,categoryBefore:null} as never,'published');
        }
        const clips=plan.artifacts.filter((a)=>a.bucket==='word-audio'&&a.locale==='en-AU'&&!plan.newWordIds.includes(a.owner)&&a.owner!=='transit-ic-card');
        for(const a of clips){const object=manifest.storageObjects.find((o)=>o.bucket===a.bucket&&o.storagePath===a.proposedStoragePath);check(object,`${a.owner}: missing journal object`);
          const rows=a.role==='headword' ? await tx`SELECT url,storage_path FROM word_media WHERE word_id=${a.owner} AND kind='audio' AND locale='en-AU'` : await tx`SELECT m.url,m.storage_path FROM word_example_media m JOIN word_examples e ON e.id=m.example_id WHERE e.word_id=${a.owner} AND e.sort_order=${Number(a.role.slice(-1))} AND m.locale='en-AU'`;
          check(rows.length===1&&rows[0].url===object.url&&rows[0].storage_path===object.storagePath,`${a.owner}:${a.role}: AU audio changed`);
        }
        const opal=pkg(plan).opalRegionalCandidate;
        for(const row of opal.spans){
          const actual=await tx`SELECT sort_order,text,base_form,part_of_speech,reading,word_id,version FROM sentence_spans WHERE sentence_language=${row.language} AND sentence=${row.sentence} ORDER BY sort_order`;
          check(actual.length===row.spans.length,`Opal ${row.language}: incomplete spans`);
          for(const [i,span] of row.spans.entries()){
            const a=actual[i];check(a.sort_order===i&&a.text===span.text&&a.base_form===null&&a.part_of_speech===null&&a.reading===(span.reading??null)&&a.word_id===null&&a.version===SPANS_VERSION,`Opal span ${i} changed`);
            const gloss=await tx`SELECT language,gloss FROM sentence_span_glosses WHERE sentence_language=${row.language} AND sentence=${row.sentence} AND sort_order=${i} ORDER BY language`;
            const expected=Object.entries(span.gloss??{}).map(([language,value])=>({language,gloss:String(value)})).sort((a,b)=>a.language.localeCompare(b.language));
            check(JSON.stringify(gloss)===JSON.stringify(expected),`Opal gloss ${i} changed`);
          }
        }
        const current=await inspect(tx,plan);
        const cover=matchingArtifact(plan,plan.newCategory.imageOwner,'image');
        const coverObject=manifest.storageObjects.find((o)=>o.bucket===cover.bucket&&o.storagePath===cover.proposedStoragePath);check(coverObject,'housing cover missing');
        const c=plan.newCategory;
        const expectedCategory={id:c.id,name:c.name,name_zh:c.nameZh,emoji:c.emoji,description:c.description,description_en:c.descriptionEn,color:c.color,image_url:coverObject.url};
        const expectedTranslation={category_id:c.id,language:'ja',name:c.nameJa,description:c.descriptionJa};
        check(current.snapshot.newCategoryRows.length===1&&digest(current.snapshot.newCategoryRows[0])===digest(expectedCategory)&&current.snapshot.newCategoryTranslations.length===1&&digest(current.snapshot.newCategoryTranslations[0])===digest(expectedTranslation),'housing category changed');
        const cleaned={...current.snapshot,
          newCategoryRows:[],newCategoryTranslations:[],
          collisions:current.snapshot.collisions.filter((row)=>!plan.newWordIds.includes(row.id)),
          terms:current.snapshot.terms.filter((row)=>!plan.newWordIds.includes(row.word_id)),
          oldHeadwordAudio:[],oldExampleAudio:[],spanCollisions:[]};
        check(current.snapshot.oldHeadwordAudio.length===new Set(clips.filter((a)=>a.role==='headword').map((a)=>a.owner)).size && current.snapshot.oldExampleAudio.length===clips.filter((a)=>a.role!=='headword').length, 'unexpected AU audio rows appeared');
        check(digest(cleaned)===manifest.beforeStateDigest,'shared category, word, example, translation or original media changed');
        return true;
}

export function createAustralianTestDatabaseAdapter(sql: Sql, databaseUrl: string, ownership?: { assertTransaction(tx: Tx, manifest: AustraliaManifest): Promise<void> }, hooks?: { afterFinalOwnershipCheck?: () => Promise<void> }): AustraliaDatabasePort {
  checkIsolatedClient(sql, databaseUrl);
  return {
    async preflight(plan) { return sql.begin("read only",async(tx)=>{const r=await inspect(tx,plan);return {ready:r.ready,problems:r.problems,beforeStateDigest:r.beforeStateDigest};}); },
    async reserveExampleIds(plan){
      const fake={entries:plan.newWordIds.map((id)=>({examples:[{ownerKey:`${id}:0`},{ownerKey:`${id}:1`}] }))};
      return reserveExampleIds(sql,fake);
    },
    async committedMatches(plan,manifest){
      return sql.begin(async(tx)=>committedMatchesInTransaction(tx,plan,manifest));
    },
    async applyAtomic(plan,manifest){
      check(ownership, 'isolated transaction ownership is required');
      assertAustraliaTestOwnership(ownership,sql);
      await sql.begin("isolation level serializable",async(tx)=>{
        await tx`SELECT pg_advisory_xact_lock(hashtext('tuji-australia-atlas-publisher'))`;
        await ownership.assertTransaction(tx,manifest);
        const before=await inspect(tx,plan);check(before.ready&&before.beforeStateDigest===manifest.beforeStateDigest,`database before-state changed: ${before.problems.join('; ')}`);
        const entries=pkg(plan).wordEntries;
        const cover=matchingArtifact(plan,plan.newCategory.imageOwner,'image');
        const coverObject=manifest.storageObjects.find((o)=>o.bucket===cover.bucket&&o.storagePath===cover.proposedStoragePath);check(coverObject,'housing cover missing from verified objects');
        const c=plan.newCategory;
        await tx`INSERT INTO categories(id,name,name_zh,emoji,description,description_en,color,image_url,sort_order) VALUES (${c.id},${c.name},${c.nameZh},${c.emoji},${c.description},${c.descriptionEn},${c.color},${coverObject.url},(SELECT COALESCE(max(sort_order),-1)+1 FROM categories))`;
        await tx`INSERT INTO category_translations(category_id,language,name,description) VALUES (${c.id},'ja',${c.nameJa},${c.descriptionJa})`;
        const housingRow={id:c.id,name:c.name,name_zh:c.nameZh,emoji:c.emoji,description:c.description,description_en:c.descriptionEn,color:c.color,image_url:coverObject.url,name_ja:c.nameJa,description_ja:c.descriptionJa};
        const subplans = entries.map((entry: Json) => {
          const row=plan.categoryAssignments[entry.id]===c.id ? housingRow : before.categories.find((v)=>v.id===plan.categoryAssignments[entry.id]);check(row,`${entry.id}: missing category`);
          return makeCommonPlan(plan,entry,row);
        });
        for(const sub of subplans) await insertDraftContent(tx,sub,manifest.resolvedExampleIds);
        // The shared writer links spans against terms currently in the DB.
        // With multiple subplans, later candidates now exist too; reconcile
        // only newly inserted sentence spans against the complete catalogue.
        for(const entry of entries) for(const row of entry.spans) for(const [i,span] of row.spans.entries()) {
          if(!span.gloss) continue;
          const term=String(span.text).trim().toLowerCase();
          const linked=await tx`SELECT word_id FROM word_terms WHERE lower(term)=${term} ORDER BY word_id LIMIT 1`;
          await tx`UPDATE sentence_spans SET word_id=${linked[0]?.word_id??null} WHERE sentence_language=${row.language} AND sentence=${row.sentence} AND sort_order=${i}`;
        }
        for(const sub of subplans) {
          const wordId=sub.entries[0].word.id;
          const ids=Object.fromEntries([0,1].map((slot)=>[`${wordId}:${slot}`,manifest.resolvedExampleIds[`${wordId}:${slot}`]]));
          await publishDraft(tx,sub,{...manifest,resolvedExampleIds:ids,series:sub.series,categoryExistedBefore:true,categoryBefore:null} as never);
        }
        const data=pkg(plan);
        for(const row of data.opalRegionalCandidate.spans){
          for(const [i,span] of row.spans.entries()){
            await tx`INSERT INTO sentence_spans (sentence_language,sentence,sort_order,text,base_form,part_of_speech,reading,word_id,version) VALUES (${row.language},${row.sentence},${i},${span.text},${null},${null},${span.reading??null},${null},${SPANS_VERSION})`;
            for(const [lang,gloss] of Object.entries(span.gloss??{})) await tx`INSERT INTO sentence_span_glosses (sentence_language,sentence,sort_order,language,gloss) VALUES (${row.language},${row.sentence},${i},${lang},${String(gloss)})`;
          }
        }
        const clips=plan.artifacts.filter((a)=>a.bucket==='word-audio'&&a.locale==='en-AU'&&!plan.newWordIds.includes(a.owner)&&a.owner!=='transit-ic-card');
        for(const a of clips){
          const object=manifest.storageObjects.find((o)=>o.bucket===a.bucket&&o.storagePath===a.proposedStoragePath);check(object,`${a.owner}: missing storage object`);
          if(a.role==='headword') await tx`INSERT INTO word_media (word_id,kind,url,storage_path,mime_type,model,locale,metadata) VALUES (${a.owner},'audio',${object.url},${object.storagePath},${object.mimeType},'macOS say','en-AU',${tx.json({sourceText:a.sourceText,sha256:a.sha256})})`;
          else {const match=before.examples.filter((e)=>e.word_id===a.owner&&e.sort_order===Number(a.role.slice(-1)));check(match.length===1,`${a.owner}: existing example changed`);await tx`INSERT INTO word_example_media (example_id,locale,url,storage_path,mime_type,model) VALUES (${match[0].id},'en-AU',${object.url},${object.storagePath},${object.mimeType},'macOS say')`;}
        }
        check(await committedMatchesInTransaction(tx,plan,manifest,false), "transactional post-write verification failed");
        const payload=receiptPayload(plan,manifest);
        await tx`INSERT INTO australia_test_release_receipts(plan_digest,payload,payload_digest)
          VALUES (${plan.planDigest},${tx.json(payload)},${digest(payload)})`;
        await verifyReceipt(tx,plan,manifest);
        await ownership.assertTransaction(tx,manifest);
        await hooks?.afterFinalOwnershipCheck?.();
      });
    },
  };
}
