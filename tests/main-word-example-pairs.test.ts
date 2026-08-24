import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMainWordExamplePair,
  isKnownLegacyExampleSet,
  isKnownPreviousTargetExamplePair,
  isTargetExamplePair,
  MAIN_WORD_EXAMPLE_PAIRS,
  type StoredMainWordExample,
  validateMainWordExampleCoverage,
} from "../lib/main-word-example-pairs";
import { MAIN_WORD_LEGACY_EXAMPLE_SETS } from "../lib/main-word-legacy-example-sets";
import {
  loadExampleSpanCorpus,
  validateMainWordExampleSpanCoverage,
} from "../lib/example-span-corpus";
import { BATHROOM_SIMPLE_OVERRIDES } from "../lib/main-word-example-pairs/bathroom";
import { BATHROOM_PREVIOUS_COMPLEX_EXAMPLES } from "../lib/main-word-example-pairs/bathroom";
import { words } from "../lib/words";

test("every published main word has one complete simple/complex example pair", () => {
  const publishedIds = words
    .filter(({ status }) => status === "published")
    .map(({ id }) => id);
  assert.deepEqual(validateMainWordExampleCoverage(publishedIds), []);
  assert.equal(MAIN_WORD_EXAMPLE_PAIRS.length, new Set(publishedIds).size);

  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    assert.equal(pair.examples.length, 2, pair.id);
    const [simple, complex] = pair.examples;
    assert.equal(simple.sortOrder, 0, pair.id);
    assert.match(simple.cefrLevel, /^A[12]$/, pair.id);
    assert.equal(complex.sortOrder, 1, pair.id);
    assert.match(complex.cefrLevel, /^B[12]$/, pair.id);

    for (const example of pair.examples) {
      assert.ok(example.en.trim(), `${pair.id}: missing English`);
      assert.ok(example.ja.trim(), `${pair.id}: missing Japanese`);
      assert.ok(example.zh.trim(), `${pair.id}: missing Traditional Chinese`);
    }
    assert.notEqual(simple.en, complex.en, `${pair.id}: duplicate English`);
    assert.notEqual(simple.ja, complex.ja, `${pair.id}: duplicate Japanese`);
    assert.notEqual(simple.zh, complex.zh, `${pair.id}: duplicate Traditional Chinese`);
  }
});

test("complex examples express a real relationship instead of only being longer", () => {
  const relationship =
    /(^to\b|\bin case\b|\b(after|although|as|because|before|even|if|instead|once|rather|since|so|until|when|whenever|where|while|without)\b)/i;
  const missing = MAIN_WORD_EXAMPLE_PAIRS.filter(
    ({ examples }) => !relationship.test(examples[1].en),
  ).map(({ id }) => id);
  assert.deepEqual(missing, []);
});

test("target, known legacy, missing-ja seed, and edited states are distinguished", () => {
  const pair = MAIN_WORD_EXAMPLE_PAIRS[0];
  const legacy = MAIN_WORD_LEGACY_EXAMPLE_SETS.find(({ id }) => id === pair.id);
  assert.ok(legacy);

  const target: StoredMainWordExample[] = pair.examples.map((example) => ({
    ...example,
  }));
  assert.equal(isTargetExamplePair(target, pair), true);
  assert.equal(classifyMainWordExamplePair(pair.id, target), "target");

  const old: StoredMainWordExample[] = legacy.examples.map((example) => ({
    ...example,
    cefrLevel: null,
  }));
  assert.equal(isKnownLegacyExampleSet(pair.id, old), true);
  assert.equal(classifyMainWordExamplePair(pair.id, old), "legacy");

  const cleanSeed = old.map((example) => ({ ...example, ja: "" }));
  assert.equal(isKnownLegacyExampleSet(pair.id, cleanSeed), true);

  const edited = old.map((example, index) =>
    index === 0 ? { ...example, en: `${example.en} Edited.` } : example,
  );
  assert.equal(isKnownLegacyExampleSet(pair.id, edited), false);
  assert.equal(classifyMainWordExamplePair(pair.id, edited), "conflict");
});

test("the deployed bathroom template pair is a guarded previous target", () => {
  const id = "toilet-seat";
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
  const legacy = MAIN_WORD_LEGACY_EXAMPLE_SETS.find((row) => row.id === id);
  assert.ok(pair);
  assert.ok(legacy);
  const previous: StoredMainWordExample[] = [
    { ...legacy.examples.find(({ sortOrder }) => sortOrder === 0)!, cefrLevel: "A2" },
    { ...pair.examples[1] },
  ];
  assert.equal(isKnownPreviousTargetExamplePair(id, previous), true);
  assert.equal(classifyMainWordExamplePair(id, previous), "legacy");

  previous[0] = { ...previous[0], en: `${previous[0].en} Edited.` };
  assert.equal(isKnownPreviousTargetExamplePair(id, previous), false);
  assert.equal(classifyMainWordExamplePair(id, previous), "conflict");
});

test("the audited bathroom pair corrections accept only their exact deployed predecessor", () => {
  const id = "bucket";
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
  const previousComplex = BATHROOM_PREVIOUS_COMPLEX_EXAMPLES.find((row) => row.id === id);
  assert.ok(pair);
  assert.ok(previousComplex);

  const previous: StoredMainWordExample[] = [
    { ...pair.examples[0] },
    { ...previousComplex, cefrLevel: "B1", sortOrder: 1 },
  ];
  assert.equal(isKnownPreviousTargetExamplePair(id, previous), true);
  assert.equal(classifyMainWordExamplePair(id, previous), "legacy");

  previous[1] = { ...previous[1], ja: `${previous[1].ja}編集` };
  assert.equal(isKnownPreviousTargetExamplePair(id, previous), false);
  assert.equal(classifyMainWordExamplePair(id, previous), "conflict");
});

test("coverage follows the current published ID set rather than a fixed count", () => {
  const current = MAIN_WORD_EXAMPLE_PAIRS.map(({ id }) => id);
  assert.deepEqual(validateMainWordExampleCoverage(current), []);
  assert.deepEqual(validateMainWordExampleCoverage([...current, "future-word"]), [
    "missing target pair: future-word",
  ]);
  assert.deepEqual(
    validateMainWordExampleCoverage(current.filter((id) => id !== current[0])),
    [`target pair is not published: ${current[0]}`],
  );
});

test("every target example ships its English and Japanese tappable translations", () => {
  assert.deepEqual(
    validateMainWordExampleSpanCoverage(
      MAIN_WORD_EXAMPLE_PAIRS,
      loadExampleSpanCorpus(),
    ),
    [],
  );
});

test("every bathroom simple example teaches a concrete daily use", () => {
  const bathroomIds = words
    .filter(({ category, status }) => category === "bathroom" && status === "published")
    .map(({ id }) => id)
    .sort();
  assert.deepEqual(BATHROOM_SIMPLE_OVERRIDES.map(({ id }) => id).sort(), bathroomIds);

  const generic = /\bis in the bathroom\b|バスルームにあります|在浴室裡/;
  for (const example of BATHROOM_SIMPLE_OVERRIDES) {
    assert.doesNotMatch(example.en, generic, example.id);
    assert.doesNotMatch(example.ja, generic, example.id);
    assert.doesNotMatch(example.zh, generic, example.id);
  }
});
