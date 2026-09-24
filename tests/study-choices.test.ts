import { test } from 'node:test';
import assert from 'node:assert/strict';
import cases from './fixtures/study-choice-cases.json';
import { assembleStudyChoices, choiceHash, choiceKey, choiceRandom, choiceReserve, choicesConflict, prepareChoiceCandidates, StudyChoiceSession, type StudyChoiceCandidate } from '../lib/study-choices';
import { attachChoiceExclusions, buildChoiceCandidates, candidateWord, explainScore, type CandidateMeta } from '../lib/distractors';
const word = (label: string, gloss = '', tier = 1, weight = 1): StudyChoiceCandidate => ({ wordId: label, label, gloss, language: 'en', tier, weight });
const target = word('washbasin', '洗手台');
const candidates = ['spoon', 'fork', 'plate', 'kettle', 'towel', 'mirror'].map(s => word(s));
for (const c of cases) test(`shared contract: ${c.name}`, () => {
  const a = word(c.a, c.ag), b = word(c.b, c.bg);
  assert.equal(choicesConflict(a, b), c.conflict);
  assert.equal(choicesConflict(b, a), c.conflict);
});
test('candidate cap, all exclusions and pairwise exclusions apply before sampling', () => {
  const input = [word('wash basin', '臉盆'), word('Wash-Basin'), word('sofa', '沙發'), word('couch', '長椅'),
    ...Array.from({length: 20}, (_, i) => word(`term${i}`)), { ...word('日本語'), language: 'ja' as const }];
  const pool = prepareChoiceCandidates(target, input);
  assert.equal(pool.length, 12);
  for (const a of pool) {
    assert.equal(a.language, 'en'); assert.equal(choicesConflict(target, a), false);
    for (const b of pool) if (a !== b) assert.equal(choicesConflict(a, b), false);
  }
});
test('tiers are exhausted in order and then reserves fill missing choices', () => {
  const choices = assembleStudyChoices(target, [word('spoon', '', 1), word('fork', '', 2), word('kettle', '', 3)], 42);
  assert.deepEqual(new Set(choices), new Set(['washbasin', 'spoon', 'fork', 'kettle']));
  assert.equal(assembleStudyChoices(target, [word('spoon')], 42).length, 4);
});
test('portable random and hash contract', () => {
  const rng = choiceRandom(42);
  assert.deepEqual(Array.from({length: 3}, () => rng() * 4294967296), [1083814273, 378494188, 2479403867]);
  assert.equal(choiceHash('en:washbasin:0'), 3207774618);
  assert.deepEqual(assembleStudyChoices(target, candidates, 42), ['fork', 'spoon', 'kettle', 'washbasin']);
});
test('session keeps an open question stable and changes two distractors on retry', () => {
  const session = new StudyChoiceSession(42);
  const first = session.choices(target, candidates);
  assert.deepEqual(session.choices(target, []), first);
  const retry = session.choices(target, candidates, 1);
  assert.equal(retry.length, 4);
  assert.ok(retry.filter(s => !first.includes(s)).length >= 2);
});
test('many seeds vary both combinations and answer position', () => {
  const sets = new Set<string>(), positions = [0, 0, 0, 0];
  const counts = new Map<string, number>();
  const weighted = candidates.map((c, i) => ({...c, weight: i === 0 ? 10 : 1}));
  for (let i = 0; i < 512; i++) {
    const result = assembleStudyChoices(target, weighted, choiceHash(`round:${i}`));
    positions[result.indexOf(target.label)]++;
    sets.add(result.filter(s => s !== target.label).sort().join('|'));
    for (const s of result) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  assert.ok(sets.size > 10);
  assert.ok(positions.every(n => n > 80 && n < 180), String(positions));
  assert.ok(counts.get('spoon')! > counts.get('fork')!);
});
test('empty, partial, old-cache and custom targets use same-language reserves', () => {
  for (const language of ['en', 'ja'] as const) {
    const custom = {...word(language === 'ja' ? '自分の物' : 'my object'), language};
    for (const seed of [0, 42, 0xffffffff]) {
      const choices = assembleStudyChoices(custom, [], seed);
      assert.equal(choices.length, 4); assert.equal(new Set(choices.map(choiceKey)).size, 4);
      for (const label of choices.filter(s => s !== custom.label)) assert.ok(choiceReserve.some(w => w.label === label && w.language === language));
    }
  }
});
test('every bundled term is covered and comes from several categories', () => {
  for (const w of choiceReserve) assert.equal(assembleStudyChoices(w, [], 42).length, 4);
  for (const lang of ['en', 'ja']) assert.ok(new Set(choiceReserve.filter(w => w.language === lang).map(w => w.category)).size >= 8);
});
test('live synonym restrictions cannot be bypassed by the bundled duplicate', () => {
  const blocked = {...word('spoon', '', 4), exclusions: ['wash basin']};
  for (let seed = 0; seed < 32; seed++) assert.ok(!assembleStudyChoices(target, [blocked], seed).includes('spoon'));
});
test('authored synonym edges are symmetric, pairwise, and never get a score bonus', () => {
  const meta = (label: string): CandidateMeta => ({cardId: label, wordId: label, word: label, back: label, category: 'bath', pos: 'noun', cefr: 'A1', pronunciation: '', gloss: label, language: 'en'});
  const entries = ['washbasin', 'basin', 'spoon', 'fork', 'kettle'].map(meta);
  const edges = [{source: 'washbasin', target: 'basin', type: 'synonym'}, {source: 'spoon', target: 'fork', type: 'synonym'}];
  const pool = attachChoiceExclusions(entries, edges);
  const t = {...pool[0], deckKey: 'zh-en'};
  assert.equal(explainScore(t, pool[1], edges).total, -Infinity);
  assert.ok(choicesConflict(candidateWord(pool[2]), candidateWord(pool[3])));
  const generated = buildChoiceCandidates(t, pool, edges);
  assert.ok(!generated.some(w => w.label === 'basin'));
  assert.ok(!(generated.some(w => w.label === 'spoon') && generated.some(w => w.label === 'fork')));
});

test('published-catalog release gate rejects empty data and uncovered words', async () => {
  const { assertPublishedChoiceCoverage } = await import('../lib/study-choice-catalog');
  const fakeSql = (rows: unknown[]) => ((strings: TemplateStringsArray) => Promise.resolve(strings.join('').includes('FROM words w') ? rows : [])) as unknown as import('postgres').Sql;
  await assert.rejects(assertPublishedChoiceCoverage(fakeSql([])), /coverage failed/);
  const blocked = choiceReserve.filter(w => w.language === 'en').map(w => w.label);
  await assert.rejects(assertPublishedChoiceCoverage(fakeSql([{word_id: 'custom', label: 'my object', language: 'en', gloss: '', aliases: blocked}])), /1\/1/);
});
