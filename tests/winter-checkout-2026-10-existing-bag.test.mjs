import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateBagProposal,classifyBagSnapshot,applyBagDelta} from '../scripts/winter-checkout-2026-10-existing-bag.mjs';
const proposal=JSON.parse(fs.readFileSync(new URL('../data/winter-checkout-2026-10-existing-bag-update.json',import.meta.url)));
const clone=x=>structuredClone(x);
const sorted=s=>({...s,localizedTexts:[...s.localizedTexts].sort((a,b)=>`${a.field}\0${a.language}`<`${b.field}\0${b.language}`?-1:1)});
function fixture(initial){
  const state=clone(initial),queries=[];
  const tx=async (strings,...args)=>{
    const query=strings.join('?').replace(/\s+/g,' ').trim();queries.push(query);
    if(query.startsWith('SELECT trigger_name'))return clone(state.triggers);
    if(query.startsWith('SELECT id FROM words'))return [{id:'plastic-bag'}];
    if(query.startsWith('SELECT to_jsonb')){
      const tables=[['FROM words w','word'],['FROM word_terms t','terms'],['FROM word_definitions d','definitions'],['FROM word_examples e','examples'],['FROM word_example_translations t','translations'],['FROM word_localized_texts t','localizedTexts'],['FROM word_media m','wordMedia'],['FROM word_example_media m','exampleMedia'],['FROM word_categories c','categoryLinks'],['FROM word_relations r','relations'],['FROM cards c','cards']];
      const hit=tables.find(([pattern])=>query.includes(pattern));assert.ok(hit,query);
      return clone(sorted(state)[hit[1]]).map(row=>({row}));
    }
    if(query.startsWith('UPDATE words SET also_known_as')){
      assert.deepEqual(state.word[0].also_known_as,args[2]);assert.equal(state.word[0].note,args[3]);state.word[0].also_known_as=clone(args[0]);state.word[0].note=args[1];return [{id:'plastic-bag'}];
    }
    if(query.startsWith('INSERT INTO word_localized_texts')){
      assert.equal(state.localizedTexts.some(t=>t.field==='note'&&t.language===args[0]),false);
      state.localizedTexts.push({word_id:'plastic-bag',field:'note',language:args[0],value:args[1]});return [{word_id:'plastic-bag'}];
    }
    if(query.startsWith('UPDATE word_localized_texts')){
      const row=state.localizedTexts.find(t=>t.field==='note'&&t.language===args[1]);
      assert.equal(row?.value,args[2]);row.value=args[0];return [{word_id:'plastic-bag'}];
    }
    if(query.startsWith('DELETE FROM word_localized_texts')){
      const index=state.localizedTexts.findIndex(t=>t.field==='note'&&t.language===args[0]&&t.value===args[1]);
      assert.notEqual(index,-1);state.localizedTexts.splice(index,1);return [{word_id:'plastic-bag'}];
    }
    throw Error(`Unexpected fixture query: ${query}`);
  };
  return {state,queries,tx};
}

test('reviewable delta appends only one alias and preserves every original field/prefix',()=>{
  assert.equal(validateBagProposal(proposal),true);
  assert.equal(classifyBagSnapshot(proposal.before,proposal),'before');
  assert.equal(classifyBagSnapshot(proposal.after,proposal),'after');
  assert.equal(proposal.after.word[0].category,'supermarket');
  assert.deepEqual(proposal.after.word[0].also_known_as,[...proposal.before.word[0].also_known_as,'レジ袋']);
});
test('changing classification or audio in proposal is rejected',()=>{
  for(const field of ['category','audio_url']){
    const bad=clone(proposal);bad.after.word[0][field]='changed';
    assert.throws(()=>validateBagProposal(bad),/outside aliases/);
  }
});
test('erasing an existing note prefix is rejected',()=>{
  const bad=clone(proposal);bad.after.localizedTexts.find(t=>t.field==='note'&&t.language==='ja').value='レジ袋 only';
  assert.throws(()=>validateBagProposal(bad),/retained verbatim/);
});
test('actual forward helper changes one alias row and the base note plus exactly two localized note rows',async()=>{
  const f=fixture(proposal.before);const result=await applyBagDelta(f.tx,proposal);
  assert.deepEqual(sorted(f.state),sorted(proposal.after));
  assert.deepEqual(result,{wordId:'plastic-bag',aliasRowsUpdated:1,baseNoteRowsUpdated:1,localizedNoteRowsChanged:2,direction:'forward'});
  assert.equal(f.queries.filter(q=>/^(UPDATE|INSERT|DELETE)\b/.test(q)).length,3);
});
test('owned rollback helper restores exact before-state without touching headword/media/category',async()=>{
  const f=fixture(proposal.after);await applyBagDelta(f.tx,proposal,'reverse');
  assert.deepEqual(sorted(f.state),sorted(proposal.before));
});
test('later edited notes or examples refuse before any DML',async()=>{
  for(const kind of ['localizedTexts','examples']){
    const edited=clone(proposal.before);
    if(kind==='localizedTexts')edited.localizedTexts.find(t=>t.field==='note').value+='later edit';
    else edited.examples[0].sentence+='later edit';
    const f=fixture(edited);assert.equal(classifyBagSnapshot(edited,proposal),'drift');
    await assert.rejects(applyBagDelta(f.tx,proposal),/drifted/);
    assert.equal(f.queries.some(q=>/^(UPDATE|INSERT|DELETE)\b/.test(q)),false);
  }
});
test('later edits also prevent reverse helper from overwriting user changes',async()=>{
  const edited=clone(proposal.after);edited.word[0].also_known_as.push('later alias');
  const f=fixture(edited);await assert.rejects(applyBagDelta(f.tx,proposal,'reverse'),/drifted/);
  assert.equal(f.queries.some(q=>/^(UPDATE|INSERT|DELETE)\b/.test(q)),false);
});
