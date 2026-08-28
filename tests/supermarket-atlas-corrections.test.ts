import assert from "node:assert/strict";
import test from "node:test";
import { loadExampleSpanCorpus } from "../lib/example-span-corpus";
import { MAIN_WORD_CORRECTIONS, selectMainWordCorrections } from "../lib/main-word-corrections";
import {
  classifyMainWordExamplePair,
  MAIN_WORD_EXAMPLE_PAIRS,
  selectMainWordExamplePairs,
  type StoredMainWordExample,
} from "../lib/main-word-example-pairs";
import {
  SUPERMARKET_COMPLEX_EXAMPLES,
  SUPERMARKET_PREVIOUS_COMPLEX_EXAMPLES,
} from "../lib/main-word-example-pairs/supermarket";
import { MAIN_WORD_LEGACY_EXAMPLE_SETS } from "../lib/main-word-legacy-example-sets";
import { MAIN_WORD_MERGES } from "../lib/main-word-merges";
import { SUPERMARKET_MAIN_WORD_CORRECTIONS } from "../lib/supermarket-main-word-corrections";

const corpus = loadExampleSpanCorpus();

function exampleFor(wordId: string, sortOrder: 0 | 1) {
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find(({ id }) => id === wordId);
  assert.ok(pair, `missing pair for ${wordId}`);
  return pair.examples[sortOrder];
}

function tappable(language: "en" | "ja", sentence: string, text: string) {
  const span = corpus[language][sentence]?.find((candidate) => candidate.t === text);
  assert.ok(span?.z && span.j && span.e, `${language}: ${JSON.stringify(text)} must be tappable`);
  return span;
}

function assertNotTappable(language: "en" | "ja", sentence: string, text: string) {
  assert.equal(
    corpus[language][sentence]?.some((span) => span.t === text && span.z !== undefined),
    false,
    `${language}: ${JSON.stringify(text)} must not be independently tappable`,
  );
}

test("the audited supermarket definitions and example pairs stay aligned", () => {
  const expectedDefinitions = new Map([
    ["aisle", "「通路」とは、店内で棚と棚の間を人やカートが通るための場所です。"],
    ["barcode", "「バーコード」とは、商品を識別するために機械で読み取る、線を並べたコードです。"],
    ["coupon", "「クーポン」とは、会計時に提示すると割引や特典を受けられる券や画面のことです。"],
    ["deli-section", "「デリコーナー」とは、弁当、サラダ、揚げ物など、すぐに食べられる総菜を販売する売り場です。"],
    ["discount", "「割引」とは、商品の通常価格から一定の金額や割合を安くすることです。"],
    ["reusable-bag", "「エコバッグ」とは、ごみを減らすために繰り返し使える丈夫な買い物袋です。"],
    ["seafood-section", "「鮮魚コーナー」とは、魚、刺身、貝類などの魚介類を販売する売り場です。"],
    ["snack-section", "「お菓子コーナー」とは、菓子やスナックなどの袋入り食品を販売する売り場です。"],
  ]);
  for (const [id, expected] of expectedDefinitions) {
    const correction = SUPERMARKET_MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.equal(correction?.jaDefinition?.value, expected, id);
  }
  assert.equal(
    SUPERMARKET_MAIN_WORD_CORRECTIONS.find(({ id }) => id === "seafood-section")?.jaDefinition?.old,
    "「鮮魚コーナー」とは、スーパーマーケット内にある魚介類などの魚介類を販売するエリアのことです。",
  );
  assert.equal(
    SUPERMARKET_MAIN_WORD_CORRECTIONS.find(({ id }) => id === "snack-section")?.jaDefinition?.old,
    "「お菓子コーナー」とは、スーパーマーケット内にあるスナックや包装されたスナックを販売するエリアのことです。",
  );

  assert.equal(exampleFor("aisle", 0).zh, "麵包在3號走道。");
  assert.deepEqual(exampleFor("deli-section", 1), {
    en: "When I work late, I stop at the deli section on my way home so I can buy dinner without cooking.",
    ja: "残業で帰りが遅くなった日は、料理をしなくて済むように、帰りにデリコーナーで夕食用の総菜を買います。",
    zh: "加班晚歸時，我會在回家路上到熟食區買晚餐用的熟食，這樣就不用煮飯。",
    cefrLevel: "B1",
    sortOrder: 1,
  });
  assert.equal(
    exampleFor("checkout-counter", 1).ja,
    "会計カウンターへ着く前に、会員カードをすぐ取り出せる場所に入れておきます。",
  );
  assert.equal(
    exampleFor("shopping-cart", 1).ja,
    "ショッピングカートを戻す前に、下の段に置いたエコバッグを取り出してください。",
  );
});

test("the exact deployed supermarket pairs are guarded migration predecessors", () => {
  for (const previous of SUPERMARKET_PREVIOUS_COMPLEX_EXAMPLES) {
    const simple = MAIN_WORD_LEGACY_EXAMPLE_SETS
      .find(({ id }) => id === previous.id)
      ?.examples.find(({ sortOrder }) => sortOrder === 0);
    assert.ok(simple, previous.id);
    const current: StoredMainWordExample[] = [
      { ...simple, cefrLevel: "A2" },
      { ...previous, sortOrder: 1, cefrLevel: "B1" },
    ];
    assert.equal(classifyMainWordExamplePair(previous.id, current), "legacy", previous.id);
  }
});

test("the supermarket correction scope excludes the retired duplicate basket", () => {
  const merge = MAIN_WORD_MERGES.find(({ sourceId }) => sourceId === "basket");
  assert.equal(merge?.targetId, "shopping-basket");
  assert.equal(MAIN_WORD_LEGACY_EXAMPLE_SETS.some(({ id }) => id === "basket"), false);

  const supermarketIds = new Set(SUPERMARKET_COMPLEX_EXAMPLES.map(({ id }) => id));
  const selectedPairs = selectMainWordExamplePairs(supermarketIds);
  const selectedCorrections = selectMainWordCorrections(supermarketIds);
  assert.equal(supermarketIds.size, 30);
  assert.equal(selectedPairs.length, supermarketIds.size);
  assert.equal(selectedPairs.every(({ id }) => supermarketIds.has(id)), true);
  assert.equal(selectedCorrections.every(({ id }) => supermarketIds.has(id)), true);
  assert.equal(MAIN_WORD_CORRECTIONS.includes(SUPERMARKET_MAIN_WORD_CORRECTIONS[0]), true);
});

test("the audited supermarket click translations preserve meaning and word boundaries", () => {
  assert.equal(tappable("en", exampleFor("bag", 0).en, "Paper").z, "紙袋");
  assert.equal(tappable("ja", exampleFor("bakery-section", 1).ja, "焼き上がり時間").z, "出爐時間");
  assert.equal(tappable("ja", exampleFor("barcode", 0).ja, "レジ係").r, "レジがかり");
  assert.equal(tappable("en", exampleFor("coupon", 1).en, "combined").z, "併用");
  assert.equal(tappable("en", exampleFor("coupon", 1).en, "sale").j, "セール");
  assert.equal(tappable("en", exampleFor("discount", 0).en, "ten percent discount").j, "十パーセント割引");
  assert.equal(tappable("en", exampleFor("frozen-food", 0).en, "insulated bag").z, "保冷袋");
  assert.equal(tappable("ja", exampleFor("frozen-food", 1).ja, "帰宅").r, "きたく");
  assert.equal(tappable("ja", exampleFor("frozen-section", 0).ja, "あります").z, "在");
  assert.equal(tappable("en", exampleFor("garbage-bag", 1).en, "require").z, "規定使用");
  assert.equal(tappable("en", exampleFor("produce-section", 1).en, "damaged skin").z, "受損的表皮");
  assert.equal(tappable("ja", exampleFor("self-checkout-machine", 0).ja, "セルフレジ").j, "客が自分で精算する機械");
  assert.equal(tappable("ja", exampleFor("shelf", 1).ja, "届かなければ").r, "とどかなければ");
  assert.equal(tappable("ja", exampleFor("shelf", 1).ja, "頼んでください").e, "please ask");
  assertNotTappable("ja", exampleFor("shelf", 1).ja, "届か");
  assertNotTappable("ja", exampleFor("reusable-bag", 1).ja, "行くとき忘れないように");
});
