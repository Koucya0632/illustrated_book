import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import variants from '../data/australian-word-variants.json';
import images from '../data/australian-image-variants.json';
import ids from '../data/australian-only-word-ids.json';
import {applyAustralianImage,applyAustralianVariant,australianVariant,validateAustralianImages,validateAustralianVariants,visibleInDirection} from '../lib/australian-word-variants';
import {AUSTRALIAN_RENTAL_CATEGORY,AUSTRALIAN_RENTAL_WORDS} from '../lib/australian-categories';
import {applyMembershipStudyScope,canStudyCard} from '../lib/study-membership';
import {resolveDirectionThemeScope} from '../lib/study-sources';
import type {AustralianWordVariants} from '../lib/australian-word-variants';
import type {Word} from '../types';

const all=variants as AustralianWordVariants;
test('candidate is complete, empty IPA is deliberate, and Japanese shared content is unchanged',()=>{
 assert.equal(Object.keys(all).length,20);assert.equal(Object.keys(images).length,3);
 validateAustralianVariants(all,ids);validateAustralianImages(images,ids,all);
 assert.deepEqual(Object.keys(all).filter(id=>all[id].visibility==='australia-only').sort(),[...ids].sort());
 assert.ok(Object.values(all).every(v=>v.pronunciation===''));
 for(const id of ids){assert.equal(visibleInDirection(id,'zh-ja',all,ids),false);assert.equal(visibleInDirection(id,'zh-en',all,ids),true)}
 const bad=structuredClone(all);bad['transit-ic-card'].pronunciation='  ';assert.throws(()=>validateAustralianVariants(bad,ids));
 for(const id of ['transit-ic-card','route-map','student-id-card','menu']){
  const original={id,word:'日本語基準',imageUrl:'https://example.test/japan.webp',audioUrls:{'ja-JP':'https://example.test/japan.mp3'},definitions:[],examples:[{ja:'日本語例句'}],tags:[],relations:[]} as unknown as Word;
  assert.equal(applyAustralianVariant(original,'zh-Hant',australianVariant(id,'zh-ja',all)),original);
  assert.equal(applyAustralianImage(original,'zh-ja',images),original);
 }
});
test('the six rental words remain available to free users under current policy',()=>{
 const access={policy:'v2' as const,tier:'free' as const};
 const scope=applyMembershipStudyScope(resolveDirectionThemeScope([AUSTRALIAN_RENTAL_CATEGORY],false,'zh-en'),access);
 assert.equal(scope.shouldFetchPublic,true);assert.deepEqual(scope.publicCategories,[AUSTRALIAN_RENTAL_CATEGORY]);
 for(const id of AUSTRALIAN_RENTAL_WORDS)assert.equal(canStudyCard(access,{source:'public',category:AUSTRALIAN_RENTAL_CATEGORY,wordId:id}),true);
});
const planFile=process.env.AU_ACTIVATION_PLAN,source=process.env.AU_REVIEW_SOURCE;
test('every candidate field and all media URLs match the fixed reviewed package and plan',{skip:!planFile||!source},()=>{
 const raw=fs.readFileSync(`${source}/review-package.json`);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'39f5edd9e1d6f4542232c3bb3d15f63aa27d787423c0461f76169be1f13d0159');
 const planBytes=fs.readFileSync(planFile!);assert.equal(createHash('sha256').update(planBytes).digest('hex'),'4a94096a6c80a7c1d818218d83649aa00e7fe4b64845006bac31278c10fab6a1');
 const pkg=JSON.parse(raw.toString('utf8')),plan=JSON.parse(planBytes.toString('utf8'));
 assert.equal(plan.planDigest,'8ad1ab8b1078201f58168412494af7ae933e075e8e271d708be94d84c12fb5f5');
 const url=(owner:string,role:string,locale?:string)=>{const rows=plan.artifacts.filter((a:{owner:string;role:string;locale?:string})=>a.owner===owner&&a.role===role&&a.locale===locale);assert.equal(rows.length,1);return `https://img.nexflow.team/${rows[0].bucket}/${rows[0].proposedStoragePath}`};
 for(const row of [...pkg.wordEntries,pkg.opalRegionalCandidate]){
  const c=row.candidate,v=all[c.id];assert.ok(v);assert.equal(v.visibility,c.visibility);assert.equal(v.headword,c.word);assert.equal(v.pronunciation,c.pronunciation);
  assert.deepEqual(v.gloss,c.gloss);assert.deepEqual(v.explanation,c.explanation);assert.equal(v.englishDefinition,c.explanation.en);
  assert.equal(v.imageUrl,url(c.id==='transit-ic-card'?'transit-ic-card-au':c.id,'image'));
  for(const l of ['en-US','en-GB','en-AU','ja-JP'])assert.equal(v.audioUrls[l],url(c.id,'headword',l));
  for(const [slot,e] of c.examples.entries()){
   const actual=v.examples[slot];assert.equal(actual.en,e.en);assert.equal(actual.zh,e.zh);assert.deepEqual(actual.translations,{zh:e.zh,ja:e.ja});assert.equal(actual.cefrLevel,e.level);assert.equal(actual.sortOrder,slot);assert.deepEqual(actual.mentionedWordIds,[c.id]);
   for(const l of ['en-US','en-GB','en-AU','ja-JP'])assert.equal(actual.audioUrls[l],url(c.id,`example-${slot}`,l));
  }
  const audio=(role:string)=>Object.fromEntries(['en-US','en-GB','en-AU','ja-JP'].map(l=>[l,url(c.id,role,l)]));
  assert.deepEqual(v,{visibility:c.visibility,headword:c.word,pronunciation:c.pronunciation,imageUrl:url(c.id==='transit-ic-card'?'transit-ic-card-au':c.id,'image'),
   gloss:c.gloss,explanation:c.explanation,englishDefinition:c.explanation.en,audioUrls:audio('headword'),
   examples:c.examples.map((e:{en:string;zh:string;ja:string;level:string},slot:number)=>({en:e.en,zh:e.zh,translations:{zh:e.zh,ja:e.ja},sortOrder:slot,cefrLevel:e.level,audioUrls:audio(`example-${slot}`),mentionedWordIds:[c.id]}))});
 }
 for(const [id,owner] of Object.entries({'route-map':'route-map-au','student-id-card':'student-id-card-au','menu':'menu-au'}))assert.equal(images[id as keyof typeof images],url(owner,'image'));
});
