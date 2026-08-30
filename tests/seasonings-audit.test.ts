import assert from "node:assert/strict";
import test from "node:test";
import { loadExampleSpanCorpus } from "../lib/example-span-corpus";
import {
  classifyMainWordExamplePair,
  MAIN_WORD_EXAMPLE_PAIRS,
  type MainWordExamplePair,
} from "../lib/main-word-example-pairs";
import {
  SEASONINGS_PREVIOUS_COMPLEX_EXAMPLES,
  SEASONINGS_PREVIOUS_SIMPLE_OVERRIDES,
} from "../lib/main-word-example-pairs/seasonings";
import { words } from "../lib/words";

const pairs = new Map(MAIN_WORD_EXAMPLE_PAIRS.map((pair) => [pair.id, pair]));
const corpus = loadExampleSpanCorpus();

function pair(id: string): MainWordExamplePair {
  const value = pairs.get(id);
  assert.ok(value, `missing pair for ${id}`);
  return value;
}

function tap(language: "en" | "ja", sentence: string, text: string) {
  const spans = corpus[language][sentence];
  assert.ok(spans, `missing ${language} spans for ${sentence}`);
  const matches = spans.filter((span) => span.t === text && span.z && span.j && span.e);
  assert.equal(matches.length, 1, `expected one tappable ${JSON.stringify(text)} in ${sentence}`);
  return matches[0];
}

test("the reviewed seasonings sentences keep their corrected daily meaning", () => {
  assert.equal(
    pair("baking-powder").examples[1].ja,
    "ベーキングパウダーを生地に混ぜたら、よく膨らむように早めに焼きます。",
  );
  assert.equal(
    pair("black-vinegar").examples[1].ja,
    "麺のスープが重く感じるときは、黒酢を一さじ入れるとさっぱりします。",
  );
  assert.equal(
    pair("chili-bean-paste").examples[1].ja,
    "豆板醤の香りを油に移すため、豆腐を入れる前にさっと炒めます。",
  );
  assert.equal(
    pair("chili-powder").examples[1].ja,
    "あとで目を刺激しないように、チリパウダーを漬けだれに混ぜるときは手袋をしてください。",
  );
  assert.equal(
    pair("cumin").examples[0].ja,
    "クミンは温かみのある土っぽい風味を加えます。",
  );
  assert.equal(
    pair("dark-soy-sauce").examples[0].ja,
    "老抽を使って、豚の角煮に濃い色をつけます。",
  );
  assert.equal(
    pair("flour").examples[1].ja,
    "生地がべたつくので、こね始める前に台に小麦粉を振ります。",
  );
  assert.equal(
    pair("ketchup").examples[0].ja,
    "フライドポテト用にケチャップをもらえますか？",
  );
  assert.equal(
    pair("onion-powder").examples[1].ja,
    "生の玉ねぎでは水分が出るので、ドライラブにはオニオンパウダーを使います。",
  );
  assert.equal(
    pair("rock-sugar").examples[1].ja,
    "氷砂糖は溶けにくいので、スープの煮始めに加えます。",
  );
});

test("the guarded migration accepts each exact deployed seasonings predecessor", () => {
  const previousSimple = new Map(
    SEASONINGS_PREVIOUS_SIMPLE_OVERRIDES.map((example) => [example.id, example]),
  );
  for (const complex of SEASONINGS_PREVIOUS_COMPLEX_EXAMPLES) {
    const target = pair(complex.id);
    const simple = previousSimple.get(complex.id) ?? target.examples[0];
    const deployed = [
      { ...simple, cefrLevel: "A2", sortOrder: 0 },
      { ...complex, cefrLevel: "B1", sortOrder: 1 },
    ];
    assert.equal(classifyMainWordExamplePair(complex.id, deployed), "legacy", complex.id);
    assert.equal(
      classifyMainWordExamplePair(complex.id, [
        deployed[0],
        { ...deployed[1], ja: `${deployed[1].ja}編集済み` },
      ]),
      "conflict",
      `${complex.id} must preserve an unrelated later edit`,
    );
  }
});

test("seasonings readings and contextual glosses match the reviewed cards", () => {
  for (const [id, text, reading] of [
    ["dark-soy-sauce", "老抽", "ラオチョウ"],
    ["light-soy-sauce", "生抽", "シェンチョウ"],
    ["rice-wine", "台湾米酒", "たいわんミーチュウ"],
    ["rock-sugar", "氷砂糖", "こおりざとう"],
    ["shacha-sauce", "沙茶醤", "サーチャージャン"],
    ["sichuan-peppercorn", "花椒", "ホアジャオ"],
  ] as const) {
    for (const example of pair(id).examples) {
      assert.equal(tap("ja", example.ja, text).r, reading, `${id}/${example.sortOrder}`);
    }
  }
  assert.equal(
    tap("ja", pair("sake").examples[1].ja, "臭み").r,
    "くさみ",
  );

  assert.equal(tap("ja", pair("bay-leaf").examples[1].ja, "枚数").e, "number of leaves");
  assert.equal(tap("en", pair("rice-vinegar").examples[1].en, "fold in").z, "拌入");
  assert.equal(tap("en", pair("mayonnaise").examples[1].en, "refrigerated").j, "冷蔵する");
  assert.equal(tap("en", pair("thyme").examples[0].en, "good").j, "合う");
  assert.equal(tap("ja", pair("star-anise").examples[1].ja, "食べにくい").z, "難以吃");
  assert.equal(tap("ja", pair("potato-starch").examples[0].ja, "あん").z, "芡汁");
  assert.equal(tap("ja", pair("thick-soy-sauce").examples[0].ja, "かけます").z, "淋上");
});

test("seasonings never expose a polite auxiliary as its own tap", () => {
  const seasonings = new Set(
    words
      .filter(({ category, status }) => category === "seasonings" && status === "published")
      .map(({ id }) => id),
  );
  const offenders: string[] = [];
  for (const entry of MAIN_WORD_EXAMPLE_PAIRS) {
    if (!seasonings.has(entry.id)) continue;
    for (const example of entry.examples) {
      for (const span of corpus.ja[example.ja] ?? []) {
        if (span.z && ["ください", "してください", "ます"].includes(span.t)) {
          offenders.push(`${entry.id}/${example.sortOrder}/${span.t}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});
