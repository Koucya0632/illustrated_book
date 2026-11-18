import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { prepareAustralianPlan } from "../lib/catalogue/publish/australia-plan";
import { previewAustralianFullVariants, previewAustralianImageVariants } from "../lib/catalogue/publish/australia-variant-preview";
import { applyAustralianImage, applyAustralianVariant, validateAustralianImages, validateAustralianVariants } from "../lib/australian-word-variants";
import type { Word } from "../types";

const source=process.env.AU_REVIEW_SOURCE, reserved=process.env.AU_RESERVED_IDS;
test("candidate preview maps exact plan assets and never modifies the published allowlist", {skip: !source || !reserved}, () => {
 const allowlist = "data/australian-word-variants.json";
 const before = fs.readFileSync(allowlist, "utf8");
 const plan = prepareAustralianPlan(source!,reserved!,process.cwd());
 const preview=previewAustralianFullVariants(plan);
 validateAustralianVariants(preview,plan.reservedIds);
 assert.equal(Object.keys(preview).length,20);
 const data=JSON.parse(fs.readFileSync(plan.sourcePins.reviewPackage.file,"utf8"));
 for (const entry of data.wordEntries) {
  const v=preview[entry.id];
  assert.equal(v.headword,entry.candidate.word);
  assert.equal(v.examples[1].translations.ja,entry.candidate.examples[1].ja);
  assert(v.imageUrl.endsWith(`${entry.image.sha256}.webp`));
  assert(v.audioUrls["en-AU"].endsWith(`${entry.audio.find((x: {kind:string;locale:string})=>x.kind==='headword' && x.locale==='en-AU').sha256}.mp3`));
 }
 const opal=preview['transit-ic-card'];
 const base={id:'transit-ic-card',word:'original',examples:[]} as unknown as Word;
 assert.equal(applyAustralianVariant(base,'zh-Hant',opal).word,'Opal card');
 assert.equal(base.word,'original');
 assert.equal(fs.readFileSync(allowlist,"utf8"),before);
});


test("image preview maps existing IDs and leaves shared data and allowlist untouched", {skip: !source || !reserved}, () => {
 const file="data/australian-image-variants.json", before=fs.readFileSync(file,"utf8");
 const plan=prepareAustralianPlan(source!,reserved!,process.cwd());
 const images=previewAustralianImageVariants(plan);
 validateAustralianImages(images,plan.reservedIds,previewAustralianFullVariants(plan));
 assert.deepEqual(Object.keys(images).sort(),["menu","route-map","student-id-card"]);
 for (const [id,url] of Object.entries(images)) {
  const candidate=plan.artifacts.find((x)=>x.owner===`${id}-au` && x.role==="image");
  assert(candidate && url.endsWith(`${candidate.sha256}.webp`));
  const word={id,word:"live",imageUrl:"https://fixture.invalid/japan.webp",examples:[{en:"original"}],audioUrls:{"ja-JP":"https://fixture.invalid/original.mp3"}} as unknown as Word;
  const australian=applyAustralianImage(word,"zh-en",images);
  assert.equal(australian.imageUrl,url);
  assert.equal(australian.examples,word.examples);
  assert.equal(australian.audioUrls,word.audioUrls);
  assert.equal(applyAustralianImage(word,"zh-ja",images),word);
 }
 assert.equal(fs.readFileSync(file,"utf8"),before);
});
