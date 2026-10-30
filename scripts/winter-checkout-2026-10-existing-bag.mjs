// Scope-limited reader/CAS updater for the existing plastic-bag record.
// No connection or write is performed merely by importing this module.
const insist=(condition,message)=>{if(!condition)throw new Error(message);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
export const sameBagValue=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const noteLanguages=['en','ja'];
const note=(snapshot,language)=>snapshot.localizedTexts.find(t=>t.field==='note'&&t.language===language);

export function validateBagProposal(proposal){
  const {before,after}=proposal;
  insist(proposal.wordId==='plastic-bag'&&before.word.length===1&&after.word.length===1,'Only the existing plastic-bag word is allowed');
  insist(before.word[0].id==='plastic-bag'&&before.word[0].status==='published'&&before.word[0].category==='supermarket','Existing bag must remain published in supermarket');
  const expected=structuredClone(before);
  expected.word[0].also_known_as=[...before.word[0].also_known_as,...(before.word[0].also_known_as.includes('レジ袋')?[]:['レジ袋'])];
  insist(typeof after.word[0].note==='string'&&after.word[0].note.startsWith(before.word[0].note+'\n\n')&&after.word[0].note.includes('レジ袋'),'Traditional-Chinese base note must retain the old prefix and append contextual usage');
  expected.word[0].note=after.word[0].note;
  for(const language of noteLanguages){
    const old=note(before,language),next=note(after,language);
    insist(next&&next.word_id==='plastic-bag'&&typeof next.value==='string'&&next.value.trim(),`Missing ${language} usage note`);
    const prefix=old?.value??(language==='zh-Hant'?before.word[0].note:'');
    if(prefix)insist(next.value.startsWith(prefix+'\n\n')&&next.value.length>prefix.length+2,`${language}: existing note must be retained verbatim before new usage`);
    insist(next.value.includes('レジ袋'),`${language}: contextual Japanese usage is missing`);
    const row=note(expected,language);if(row)row.value=next.value;else expected.localizedTexts.push(structuredClone(next));
  }
  expected.localizedTexts.sort((a,b)=>a.field.localeCompare(b.field)||a.language.localeCompare(b.language));
  // Compare without relying on localeCompare vs PostgreSQL collation for rows.
  const sorted=s=>({...s,localizedTexts:[...s.localizedTexts].sort((a,b)=>`${a.field}\0${a.language}`<`${b.field}\0${b.language}`?-1:1)});
  insist(sameBagValue(sorted(expected),sorted(after)),'Proposal changes bag fields outside aliases, the Traditional-Chinese base note and two localized usage notes');
  insist(after.triggers.length===0,'Unexpected triggers need a new review before an exact-delta update');
  return true;
}

export async function snapshotBag(tx){
  const rows=async q=>(await q).map(r=>r.row);
  return {
    word:await rows(tx`SELECT to_jsonb(w) AS row FROM words w WHERE id='plastic-bag'`),
    terms:await rows(tx`SELECT to_jsonb(t) AS row FROM word_terms t WHERE word_id='plastic-bag' ORDER BY language`),
    definitions:await rows(tx`SELECT to_jsonb(d) AS row FROM word_definitions d WHERE word_id='plastic-bag' ORDER BY language,sort_order,id`),
    examples:await rows(tx`SELECT to_jsonb(e) AS row FROM word_examples e WHERE word_id='plastic-bag' ORDER BY sort_order,id`),
    translations:await rows(tx`SELECT to_jsonb(t) AS row FROM word_example_translations t JOIN word_examples e ON e.id=t.example_id WHERE e.word_id='plastic-bag' ORDER BY t.example_id,t.language`),
    localizedTexts:await rows(tx`SELECT to_jsonb(t) AS row FROM word_localized_texts t WHERE word_id='plastic-bag' ORDER BY field,language`),
    wordMedia:await rows(tx`SELECT to_jsonb(m) AS row FROM word_media m WHERE word_id='plastic-bag' ORDER BY id`),
    exampleMedia:await rows(tx`SELECT to_jsonb(m) AS row FROM word_example_media m JOIN word_examples e ON e.id=m.example_id WHERE e.word_id='plastic-bag' ORDER BY m.example_id,m.locale`),
    categoryLinks:await rows(tx`SELECT to_jsonb(c) AS row FROM word_categories c WHERE word_id='plastic-bag' ORDER BY category_id`),
    relations:await rows(tx`SELECT to_jsonb(r) AS row FROM word_relations r WHERE source_word_id='plastic-bag' OR target_word_id='plastic-bag' ORDER BY source_word_id,target_word_id,relation_type`),
    cards:await rows(tx`SELECT to_jsonb(c) AS row FROM cards c WHERE word_id='plastic-bag' ORDER BY id`),
    triggers:await tx`SELECT trigger_name,action_timing,event_manipulation,action_statement FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table IN ('words','word_localized_texts') ORDER BY event_object_table,trigger_name`,
  };
}

export function classifyBagSnapshot(actual,proposal){
  validateBagProposal(proposal);
  if(sameBagValue(actual,proposal.before))return 'before';
  if(sameBagValue(actual,proposal.after))return 'after';
  return 'drift';
}

export async function applyBagDelta(tx,proposal,direction='forward'){
  validateBagProposal(proposal);insist(['forward','reverse'].includes(direction),'Invalid bag update direction');
  const expected=direction==='forward'?proposal.before:proposal.after;
  const target=direction==='forward'?proposal.after:proposal.before;
  await tx`SELECT id FROM words WHERE id='plastic-bag' FOR UPDATE`;
  insist(sameBagValue(await snapshotBag(tx),expected),'Existing bag drifted; refuse overwriting later content');
  const changed=await tx`UPDATE words SET also_known_as=${target.word[0].also_known_as}::text[],note=${target.word[0].note} WHERE id='plastic-bag' AND also_known_as=${expected.word[0].also_known_as}::text[] AND note IS NOT DISTINCT FROM ${expected.word[0].note} RETURNING id`;
  insist(changed.length===1,'Existing bag alias old-value guard failed');
  let localizedChanges=0;
  for(const language of noteLanguages){
    const old=note(expected,language),next=note(target,language);
    let rows;
    if(!old&&next){
      rows=await tx`INSERT INTO word_localized_texts (word_id,field,language,value) VALUES ('plastic-bag','note',${language},${next.value}) RETURNING word_id`;
    }else if(old&&!next){
      rows=await tx`DELETE FROM word_localized_texts WHERE word_id='plastic-bag' AND field='note' AND language=${language} AND value=${old.value} RETURNING word_id`;
    }else{
      insist(old&&next,'Unexpected empty localized delta');
      rows=await tx`UPDATE word_localized_texts SET value=${next.value} WHERE word_id='plastic-bag' AND field='note' AND language=${language} AND value=${old.value} RETURNING word_id`;
    }
    insist(rows.length===1,`${language}: existing usage-note old-value guard failed`);localizedChanges++;
  }
  insist(sameBagValue(await snapshotBag(tx),target),'Existing bag after-state mismatch; transaction must abort');
  return {wordId:'plastic-bag',aliasRowsUpdated:1,baseNoteRowsUpdated:1,localizedNoteRowsChanged:localizedChanges,direction};
}
