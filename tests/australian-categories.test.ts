import assert from "node:assert/strict";
import test from "node:test";
import { AUSTRALIAN_RENTAL_CATEGORY, AUSTRALIAN_RENTAL_WORDS, filterAustralianCategories, legacyRentalWordVisible, studyCategoriesForDirection, updateStudyCategoriesForDirection, filterIncompleteRentalRows } from "../lib/australian-categories";
import type { AustralianWordVariants } from "../lib/australian-word-variants";

const categories = [{id:"living-room",name:"客廳"},{id:AUSTRALIAN_RENTAL_CATEGORY,name:"租屋與合租"}];
const active = Object.fromEntries(AUSTRALIAN_RENTAL_WORDS.map((id) => [id,{visibility:"australia-only"}])) as AustralianWordVariants;
test("Australian rental category is hidden until complete and only for explicit Australia direction", () => {
 for (const direction of [undefined,"zh-ja"] as const) assert.deepEqual(filterAustralianCategories(categories,direction,active),[categories[0]]);
 assert.deepEqual(filterAustralianCategories(categories,"zh-en",{}),[categories[0]]);
 assert.deepEqual(filterAustralianCategories(categories,"zh-en",{...active,[AUSTRALIAN_RENTAL_WORDS[0]]:undefined} as unknown as AustralianWordVariants),[categories[0]]);
 assert.deepEqual(filterAustralianCategories(categories,"zh-en",active),categories);
 assert.deepEqual(categories,[{id:"living-room",name:"客廳"},{id:AUSTRALIAN_RENTAL_CATEGORY,name:"租屋與合租"}]);
});


test("unscoped and invalid legacy requests do not receive rental words without their category", () => {
 for (const suffix of ["", "?lang=ja", "?learning=invalid"]) assert.equal(legacyRentalWordVisible("rental-bond",`https://test.invalid/api/words${suffix}`),false);
 for (const direction of ["zh-en","zh-ja"]) assert.equal(legacyRentalWordVisible("rental-bond",`https://test.invalid/api/words?learning=${direction}`),true);
 assert.equal(legacyRentalWordVisible("mug","https://test.invalid/api/words"),true);
});


test("study filters hide an inapplicable category without changing saved selections", () => {
 const selected = [AUSTRALIAN_RENTAL_CATEGORY];
 assert.deepEqual(studyCategoriesForDirection(selected,"zh-ja"),[]);
 assert.deepEqual(studyCategoriesForDirection(selected,"zh-en"),selected);
 assert.deepEqual(selected,[AUSTRALIAN_RENTAL_CATEGORY]);
 assert.deepEqual(studyCategoriesForDirection(["kitchen",AUSTRALIAN_RENTAL_CATEGORY,"custom"],"zh-ja"),["kitchen","custom"]);
});


test("selecting or clearing visible Japanese topics keeps the saved Australian choice", () => {
 const saved = [AUSTRALIAN_RENTAL_CATEGORY,"old-jp"];
 const all = updateStudyCategoriesForDirection(saved,["kitchen","station"],"zh-ja");
 assert.deepEqual(all,["kitchen","station",AUSTRALIAN_RENTAL_CATEGORY]);
 assert.deepEqual(updateStudyCategoriesForDirection(saved,[],"zh-ja"),[AUSTRALIAN_RENTAL_CATEGORY]);
 assert.deepEqual(updateStudyCategoriesForDirection(saved,[],"zh-en"),[]);
 assert.deepEqual(saved,[AUSTRALIAN_RENTAL_CATEGORY,"old-jp"]);
});


test("merging inconsistent shards cannot expose a partial rental batch",()=>{
 const ordinary={word:{id:"mug",category:"kitchen"}};
 const rentals=AUSTRALIAN_RENTAL_WORDS.map(id=>({word:{id,category:AUSTRALIAN_RENTAL_CATEGORY}}));
 assert.deepEqual(filterIncompleteRentalRows([ordinary,...rentals.slice(0,5)]),[ordinary]);
 assert.equal(filterIncompleteRentalRows([ordinary,...rentals]).length,7);
 assert.deepEqual(filterIncompleteRentalRows([ordinary,...rentals.slice(0,5),{word:{id:rentals[5].word.id,category:"living-room"}}]),[ordinary]);
});
