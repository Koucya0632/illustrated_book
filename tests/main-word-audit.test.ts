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

const GENERIC_STREET_EXAMPLE_IDS = [
  "alley",
  "bank",
  "bike-lane",
  "billboard",
  "bridge",
  "bus-stop",
  "cafe",
  "construction-zone",
  "convenience-store",
  "corner",
  "fire-hydrant",
  "flower-bed",
  "intersection",
  "lane",
  "manhole-cover",
  "newsstand",
  "park",
  "parking-lot",
  "parking-meter",
  "parking-space",
  "pedestrian",
  "pedestrian-bridge",
  "pedestrian-button",
  "pharmacy",
  "post-office",
  "power-lines",
  "restaurant",
  "road",
  "roadblock",
  "roundabout",
  "security-camera",
  "shop",
  "signboard",
  "station",
  "stop-sign",
  "street",
  "street-vendor",
  "subway-station",
  "supermarket",
  "taxi-stand",
  "traffic-cone",
  "traffic-sign",
  "tree",
  "tunnel",
  "underpass",
  "utility-pole",
  "vending-machine",
  "vendor",
] as const;

test("street corrections replace every generic template with a concrete daily example", () => {
  for (const id of GENERIC_STREET_EXAMPLE_IDS) {
    const correction = MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.ok(correction, `missing correction for ${id}`);
    const example = correction.examples?.find(({ sortOrder }) => sortOrder === 0);
    assert.ok(example, `missing primary example correction for ${id}`);
    assert.doesNotMatch(example.en, /^You can see .+ on the street\.$/);
    assert.doesNotMatch(example.ja ?? "", /^街で.+を見ることができます。$/);
    assert.doesNotMatch(example.zh, /^你可以在街上看到.+。$/);
  }
});

test("street concept corrections keep regional facts, labels, and examples aligned", () => {
  const byId = new Map(MAIN_WORD_CORRECTIONS.map((entry) => [entry.id, entry]));

  assert.match(byId.get("crosswalk")?.jaDefinition?.value ?? "", /道路/);
  assert.doesNotMatch(byId.get("crosswalk")?.jaDefinition?.value ?? "", /水路/);

  const mailbox = byId.get("mailbox");
  assert.match(mailbox?.jaDefinition?.value ?? "", /投函/);
  const mailboxCorner = mailbox?.examples?.find(({ sortOrder }) => sortOrder === 2);
  assert.equal(mailboxCorner?.ja, "郵便ポストは街角にあります。");
  assert.equal(mailboxCorner?.zh, "郵筒在街角。");

  const manhole = byId.get("manhole-cover");
  assert.equal(manhole?.zh, "人孔蓋");
  assert.doesNotMatch(manhole?.jaDefinition?.value ?? "", /地下道/);
  assert.match(manhole?.jaDefinition?.value ?? "", /地下設備/);

  const lane = byId.get("lane");
  assert.equal(lane?.zh, "車線");
  assert.match(lane?.jaDefinition?.value ?? "", /区切/);

  const stopSign = byId.get("stop-sign");
  assert.match(stopSign?.jaDefinition?.value ?? "", /逆三角形/);
  assert.doesNotMatch(stopSign?.jaDefinition?.value ?? "", /八角形/);
  assert.match(stopSign?.chineseDefinition?.value ?? "", /倒三角形/);

  assert.doesNotMatch(
    byId.get("supermarket")?.jaDefinition?.value ?? "",
    /サービスサービス/,
  );

  const pedestrianButton = byId.get("pedestrian-button");
  assert.deepEqual(
    pedestrianButton?.jaReadingSegments,
    [
      { text: "歩", ruby: "ほ" },
      { text: "行", ruby: "こう" },
      { text: "者", ruby: "しゃ" },
      { text: "用", ruby: "よう" },
      { text: "押", ruby: "お" },
      { text: "しボタン", ruby: null },
    ],
  );
  assert.match(pedestrianButton?.jaDefinition?.value ?? "", /青信号に変わる/);

  const streetSign = byId.get("street-sign");
  assert.equal(streetSign?.ja, "案内標識");
  assert.equal(streetSign?.jaReading, "あんないひょうしき");
  assert.match(streetSign?.jaDefinition?.value ?? "", /^「案内標識」/);
  assert.doesNotMatch(streetSign?.examples?.[0]?.ja ?? "", /一時停止/);

  assert.equal(byId.get("billboard")?.ja, "広告看板");
  assert.notEqual(byId.get("billboard")?.ja, byId.get("signboard")?.ja ?? "看板");
});

const GENERIC_OFFICE_EXAMPLE_IDS = [
  "access-card",
  "ballpoint-pen",
  "binder-clip",
  "business-card",
  "calendar",
  "coffee-machine",
  "computer",
  "conference-table",
  "document",
  "employee-id-card",
  "envelope",
  "eraser",
  "file-folder",
  "filing-cabinet",
  "folder",
  "glue",
  "headphones",
  "highlighter",
  "marker",
  "meeting-room",
  "microphone",
  "mobile-phone",
  "mouse-pad",
  "notepad",
  "office-chair",
  "office-supplies",
  "paper",
  "paper-clip",
  "paper-shredder",
  "photocopier",
  "reception-desk",
  "ruler",
  "scanner",
  "staples",
  "sticky-notes",
  "tape",
  "utility-knife",
  "water-dispenser",
  "webcam",
  "whiteboard",
  "whiteboard-marker",
] as const;

test("office corrections replace every generic template with a concrete daily example", () => {
  for (const id of GENERIC_OFFICE_EXAMPLE_IDS) {
    const correction = MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.ok(correction, `missing correction for ${id}`);
    const example = correction.examples?.find(({ sortOrder }) => sortOrder === 0);
    assert.ok(example, `missing primary example correction for ${id}`);
    assert.doesNotMatch(example.en, /^I need .+ at the office\.$/);
    assert.doesNotMatch(example.ja ?? "", /^オフィスで.+が必要です。$/);
    assert.doesNotMatch(example.zh, /^我在辦公室需要.+。$/);
  }
});

test("office concept corrections keep adjacent objects and daily Japanese distinct", () => {
  const byId = new Map(MAIN_WORD_CORRECTIONS.map((entry) => [entry.id, entry]));

  const accessCard = byId.get("access-card");
  assert.equal(accessCard?.ja, "入館カード");
  assert.equal(accessCard?.jaReading, "にゅうかんカード");
  assert.doesNotMatch(accessCard?.jaDefinition?.value ?? "", /身分証明書/);

  assert.equal(byId.get("calendar")?.zh, "日曆");
  assert.equal(byId.get("desk")?.zh, "辦公桌");

  const filingCabinet = byId.get("filing-cabinet");
  assert.equal(filingCabinet?.ja, "ファイリングキャビネット");
  assert.equal(filingCabinet?.jaReading, "ファイリングキャビネット");
  assert.match(filingCabinet?.jaDefinition?.value ?? "", /引き出し/);

  assert.equal(byId.get("file-folder")?.ja, "個別フォルダー");
  assert.equal(byId.get("folder")?.ja, "クリアファイル");
  assert.notEqual(byId.get("file-folder")?.ja, byId.get("folder")?.ja);

  assert.doesNotMatch(byId.get("headphones")?.jaDefinition?.value ?? "", /耳に挿入/);
  assert.doesNotMatch(byId.get("keyboard")?.jaDefinition?.value ?? "", /鍵盤楽器/);
  assert.equal(byId.get("notepad")?.zh, "便條本");

  assert.equal(byId.get("paper-clip")?.ja, "ゼムクリップ");
  assert.equal(byId.get("pen")?.zh, "筆");
  assert.notEqual(byId.get("pen")?.zh, byId.get("ballpoint-pen")?.zh);

  assert.doesNotMatch(byId.get("utility-knife")?.jaDefinition?.value ?? "", /ポケットナイフ/);
  assert.equal(byId.get("marker")?.ja, "油性マーカー");
  assert.notEqual(byId.get("marker")?.ja, byId.get("whiteboard-marker")?.ja);
  assert.equal(byId.get("mobile-phone")?.ja, "スマートフォン");

  for (const id of ["access-card", "file-folder", "marker"]) {
    const correction = byId.get(id);
    const segments = segmentFurigana(
      correction?.ja ?? "",
      correction?.jaReading ?? "",
      new Map(),
    );
    assert.ok(segments, `expected furigana segments for ${id}`);
    assert.equal(
      segments.map(({ text }) => text).join(""),
      correction?.ja,
      `furigana headword mismatch for ${id}`,
    );
    assert.equal(
      segments.map(({ text, ruby }) => ruby ?? text).join(""),
      correction?.jaReading,
      `furigana reading mismatch for ${id}`,
    );
  }
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

const GENERIC_LIVING_ROOM_EXAMPLE_IDS = [
  "armchair",
  "back-cushion",
  "cabinet",
  "candle",
  "ceiling-light",
  "charger",
  "cushion",
  "dehumidifier",
  "diffuser",
  "display-cabinet",
  "doorbell",
  "doormat",
  "extension-cord",
  "floor-lamp",
  "footstool",
  "game-console",
  "magazine",
  "newspaper",
  "potted-plant",
  "power-outlet",
  "projector",
  "projector-screen",
  "recliner",
  "remote-control-holder",
  "robot-vacuum",
  "router",
  "set-top-box",
  "side-table",
  "smoke-detector",
  "speaker",
  "table-lamp",
  "telephone",
  "tv-stand",
  "vase",
  "wall-art",
] as const;

test("living-room corrections replace every remaining generic template with a concrete daily example", () => {
  for (const id of GENERIC_LIVING_ROOM_EXAMPLE_IDS) {
    const correction = MAIN_WORD_CORRECTIONS.find((entry) => entry.id === id);
    assert.ok(correction, `missing correction for ${id}`);
    const example = correction.examples?.find(({ sortOrder }) => sortOrder === 0);
    assert.ok(example, `missing primary example correction for ${id}`);
    assert.match(example.oldEn, /^The .+ is in the living room\.$/);
    assert.doesNotMatch(example.en, /^The .+ is in the living room\.$/);
    assert.match(example.oldJa ?? "", /^.+はリビングにあります。$/);
    assert.doesNotMatch(example.ja ?? "", /^.+はリビングにあります。$/);
    assert.match(example.oldZh, /^.+在客廳裡。$/);
    assert.doesNotMatch(example.zh, /^.+在客廳裡。$/);
  }
});

test("living-room corrections keep labels, definitions, and Japanese daily concepts aligned", () => {
  const byId = new Map(MAIN_WORD_CORRECTIONS.map((entry) => [entry.id, entry]));

  const candle = byId.get("candle");
  assert.match(candle?.enDefinition?.value ?? "", /wick/);
  assert.doesNotMatch(candle?.enDefinition?.value ?? "", /stick of wax/);
  assert.match(candle?.jaDefinition?.value ?? "", /^「ろうそく」/);
  assert.doesNotMatch(candle?.jaDefinition?.value ?? "", /蝋の柱/);

  assert.equal(byId.get("ceiling-light")?.zh, "吸頂燈");
  assert.doesNotMatch(byId.get("cushion")?.jaDefinition?.value ?? "", /座り心地も安心/);
  assert.doesNotMatch(byId.get("display-cabinet")?.jaDefinition?.value ?? "", /商品/);
  assert.doesNotMatch(byId.get("doormat")?.jaDefinition?.value ?? "", /玄関に玄関に/);
  assert.doesNotMatch(byId.get("extension-cord")?.jaDefinition?.value ?? "", /電源延長コードです/);
  assert.doesNotMatch(byId.get("game-console")?.jaDefinition?.value ?? "", /ビデオ ゲーム/);
  assert.doesNotMatch(byId.get("power-outlet")?.jaDefinition?.value ?? "", /壁に設置されたコンセント/);
  assert.match(byId.get("projector")?.jaDefinition?.value ?? "", /スクリーンや壁/);
  assert.doesNotMatch(byId.get("projector")?.jaDefinition?.value ?? "", /カーテン/);
  assert.doesNotMatch(byId.get("router")?.jaDefinition?.value ?? "", /ホーム ネットワーク/);
  assert.equal(byId.get("rug")?.zh, "小地毯");
  assert.equal(byId.get("speaker")?.zh, "喇叭");
  assert.doesNotMatch(byId.get("tv")?.jaDefinition?.value ?? "", /\u200B/);
  assert.match(byId.get("tv-stand")?.jaDefinition?.value ?? "", /テレビを置/);
  assert.equal(byId.get("wall-art")?.zh, "牆面藝術");

  const diffuser = byId.get("diffuser");
  assert.equal(diffuser?.word, "reed diffuser");
  assert.equal(diffuser?.ja, "リードディフューザー");
  assert.equal(diffuser?.zh, "擴香瓶");
  assert.match(diffuser?.jaDefinition?.value ?? "", /^「リードディフューザー」/);
  assert.match(diffuser?.examples?.[0]?.ja ?? "", /リードディフューザー/);

  const doorbell = byId.get("doorbell");
  assert.equal(doorbell?.word, "video doorbell");
  assert.equal(doorbell?.ja, "テレビドアホン");
  assert.equal(doorbell?.zh, "視訊門鈴");
  assert.match(doorbell?.jaDefinition?.value ?? "", /^「テレビドアホン」/);
  assert.match(doorbell?.examples?.[0]?.ja ?? "", /テレビドアホン/);

  const smokeDetector = byId.get("smoke-detector");
  assert.equal(smokeDetector?.ja, "煙式火災警報器");
  assert.equal(smokeDetector?.jaReading, "けむりしきかさいけいほうき");
  assert.equal(smokeDetector?.zh, "煙霧警報器");
  assert.match(smokeDetector?.jaDefinition?.value ?? "", /^「煙式火災警報器」/);
});

test("living-room table is retired in favor of the existing coffee-table concept", () => {
  const merge = MAIN_WORD_MERGES.find(({ sourceId }) => sourceId === "living-room-table");
  assert.deepEqual(merge, {
    sourceId: "living-room-table",
    targetId: "coffee-table",
    reason: "Both rows describe the same low table used in front of a living-room sofa.",
  });

  const issues = auditMainWordRows([
    validRow("living-room-table"),
    validRow("coffee-table"),
  ]);
  assert.deepEqual(
    issues.map(({ id, field }) => ({ id, field })),
    [{ id: "living-room-table", field: "duplicateMainWord" }],
  );
});

test("rice vinegar Japanese and Chinese comparison examples describe the same vinegar", () => {
  const correction = MAIN_WORD_CORRECTIONS.find(({ id }) => id === "rice-vinegar");
  const comparison = correction?.examples?.find(({ sortOrder }) => sortOrder === 1);
  assert.equal(comparison?.ja, "米酢は穀物酢よりまろやかです。");
  assert.equal(comparison?.zh, "米醋比穀物醋溫和。");
});

test("bedroom concept corrections keep each multilingual record aligned", () => {
  const byId = new Map(MAIN_WORD_CORRECTIONS.map((entry) => [entry.id, entry]));

  assert.equal(byId.get("alarm-clock")?.jaReading, "めざましどけい");
  assert.equal(byId.get("photo-frame")?.jaReading, "しゃしんたて");
  assert.match(byId.get("blanket")?.jaDefinition?.value ?? "", /寝具/);

  const duvet = byId.get("quilt");
  assert.equal(duvet?.word, "duvet");
  assert.equal(duvet?.ja, "掛け布団");
  assert.equal(duvet?.zh, "棉被");
  assert.match(duvet?.jaDefinition?.value ?? "", /^「掛け布団」/);
  assert.match(
    duvet?.localizedTexts?.find(({ field, language }) => field === "etymology" && language === "en")?.value ?? "",
    /^From French duvet/,
  );

  const dressingGown = byId.get("robe");
  assert.equal(dressingGown?.word, "dressing gown");
  assert.equal(dressingGown?.ja, "ガウン");
  assert.equal(dressingGown?.zh, "睡袍");
  assert.match(
    dressingGown?.localizedTexts?.find(({ field, language }) => field === "note" && language === "en")?.value ?? "",
    /^dressing \+ gown/,
  );

  const heater = byId.get("heater");
  assert.equal(heater?.zh, "電暖器");
  assert.match(heater?.jaDefinition?.value ?? "", /部屋/);

  const lamp = byId.get("lamp");
  assert.equal(lamp?.zh, "燈");
  assert.doesNotMatch(lamp?.chineseDefinition?.value ?? "", /桌|書桌/);
});

test("plural curtains are retired in favor of the canonical curtain concept", () => {
  const merge = MAIN_WORD_MERGES.find(({ sourceId }) => sourceId === "curtains");
  assert.deepEqual(merge, {
    sourceId: "curtains",
    targetId: "curtain",
    reason: "Both rows display as カーテン / 窗簾 and teach the same window-covering concept.",
  });
});

test("main-word corrections contain only one guarded correction per id", () => {
  const ids = MAIN_WORD_CORRECTIONS.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
});
