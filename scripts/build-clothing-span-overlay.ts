import { readFileSync, writeFileSync } from "node:fs";
import { validateAuthoredSentence, type ExampleSpanCorpus } from "../lib/example-span-corpus";
import candidates from "../data/clothing-series-2026-09.json";

const generated = JSON.parse(
  readFileSync("output/clothing-content-draft/generated-spans-full.json", "utf8"),
) as ExampleSpanCorpus;
const overlay: ExampleSpanCorpus = { en: {}, ja: {} };
const issues: string[] = [];
for (const entry of candidates.entries) {
  for (const [slot, example] of entry.examples.entries()) {
    for (const language of ["en", "ja"] as const) {
      const sentence = example[language];
      const spans = generated[language][sentence];
      if (!spans) {
        issues.push(`${entry.id}:${slot}:${language}: missing sentence`);
        continue;
      }
      issues.push(...validateAuthoredSentence(language, sentence, spans).map(
        (issue) => `${entry.id}:${slot}:${language}: ${issue}`,
      ));
      overlay[language][sentence] = spans;
    }
  }
}
const amend = (
  id: string,
  slot: number,
  language: "en" | "ja",
  text: string,
  values: Record<string, string>,
) => {
  const entry = candidates.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`unknown clothing ID ${id}`);
  const sentence = entry.examples[slot][language];
  const span = overlay[language][sentence]?.find(({ t }) => t === text);
  if (!span) throw new Error(`missing span ${id}:${slot}:${language}:${text}`);
  Object.assign(span, values);
};

// These corrections were checked against each sentence's actual context.
amend("sweater", 1, "en", "colder", { j: "より寒かった" });
amend("sweater", 1, "en", "outside", { j: "外" });
amend("sweater", 1, "en", "classroom", { j: "教室" });
amend("sweater", 1, "en", "kept", { z: "繼續穿著", j: "脱ぎませんでした", e: "kept on" });
amend("sweater", 1, "en", "sweater", { j: "セーター" });
amend("cardigan", 1, "en", "brings", { j: "持って行きます" });
amend("cardigan", 1, "en", "cardigan", { z: "開襟毛衣" });
amend("cardigan", 1, "ja", "カーディガン", { z: "開襟毛衣" });
for (const [t, j] of Object.entries({
  "夏": "夏", "図書館": "図書館", "寒い": "寒い",
  "彼女": "彼女", "カーディガン": "カーディガン",
  "持って行きます": "持って行きます",
})) amend("cardigan", 1, "ja", t, { j });
amend("jeans", 0, "en", "wear", { j: "履く" });
amend("sneakers", 0, "en", "wears", { j: "履く" });
amend("skirt", 1, "en", "is cooler", { j: "の方が涼しい" });
amend("skirt", 1, "en", "expected to walk a lot", { j: "たくさん歩く予定" });
amend("socks", 0, "en", "puts on", { j: "履き替える" });
amend("polo-shirt", 0, "en", "navy", { j: "ネイビー" });
amend("polo-shirt", 0, "ja", "ネイビー", { j: "ネイビー" });
for (const slot of [0, 1]) {
  amend("tank-top", slot, "ja", "タンクトップ", { j: "タンクトップ" });
}
amend("tank-top", 1, "en", "tank top", { j: "タンクトップ" });
for (const slot of [0, 1]) {
  amend("raincoat", slot, "en", "raincoat", { j: "レインコート" });
  amend("raincoat", slot, "ja", "レインコート", { j: "レインコート" });
}
amend("raincoat", 1, "en", "dry", { z: "沒淋濕", j: "濡れなかった" });
amend("bow-tie", 0, "en", "wears", { z: "佩戴", j: "身につけている" });
amend("bow-tie", 0, "en", "bow tie", { z: "領結" });
amend("bow-tie", 0, "ja", "蝶ネクタイ", { z: "領結" });
amend("leggings", 1, "ja", "秋", { j: "秋" });
amend("leggings", 1, "ja", "ジーンズ", { j: "ジーンズ" });
amend("leggings", 1, "ja", "レギンス", { j: "レギンス" });
for (const slot of [0, 1]) {
  for (const language of ["en", "ja"] as const) {
    for (const span of overlay[language][candidates.entries.find(({ id }) => id === "tights")!.examples[slot][language]]) {
      if (/tights|タイツ/.test(span.t) && span.z) {
        span.z = span.t.includes("thick") || span.t.includes("厚手") ? "厚褲襪" : "褲襪";
        span.j = span.t.includes("thick") || span.t.includes("厚手") ? "厚手のタイツ" : "タイツ";
      }
    }
  }
}
amend("tights", 0, "en", "skirt", { j: "スカート" });
amend("tights", 0, "ja", "スカート", { j: "スカート" });
amend("tights", 1, "en", "thick tights", { z: "厚褲襪" });
amend("tights", 1, "ja", "厚手のタイツ", { z: "厚褲襪" });
amend("swimsuit", 0, "en", "packed", { j: "バッグに入れました" });
amend("sunglasses", 0, "ja", "かけて", { j: "サングラスをかけて" });
amend("necktie", 1, "ja", "寄っていた", { z: "起了皺", j: "しわができていた", e: "was wrinkled" });
amend("necktie", 1, "ja", "アイロン", { z: "熨斗", j: "アイロン" });
amend("necktie", 1, "ja", "かけた", { z: "燙了", j: "アイロンをかけた", e: "ironed" });
amend("leggings", 1, "ja", "暖かく過ごす", { z: "保持溫暖", j: "暖かい状態で過ごす", e: "stay warm" });
amend("underwear", 1, "en", "still drying", { j: "まだ乾いていなかった" });
amend("high-heels", 1, "en", "flats", { j: "フラットシューズ" });
amend("dress-shoes", 1, "ja", "革靴", { j: "革靴", e: "dress shoes" });
amend("flip-flops", 1, "ja", "乗る", { z: "上車", j: "車に乗る", e: "get into the car" });
amend("baseball-cap", 0, "ja", "キャップ", { e: "baseball cap" });
amend("tote-bag", 0, "en", "a tote bag", { z: "托特包", j: "トートバッグ" });
amend("tote-bag", 0, "ja", "トートバッグ", { z: "托特包", j: "トートバッグ" });
amend("handbag", 0, "ja", "母", { j: "自分の母親" });
amend("beanie", 1, "ja", "かぶり続けている", { j: "帽子をかぶり続けている" });
for (const slot of [0, 1]) {
  amend("backpack", slot, "en", "a backpack", { z: "後背包", j: "リュック" });
}
amend("backpack", 0, "ja", "リュック", { z: "後背包", j: "リュック" });
amend("necklace", 0, "en", "gave", { j: "贈った" });
amend("clip-on-earrings", 0, "ja", "つけました", { j: "耳につけました" });
amend("clip-on-earrings", 0, "en", "tried on", { z: "試戴", j: "試しにつけました" });
amend("clip-on-earrings", 0, "en", "pair", { j: "一対" });
amend("clip-on-earrings", 0, "en", "clip-on earrings", { j: "イヤリング" });
amend("clip-on-earrings", 0, "ja", "イヤリング", { z: "夾式耳環", j: "イヤリング" });
amend("clip-on-earrings", 0, "ja", "一対", { j: "一対", r: "いっつい" });
amend("clip-on-earrings", 0, "ja", "試しに", { j: "試しに" });
amend("clip-on-earrings", 1, "en", "clip-on earrings", { j: "イヤリング" });
amend("clip-on-earrings", 1, "en", "dress", { j: "ワンピース" });
amend("clip-on-earrings", 1, "ja", "イヤリング", { z: "夾式耳環" });

if (Object.keys(overlay.en).length !== candidates.entries.length * 2 ||
    Object.keys(overlay.ja).length !== candidates.entries.length * 2) {
  issues.push("overlay sentence count or uniqueness mismatch");
}
if (issues.length) throw new Error(issues.join("\n"));
writeFileSync("data/example-spans-clothing-2026-09.json", JSON.stringify(overlay, null, 1) + "\n");
console.log(`validated ${Object.keys(overlay.en).length} English and ${Object.keys(overlay.ja).length} Japanese sentences`);
