import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {deriveAfter,snapshotState} from '../scripts/correct-winter-postal-2026-10-kudasai-v2.mjs';
const root=path.resolve(import.meta.dirname,'..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'docs/releases/winter-postal-2026-10/evidence/correction-v2/correction-plan-745ad740a5d986a4af64da616ccd127b21757f1521118774b07f727398b773d2.json')));
const clone=x=>structuredClone(x);
const target=s=>s.sentence_language==='ja'&&s.sentence==='年賀はがきを十枚ください。'&&s.sort_order===3;

test('regression: standalone kudasai becomes untappable and preserves displayed text',()=>{
  const after=deriveAfter(plan.before);
  assert.deepEqual(after,plan.after);
  assert.equal(plan.before.glosses.filter(target).length,3);
  assert.equal(after.glosses.filter(target).length,0);
  const prior=plan.before.spans.find(target),current=after.spans.find(target);
  assert.deepEqual(current,{...prior,reading:null,base_form:null,part_of_speech:null,word_id:null});
  const group=after.spans.filter(s=>s.sentence_language==='ja'&&s.sentence===prior.sentence);
  assert.equal(group.map(s=>s.text).join(''),'年賀はがきを十枚ください。');
  const taps=group.filter(s=>after.glosses.some(g=>g.sentence_language===s.sentence_language&&g.sentence===s.sentence&&g.sort_order===s.sort_order));
  assert.deepEqual(taps.map(s=>s.text),['年賀はがき','十枚']);
});
test('all other spans, glosses, words, examples and media are unchanged',()=>{
  const after=deriveAfter(plan.before);
  assert.deepEqual(after.spans.filter(s=>!target(s)),plan.before.spans.filter(s=>!target(s)));
  assert.deepEqual(after.glosses,plan.before.glosses.filter(s=>!target(s)));
  for(const key of Object.keys(plan.before).filter(k=>!['spans','glosses'].includes(k)))assert.deepEqual(after[key],plan.before[key]);
});
test('unexpected old gloss refuses rather than deleting edited content',()=>{
  const before=clone(plan.before);before.glosses.find(target).gloss='later edit';
  assert.throws(()=>deriveAfter(before),/glosses differ/);
});
test('unexpected old span reading refuses',()=>{
  const before=clone(plan.before);before.spans.find(target).reading='later edit';
  assert.throws(()=>deriveAfter(before),/missing or changed/);
});
test('CAS accepts exactly before/after and refuses unrelated changes',()=>{
  assert.equal(snapshotState(plan.before,plan),'before');
  assert.equal(snapshotState(plan.after,plan),'after');
  const edited=clone(plan.before);edited.examples[0].sentence+='changed';
  assert.throws(()=>snapshotState(edited,plan),/snapshot drift/);
});
test('v2 sidecar contains only the one untap change; original remains intact',()=>{
  const original=JSON.parse(fs.readFileSync(path.join(root,'data/example-spans-winter-postal-2026-10.json')));
  const v2=JSON.parse(fs.readFileSync(path.join(root,'data/example-spans-winter-postal-2026-10-v2.json')));
  const expected=clone(original);expected.ja['年賀はがきを十枚ください。'][3]={t:'ください'};
  assert.deepEqual(v2,expected);
  assert.equal(original.ja['年賀はがきを十枚ください。'][3].r,'ください');
});
