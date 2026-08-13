import assert from "node:assert/strict";
import test from "node:test";
import { auditMainWordRows, type MainWordAuditRow } from "../lib/main-word-audit";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import { MAIN_WORD_MERGES } from "../lib/main-word-merges";
import { segmentFurigana } from "../lib/kana";

function validRow(id: string): MainWordAuditRow {
  return {
    id,
    jaTerm: "フライパン",
    jaReading: "フライパン",
    readingSegments: [],
    jaDefinition: "「フライパン」は、食材を焼いたり炒めたりする調理器具です。",
    zhDefinition: "平底鍋",
    exampleId: 1,
    jaExample: "フライパンで卵を焼きます。",
    zhExample: "我用平底鍋煎蛋。",
  };
}

const staleSlowCooker: MainWordAuditRow = {
  id: "electric-cooker",
  jaTerm: "スロークッカー",
  jaReading: "でんきちょうりき",
  readingSegments: [
    { text: "電", ruby: "でん" },
    { text: "気", ruby: "き" },
    { text: "調", ruby: "ちょう" },
    { text: "理", ruby: "り" },
    { text: "器", ruby: "き" },
  ],
  jaDefinition: "「炊飯器」は、電気を使って調理する家電製品です。",
  zhDefinition: "慢燉鍋",
  exampleId: 1,
  jaExample: "私はキッチンで炊飯器を使います。",
  zhExample: "我在廚房使用慢燉鍋。",
};

test("the mixed slow-cooker payload is rejected at every structural seam", () => {
  const issues = auditMainWordRows([staleSlowCooker]);
  assert.deepEqual(
    issues.map((entry) => entry.field),
    ["jaReading", "readingSegments", "jaDefinition", "jaExample"],
  );
});

test("a fully synchronized slow-cooker payload passes", () => {
  assert.deepEqual(
    auditMainWordRows([
      {
        ...staleSlowCooker,
        jaReading: "スロークッカー",
        readingSegments: [],
        jaDefinition:
          "「スロークッカー」は、低い温度で食材を長時間かけて煮込む電気調理器です。",
        jaExample: "スロークッカーでシチューを作ります。",
      },
    ]),
    [],
  );
});

test("the retired frying-pan row cannot be published beside canonical pan", () => {
  const merge = MAIN_WORD_MERGES.find(({ sourceId }) => sourceId === "frying-pan");
  assert.deepEqual(merge, {
    sourceId: "frying-pan",
    targetId: "pan",
    reason: "Both rows display as フライパン / 平底鍋 in the Japanese atlas.",
  });

  const issues = auditMainWordRows([validRow("frying-pan"), validRow("pan")]);
  assert.deepEqual(
    issues.map(({ id, field }) => ({ id, field })),
    [{ id: "frying-pan", field: "duplicateMainWord" }],
  );
});

test("JSON text is rejected where the iOS contract requires a segment array", () => {
  const issues = auditMainWordRows([
    {
      ...staleSlowCooker,
      jaTerm: "受付カウンター",
      jaReading: "うけつけカウンター",
      readingSegments: '[{"text":"受付","ruby":"うけつけ"}]',
      jaDefinition: "「受付カウンター」は、来訪者を迎える場所です。",
      jaExample: "受付カウンターで名前を書きます。",
    },
  ]);

  assert.deepEqual(issues.map((entry) => entry.field), ["readingSegments"]);
});

test("missing required main-catalog localizations are reported", () => {
  const issues = auditMainWordRows([
    {
      id: "missing",
      jaTerm: null,
      jaReading: null,
      readingSegments: null,
      jaDefinition: null,
      zhDefinition: null,
      exampleId: null,
      jaExample: null,
      zhExample: null,
    },
  ]);
  assert.deepEqual(
    issues.map((entry) => entry.field),
    ["jaTerm", "zhDefinition", "jaDefinition", "example", "jaExample", "zhExample"],
  );
});

test("a renamed Japanese headword always carries its matching reading", () => {
  const incomplete = MAIN_WORD_CORRECTIONS.filter(
    (correction) =>
      correction.oldJa &&
      correction.ja &&
      correction.oldJa !== correction.ja &&
      (!correction.oldJaReading || !correction.jaReading),
  ).map((correction) => correction.id);

  assert.deepEqual(incomplete, []);
});

test("slow cooker correction replaces the whole concept, not only its label", () => {
  const correction = MAIN_WORD_CORRECTIONS.find(({ id }) => id === "electric-cooker");
  assert.ok(correction);
  assert.equal(correction.word, "slow cooker");
  assert.equal(correction.ja, "スロークッカー");
  assert.equal(correction.jaReading, "スロークッカー");
  assert.match(correction.enDefinition?.value ?? "", /low temperature/);
  assert.match(correction.jaDefinition?.value ?? "", /スロークッカー/);
  assert.match(correction.chineseDefinition?.value ?? "", /低溫/);
  assert.match(correction.examples?.[0]?.ja ?? "", /スロークッカー/);
  assert.match(correction.examples?.[0]?.zh ?? "", /慢燉鍋/);
});

const GENERIC_SEASONING_EXAMPLE_IDS = [
  "apple-cider-vinegar",
  "baking-powder",
  "baking-soda",
  "black-vinegar",
  "bonito-powder",
  "bouillon-powder",
  "brown-sugar",
  "cardamom",
  "chicken-bouillon-powder",
  "chili-bean-paste",
  "chili-oil",
  "cinnamon-bark",
  "cloves",
  "coriander-seeds",
  "cornstarch",
  "cumin-powder",
  "curry-roux",
  "dark-brown-sugar",
  "fennel-seeds",
  "flour",
  "honey",
  "kombu-powder",
  "mirin",
  "miso",
  "oregano",
  "parsley",
  "peanut-butter",
  "potato-starch",
  "rice-wine",
  "rock-sugar",
  "sake",
  "sesame-paste",
  "shacha-sauce",
  "shichimi",
  "sichuan-peppercorn",
  "star-anise",
  "sweet-chili-sauce",
  "thick-soy-sauce",
  "turmeric-powder",
  "vanilla-extract",
  "vegetable-oil",
  "wasabi",
  "white-sugar",
  "white-vinegar",
  "yellow-mustard",
] as const;

test("seasoning corrections replace every generic template with a concrete daily example", () => {
  for (const id of GENERIC_SEASONING_EXAMPLE_IDS) {
    const correction = MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.ok(correction, `missing correction for ${id}`);
    const example = correction.examples?.find(({ sortOrder }) => sortOrder === 0);
    assert.ok(example, `missing primary example correction for ${id}`);
    assert.match(example.oldEn, /^Add some .+ to the dish\.$/);
    assert.doesNotMatch(example.en, /^Add some .+ to the dish\.$/);
    assert.match(example.oldJa ?? "", /^この料理に.+を少し加えます。$/);
    assert.doesNotMatch(example.ja ?? "", /^この料理に.+を少し加えます。$/);
    assert.match(example.oldZh, /^在這道菜裡加一些.+。$/);
    assert.doesNotMatch(example.zh, /^在這道菜裡加一些.+。$/);
  }
});

test("seasoning concept corrections keep headword, reading, definition, and example aligned", () => {
  const chicken = MAIN_WORD_CORRECTIONS.find(
    ({ id }) => id === "chicken-bouillon-powder",
  );
  assert.equal(chicken?.ja, "鶏ガラスープの素");
  assert.equal(chicken?.jaReading, "とりガラスープのもと");
  assert.deepEqual(
    segmentFurigana(chicken?.ja ?? "", chicken?.jaReading ?? "", new Map()),
    [
      { text: "鶏", ruby: "とり" },
      { text: "ガラスープの", ruby: null },
      { text: "素", ruby: "もと" },
    ],
  );
  assert.match(chicken?.examples?.[0]?.ja ?? "", /鶏ガラスープの素/);

  const riceWine = MAIN_WORD_CORRECTIONS.find(({ id }) => id === "rice-wine");
  assert.equal(riceWine?.ja, "台湾米酒");
  assert.equal(riceWine?.jaReading, "たいわんミーチュウ");
  assert.deepEqual(
    segmentFurigana(riceWine?.ja ?? "", riceWine?.jaReading ?? "", new Map()),
    [{ text: "台湾米酒", ruby: "たいわんミーチュウ" }],
  );
  assert.match(riceWine?.jaDefinition?.value ?? "", /^「台湾米酒」/);
  assert.match(riceWine?.chineseDefinition?.value ?? "", /台灣/);
  assert.match(riceWine?.examples?.[0]?.ja ?? "", /台湾米酒/);
  assert.match(riceWine?.examples?.[0]?.zh ?? "", /米酒/);

  const thickSoy = MAIN_WORD_CORRECTIONS.find(({ id }) => id === "thick-soy-sauce");
  assert.equal(thickSoy?.ja, "台湾とろみ醤油");
  assert.equal(thickSoy?.jaReading, "たいわんとろみしょうゆ");
  assert.deepEqual(
    segmentFurigana(thickSoy?.ja ?? "", thickSoy?.jaReading ?? "", new Map()),
    [
      { text: "台湾", ruby: "たいわん" },
      { text: "とろみ", ruby: null },
      { text: "醤油", ruby: "しょうゆ" },
    ],
  );
  assert.match(thickSoy?.jaDefinition?.value ?? "", /^「台湾とろみ醤油」/);
  assert.match(thickSoy?.examples?.[0]?.ja ?? "", /台湾とろみ醤油/);
});

test("seasoning corrections remove factual definition errors and invisible characters", () => {
  const byId = new Map(MAIN_WORD_CORRECTIONS.map((entry) => [entry.id, entry]));
  assert.match(byId.get("apple-cider-vinegar")?.jaDefinition?.value ?? "", /リンゴ果汁/);
  assert.doesNotMatch(
    byId.get("bonito-powder")?.jaDefinition?.value ?? "",
    /かつお節を燻製した/,
  );
  assert.match(byId.get("mirin")?.jaDefinition?.value ?? "", /酒類調味料/);
  assert.doesNotMatch(byId.get("mirin")?.jaDefinition?.value ?? "", /甘酒です/);
  assert.match(byId.get("shichimi")?.jaDefinition?.value ?? "", /うどん/);
  assert.doesNotMatch(byId.get("shichimi")?.jaDefinition?.value ?? "", /パスタやご飯/);
  assert.match(byId.get("sichuan-peppercorn")?.jaDefinition?.value ?? "", /果皮/);
  assert.doesNotMatch(byId.get("sichuan-peppercorn")?.jaDefinition?.value ?? "", /ドライフルーツ/);

  const serialized = JSON.stringify(
    MAIN_WORD_CORRECTIONS.filter(({ id }) =>
      ["cardamom", "cornstarch"].includes(id),
    ).map(({ jaDefinition }) => jaDefinition?.value),
  );
  assert.doesNotMatch(serialized, /\u200B/);
});

test("rice vinegar Japanese and Chinese comparison examples describe the same vinegar", () => {
  const correction = MAIN_WORD_CORRECTIONS.find(({ id }) => id === "rice-vinegar");
  const comparison = correction?.examples?.find(({ sortOrder }) => sortOrder === 1);
  assert.equal(comparison?.ja, "米酢は穀物酢よりまろやかです。");
  assert.equal(comparison?.zh, "米醋比穀物醋溫和。");
});

test("main-word corrections contain only one guarded correction per id", () => {
  const ids = MAIN_WORD_CORRECTIONS.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
});
