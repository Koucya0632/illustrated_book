import assert from "node:assert/strict";
import test from "node:test";
import { auditMainWordRows, type MainWordAuditRow } from "../lib/main-word-audit";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import { MAIN_WORD_MERGES } from "../lib/main-word-merges";

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
