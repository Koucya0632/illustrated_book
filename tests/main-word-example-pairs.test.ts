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
import {
  BEDROOM_PREVIOUS_COMPLEX_EXAMPLES,
  BEDROOM_SIMPLE_OVERRIDES,
} from "../lib/main-word-example-pairs/bedroom";
import {
  KITCHEN_PREVIOUS_COMPLEX_EXAMPLES,
  KITCHEN_SIMPLE_OVERRIDES,
} from "../lib/main-word-example-pairs/kitchen";
import {
  LIVING_ROOM_PREVIOUS_COMPLEX_EXAMPLES,
  LIVING_ROOM_SIMPLE_OVERRIDES,
} from "../lib/main-word-example-pairs/living-room";
import { LIVING_ROOM_MAIN_WORD_CORRECTIONS } from "../lib/living-room-main-word-corrections";
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

test("the audited kitchen pair corrections accept the exact deployed pair in one migration", () => {
  for (const previousComplex of KITCHEN_PREVIOUS_COMPLEX_EXAMPLES) {
    const { id } = previousComplex;
    const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
    const legacy = MAIN_WORD_LEGACY_EXAMPLE_SETS.find((row) => row.id === id);
    assert.ok(pair, id);
    assert.ok(legacy, id);

    const previous: StoredMainWordExample[] = [
      { ...legacy.examples.find(({ sortOrder }) => sortOrder === 0)!, cefrLevel: "A2" },
      { ...previousComplex, cefrLevel: "B1", sortOrder: 1 },
    ];
    assert.equal(isKnownPreviousTargetExamplePair(id, previous), true, id);
    assert.equal(classifyMainWordExamplePair(id, previous), "legacy", id);

    const edited = previous.map((example) => ({ ...example }));
    edited[0].zh = `${edited[0].zh}編輯`;
    assert.equal(isKnownPreviousTargetExamplePair(id, edited), false, id);
    assert.equal(classifyMainWordExamplePair(id, edited), "conflict", id);
  }
});

test("the audited bedroom pair corrections accept the exact deployed pair in one migration", () => {
  for (const previousComplex of BEDROOM_PREVIOUS_COMPLEX_EXAMPLES) {
    const { id } = previousComplex;
    const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
    const legacy = MAIN_WORD_LEGACY_EXAMPLE_SETS.find((row) => row.id === id);
    assert.ok(pair, id);
    assert.ok(legacy, id);

    const previous: StoredMainWordExample[] = [
      { ...legacy.examples.find(({ sortOrder }) => sortOrder === 0)!, cefrLevel: "A2" },
      { ...previousComplex, cefrLevel: "B1", sortOrder: 1 },
    ];
    assert.equal(isKnownPreviousTargetExamplePair(id, previous), true, id);
    assert.equal(classifyMainWordExamplePair(id, previous), "legacy", id);

    const edited = previous.map((example) => ({ ...example }));
    edited[1].ja = `${edited[1].ja}編集`;
    assert.equal(isKnownPreviousTargetExamplePair(id, edited), false, id);
    assert.equal(classifyMainWordExamplePair(id, edited), "conflict", id);
  }
});

test("the audited living-room pair corrections accept only the exact deployed predecessor", () => {
  for (const previousComplex of LIVING_ROOM_PREVIOUS_COMPLEX_EXAMPLES) {
    const { id } = previousComplex;
    const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
    const legacy = MAIN_WORD_LEGACY_EXAMPLE_SETS.find((row) => row.id === id);
    assert.ok(pair, id);
    assert.ok(legacy, id);

    const previous: StoredMainWordExample[] = [
      { ...legacy.examples.find(({ sortOrder }) => sortOrder === 0)!, cefrLevel: "A2" },
      { ...previousComplex, cefrLevel: "B1", sortOrder: 1 },
    ];
    assert.equal(isKnownPreviousTargetExamplePair(id, previous), true, id);
    assert.equal(classifyMainWordExamplePair(id, previous), "legacy", id);

    const edited = previous.map((example) => ({ ...example }));
    edited[1].ja = `${edited[1].ja}編集`;
    assert.equal(isKnownPreviousTargetExamplePair(id, edited), false, id);
    assert.equal(classifyMainWordExamplePair(id, edited), "conflict", id);
  }
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

test("every corrected kitchen simple example teaches a concrete daily use", () => {
  const expectedIds = [
    "air-fryer", "aluminum-foil", "blender", "bowl", "can-opener", "cloth",
    "coffee-maker", "dish-soap", "dishwasher", "faucet", "food-container",
    "food-processor", "fork", "freezer", "fridge", "glass", "grater", "kettle",
    "kitchen-knife", "knife", "ladle", "lid", "measuring-cup", "measuring-spoon",
    "paper-towel", "peeler", "plastic-wrap", "plate", "range-hood", "rice-cooker",
    "scissors", "seasoning-jar", "slotted-spoon", "spatula", "sponge",
    "steamer-basket", "strainer", "table-knife", "teapot", "toaster", "tongs",
    "trash-bag", "whisk", "wok",
  ].sort();
  assert.deepEqual(KITCHEN_SIMPLE_OVERRIDES.map(({ id }) => id).sort(), expectedIds);

  const generic = /\bI use the\b.*\bin the kitchen\b|キッチンで.*使います|我在廚房使用/;
  for (const example of KITCHEN_SIMPLE_OVERRIDES) {
    assert.doesNotMatch(example.en, generic, example.id);
    assert.doesNotMatch(example.ja, generic, example.id);
    assert.doesNotMatch(example.zh, generic, example.id);
  }
});

test("every bedroom simple example teaches a concrete daily use", () => {
  const bedroomIds = words
    .filter(({ category, status }) => category === "bedroom" && status === "published")
    .map(({ id }) => id)
    .sort();
  const pairs = MAIN_WORD_EXAMPLE_PAIRS.filter(({ id }) => bedroomIds.includes(id));
  assert.equal(pairs.length, bedroomIds.length);

  assert.equal(words.find(({ id }) => id === "quilt")?.word, "duvet");
  assert.equal(words.find(({ id }) => id === "robe")?.word, "dressing gown");
  assert.equal(words.find(({ id }) => id === "heater")?.chinese, "電暖器");
  assert.equal(words.find(({ id }) => id === "lamp")?.chinese, "燈");
  assert.equal(
    MAIN_WORD_EXAMPLE_PAIRS.find(({ id }) => id === "heater")?.examples[1].zh,
    "打開電暖器前先把毯子移遠，以免起火。",
  );

  const generic = /\bis in the bedroom\b|寝室にあります|在臥室裡/;
  for (const pair of pairs) {
    const simple = pair.examples[0];
    assert.doesNotMatch(simple.en, generic, pair.id);
    assert.doesNotMatch(simple.ja, generic, pair.id);
    assert.doesNotMatch(simple.zh, generic, pair.id);
  }

  const correctedIds = new Set(BEDROOM_SIMPLE_OVERRIDES.map(({ id }) => id));
  for (const id of [
    "air-conditioner", "air-purifier", "bed-sheet", "bedside-lamp", "bedspread",
    "bookshelf", "chair", "desk-lamp", "door", "drawer", "fan", "hanger",
    "headboard", "heater", "humidifier", "mattress", "nightstand", "photo-frame",
    "pillowcase", "quilt", "robe", "storage-box", "vanity-table", "window",
  ]) {
    assert.equal(correctedIds.has(id), true, id);
  }
});

test("the audited living-room examples keep the target concept and aligned daily meaning", () => {
  assert.deepEqual(
    LIVING_ROOM_SIMPLE_OVERRIDES.map(({ id }) => id).sort(),
    ["armchair", "projector"],
  );

  const expected = new Map([
    ["armchair", ["このアームチェアなら快適に読書できます。", "高い背もたれが腰を支えてくれる"]],
    ["cabinet", ["一番上の棚"]],
    ["cushion", ["背中にクッションを当ててください"]],
    ["game-console", ["ゲーム機の電源を切ってください"]],
    ["potted-plant", ["明るい日陰", "日差しの強い窓辺"]],
    ["projector", ["We use the projector"]],
    ["recliner", ["Before reclining the chair", "足置きの下"]],
    ["remote", ["After using the remote"]],
    ["robot-vacuum", ["ケーブルに引っかからない"]],
    ["side-table", ["non-slip coaster", "滑り止め付きのコースター", "防滑杯墊"]],
  ]);

  for (const [id, fragments] of expected) {
    const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
    assert.ok(pair, id);
    const text = pair.examples.flatMap(({ en, ja, zh }) => [en, ja, zh]).join("\n");
    for (const fragment of fragments) assert.ok(text.includes(fragment), `${id}: ${fragment}`);
  }
});

test("the audited living-room definitions use ordinary indoor terms and the full concept", () => {
  const correction = (id: string) => {
    const row = LIVING_ROOM_MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.ok(row, id);
    return row;
  };

  assert.match(correction("floor-lamp").jaDefinition!.value, /床に置いて/);
  assert.match(correction("robot-vacuum").jaDefinition!.value, /床を自動で掃除/);
  assert.match(correction("rug").jaDefinition!.value, /床の一部に敷く敷物/);
  assert.equal(
    correction("potted-plant").enDefinition!.value,
    "A plant grown in a flowerpot or other container.",
  );
  assert.match(correction("table-lamp").jaDefinition!.value, /テーブルや台の上/);
});
