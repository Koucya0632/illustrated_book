import assert from "node:assert/strict";
import test from "node:test";
import { loadExampleSpanCorpus } from "../lib/example-span-corpus";
import { MAIN_WORD_CORRECTIONS } from "../lib/main-word-corrections";
import {
  classifyMainWordExamplePair,
  MAIN_WORD_EXAMPLE_PAIRS,
  selectMainWordExamplePairs,
  type StoredMainWordExample,
} from "../lib/main-word-example-pairs";
import {
  STREET_COMPLEX_EXAMPLES,
  STREET_PREVIOUS_COMPLEX_EXAMPLES,
} from "../lib/main-word-example-pairs/street";
import { MAIN_WORD_LEGACY_EXAMPLE_SETS } from "../lib/main-word-legacy-example-sets";

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

test("the audited street sentence corrections stay aligned", () => {
  assert.deepEqual(exampleFor("bank", 0), {
    en: "I need to stop by the bank.",
    ja: "銀行に寄ります。",
    zh: "我要去一趟銀行。",
    cefrLevel: "A2",
    sortOrder: 0,
  });
  assert.equal(exampleFor("station", 0).en, "Let's meet in front of the station.");
  assert.equal(
    exampleFor("underpass", 0).ja,
    "地下道を通って道路の向こう側へ行きましょう。",
  );
  assert.deepEqual(exampleFor("cafe", 1), {
    en: "If the cafe is full, we can order our drinks to go and drink them in the park.",
    ja: "カフェが満席なら、飲み物を持ち帰りにして公園で飲めます。",
    zh: "咖啡店如果客滿，我們可以外帶飲料去公園喝。",
    cefrLevel: "B1",
    sortOrder: 1,
  });
  assert.deepEqual(exampleFor("flower-bed", 1), {
    en: "To brighten the entrance, the volunteers planted seasonal flowers in the flower bed.",
    ja: "入口を明るくするために、ボランティアが花壇へ季節の花を植えました。",
    zh: "為了讓入口更明亮，志工在花圃種下當季花卉。",
    cefrLevel: "B1",
    sortOrder: 1,
  });
  assert.equal(
    exampleFor("newsstand", 1).ja,
    "その新聞売店は小さいですが、交通系ICカードや飲み物も売っています。",
  );
  assert.equal(
    exampleFor("pedestrian-bridge", 1).ja,
    "歩道橋には階段がありますが、この広い道路を地上で渡るより安全です。",
  );
  assert.equal(
    exampleFor("traffic-sign", 1).ja,
    "道は開いているように見えますが、交通標識には「六時以降、車両進入禁止」とあります。",
  );
});

test("street-corner uses the contextual reading かど", () => {
  const correction = MAIN_WORD_CORRECTIONS.find(({ id }) => id === "corner");
  assert.equal(correction?.jaReading, "かど");
  assert.deepEqual(correction?.jaReadingSegments, [{ text: "角", ruby: "かど" }]);
});

test("only the exact deployed street pairs are accepted as migration predecessors", () => {
  for (const previous of STREET_PREVIOUS_COMPLEX_EXAMPLES) {
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

  const streetIds = new Set(STREET_COMPLEX_EXAMPLES.map(({ id }) => id));
  const selected = selectMainWordExamplePairs(streetIds);
  assert.equal(streetIds.size, 56);
  assert.equal(selected.length, streetIds.size);
  assert.equal(selected.every(({ id }) => streetIds.has(id)), true);
});

test("the audited street click translations preserve useful phrases", () => {
  const billboard = exampleFor("billboard", 0);
  assert.equal(tappable("ja", billboard.ja, "駅").z, "車站");
  assert.equal(tappable("ja", billboard.ja, "見えます").z, "看得見");
  assert.equal(tappable("ja", exampleFor("billboard", 1).ja, "通れません").z, "無法通行");
  assert.equal(tappable("ja", exampleFor("bus-stop", 1).ja, "一時的に移動した").z, "暫時移位");

  assertNotTappable("ja", exampleFor("cafe", 0).ja, "あの");
  assert.equal(tappable("ja", exampleFor("cafe", 1).ja, "満席").z, "客滿");
  assert.equal(tappable("ja", exampleFor("newsstand", 1).ja, "交通系ICカード").j, "電車やバスの運賃を払うICカード");

  assert.equal(tappable("en", exampleFor("parking-meter", 0).en, "Put").j, "入れる");
  assert.equal(tappable("en", exampleFor("parking-meter", 0).en, "Put").z, "投入");
  assertNotTappable("en", exampleFor("parking-meter", 1).en, "Before");
  assert.equal(tappable("en", exampleFor("parking-meter", 1).en, "allowed").j, "許可されている");

  assert.equal(
    tappable("ja", exampleFor("pedestrian", 1).ja, "横断歩道").j,
    "歩行者が道路を渡るための場所",
  );
  assertNotTappable("ja", exampleFor("restaurant", 1).ja, "その");
  assert.equal(tappable("ja", exampleFor("road", 0).ja, "道路").r, "どうろ");
  assertNotTappable("ja", exampleFor("shop", 0).ja, "あの");
  assert.equal(tappable("ja", exampleFor("signboard", 1).ja, "示しています").z, "指向");

  for (const sortOrder of [0, 1] as const) {
    assert.equal(
      tappable("ja", exampleFor("stop-sign", sortOrder).ja, "一時停止標識").j,
      "車両に完全停止を求める標識",
    );
  }
  assert.equal(tappable("ja", exampleFor("streetlight", 0).ja, "点きました").z, "亮起來了");
  assert.equal(tappable("ja", exampleFor("taxi-stand", 0).ja, "乗り場").z, "候車處");
  assert.equal(tappable("ja", exampleFor("tree", 0).ja, "休みましょう").z, "休息吧");

  assertNotTappable("en", exampleFor("traffic-light", 1).en, "Even when");
  assertNotTappable("ja", exampleFor("subway-station", 1).ja, "この");
  assertNotTappable("ja", exampleFor("bank", 1).ja, "だけ");
});
