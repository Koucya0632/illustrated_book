// Apply the reviewed 2026-08 seasonings span corrections without calling a
// generator. The operation is idempotent and validates every current
// seasonings example before replacing the authored corpus file.

import { renameSync, writeFileSync } from "node:fs";
import {
  loadExampleSpanCorpus,
  type AuthoredSpan,
  type ExampleSpanCorpus,
  type SentenceLanguage,
  validateAuthoredSentence,
} from "../lib/example-span-corpus";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { words } from "../lib/words";

const OUTPUT_PATH = new URL("../data/example-spans.json", import.meta.url);

type SpanPatch = {
  language: SentenceLanguage;
  sentence: string;
  text: string;
  values: Partial<Pick<AuthoredSpan, "z" | "j" | "e" | "b" | "p" | "r">>;
};

const patches: SpanPatch[] = [
  {
    language: "ja",
    sentence: "盛り付ける前にローリエを取り除いてください。",
    text: "取り除いてください",
    values: { z: "請取出", j: "取り除く", e: "please remove" },
  },
  {
    language: "ja",
    sentence: "あとで全部取り出せるように、料理前にローリエの枚数を数えます。",
    text: "枚数",
    values: { z: "葉片數", j: "葉の数", e: "number of leaves" },
  },
  {
    language: "en",
    sentence: "After the rice is cooked, fold in the rice vinegar while the grains are still warm.",
    text: "fold in",
    values: { z: "拌入", j: "切るように混ぜる", e: "fold in" },
  },
  {
    language: "ja",
    sentence: "ご飯が炊けたら、温かいうちに米酢を切るように混ぜます。",
    text: "切るように混ぜます",
    values: { z: "切拌", j: "切るように混ぜる", e: "fold in" },
  },
  {
    language: "en",
    sentence: "If the salad tastes flat, a small amount of vinegar can brighten the flavor without more salt.",
    text: "brighten",
    values: { z: "提味", j: "味をはっきりさせる", e: "brighten" },
  },
  {
    language: "ja",
    sentence: "フライドポテト用にケチャップをもらえますか？",
    text: "もらえます",
    values: { z: "可以給我", j: "受け取ることができる", e: "can I have" },
  },
  {
    language: "en",
    sentence: "Add a pinch of onion powder.",
    text: "pinch",
    values: { z: "一小撮", j: "ひとつまみ", e: "pinch" },
  },
  {
    language: "ja",
    sentence: "クミンを砕いたら、焦がさないよう香りが出るまで炒ります。",
    text: "炒ります",
    values: { z: "乾炒", j: "乾煎りする", e: "toast" },
  },
  {
    language: "en",
    sentence: "Thyme is good for soups and stews.",
    text: "good",
    values: { z: "適合", j: "合う", e: "good for" },
  },
  {
    language: "en",
    sentence: "Fry the chili bean paste briefly before adding tofu so its aroma spreads through the oil.",
    text: "spreads",
    values: { z: "散布到整鍋油中", j: "油全体に広がる", e: "spreads" },
  },
  {
    language: "ja",
    sentence: "豆板醤の香りを油に移すため、豆腐を入れる前にさっと炒めます。",
    text: "移す",
    values: { z: "轉移", j: "移す", e: "transfer" },
  },
  {
    language: "en",
    sentence: "Add one star anise to the braised pork.",
    text: "braised pork",
    values: { z: "滷肉", j: "豚の角煮", e: "braised pork" },
  },
  {
    language: "en",
    sentence: "Add baking powder to the cake batter.",
    text: "cake batter",
    values: { z: "蛋糕麵糊", j: "ケーキの生地", e: "cake batter" },
  },
  {
    language: "ja",
    sentence: "ケーキの生地にベーキングパウダーを入れます。",
    text: "生地",
    values: { z: "麵糊", j: "ケーキの生地", e: "cake batter" },
  },
  {
    language: "en",
    sentence: "Once the baking powder is mixed into the batter, bake it soon so the cake rises well.",
    text: "batter",
    values: { z: "麵糊", j: "生地", e: "batter" },
  },
  {
    language: "en",
    sentence: "Thicken the soup with cornstarch.",
    text: "cornstarch",
    values: { z: "玉米澱粉", j: "コーンスターチ", e: "cornstarch" },
  },
  {
    language: "ja",
    sentence: "コーンスターチでスープにとろみをつけます。",
    text: "コーンスターチ",
    values: { z: "玉米澱粉", j: "コーンスターチ", e: "cornstarch" },
  },
  ...[
    "大根餅に台湾とろみ醤油をかけます。",
    "台湾とろみ醤油には甘みがあるので、つけだれには砂糖を加えません。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "台湾とろみ醤油",
    values: { z: "臺灣醬油膏", j: "台湾のとろみ醤油", e: "Taiwanese thick soy sauce" },
  })),
  ...[
    "老抽を使って、豚の角煮に濃い色をつけます。",
    "入れすぎると煮物が黒くなるので、老抽は少量だけ使います。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "老抽",
    values: { r: "ラオチョウ" },
  })),
  ...[
    "生抽で炒め物に味をつけます。",
    "生抽には塩味があるので、下味に使うときは塩を減らします。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "生抽",
    values: { r: "シェンチョウ" },
  })),
  ...[
    "三杯鶏に台湾米酒を加えます。",
    "三杯鶏を作るときは、火を止める前に台湾米酒の水分を飛ばします。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "台湾米酒",
    values: { r: "たいわんミーチュウ" },
  })),
  ...[
    "お茶に氷砂糖を一つ入れます。",
    "氷砂糖は溶けにくいので、スープの煮始めに加えます。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "氷砂糖",
    values: { r: "こおりざとう" },
  })),
  ...[
    "火鍋のつけだれに沙茶醤を加えます。",
    "沙茶醤は味が濃いので、麺へ加える前にスープでのばします。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "沙茶醤",
    values: { r: "サーチャージャン" },
  })),
  ...[
    "麻婆豆腐に花椒を加えます。",
    "柑橘のような香りを引き出すために、花椒をひいて使う前に炒ります。",
  ].map((sentence) => ({
    language: "ja" as const,
    sentence,
    text: "花椒",
    values: { r: "ホアジャオ" },
  })),
];

function plain(t: string): AuthoredSpan {
  return { t };
}

function tap(
  t: string,
  z: string,
  j: string,
  e: string,
  b: string,
  p: string,
  r: string,
): AuthoredSpan {
  return { t, z, j, e, b, p, r };
}

const replacements: Array<{
  language: "ja";
  sentence: string;
  spans: AuthoredSpan[];
}> = [
  {
    language: "ja",
    sentence: "あとで目を刺激しないように、チリパウダーを漬けだれに混ぜるときは手袋をしてください。",
    spans: [
      tap("あとで", "之後", "後で", "later", "あとで", "adverb", "あとで"),
      tap("目", "眼睛", "目", "eyes", "目", "noun", "め"),
      plain("を"),
      tap("刺激しない", "不刺激", "刺激しない", "not irritate", "刺激する", "verb", "しげきしない"),
      plain("ように、"),
      tap("チリパウダー", "辣椒粉", "チリパウダー", "chili powder", "チリパウダー", "noun", "チリパウダー"),
      plain("を"),
      tap("漬けだれ", "醃料", "漬けだれ", "marinade", "漬けだれ", "noun", "つけだれ"),
      plain("に"),
      tap("混ぜる", "拌入", "混ぜる", "mix", "混ぜる", "verb", "まぜる"),
      plain("ときは"),
      tap("手袋をしてください", "請戴手套", "手袋を着用してください", "wear gloves", "手袋をする", "expression", "てぶくろをしてください"),
      plain("。"),
    ],
  },
  {
    language: "ja",
    sentence: "パクチーが苦手な客がいるので、各自で足せるよう別の器に入れます。",
    spans: [
      tap("パクチー", "香菜", "香菜の一種", "cilantro", "パクチー", "noun", "パクチー"),
      plain("が"),
      tap("苦手な", "不喜歡的", "好みではない", "dislikes", "苦手な", "adjective", "にがてな"),
      tap("客", "客人", "訪問客", "guest", "客", "noun", "きゃく"),
      plain("がいるので、"),
      tap("各自で", "各自", "それぞれ自分で", "by themselves", "各自で", "adverb", "かくじで"),
      tap("足せる", "可以添加", "加えることができる", "can add", "足す", "verb", "たせる"),
      plain("よう"),
      tap("別の器", "另外的碗", "別に用意した器", "a separate bowl", "別の器", "phrase", "べつのうつわ"),
      plain("に"),
      tap("入れます", "放入", "中に入れる", "put", "入れる", "verb", "いれます"),
      plain("。"),
    ],
  },
  {
    language: "ja",
    sentence: "卵が入っているので、マヨネーズは開封後冷蔵庫で保存してください。",
    spans: [
      tap("卵", "蛋", "卵", "egg", "卵", "noun", "たまご"),
      plain("が"),
      tap("入っている", "含有", "含まれている", "contains", "入る", "verb", "はいっている"),
      plain("ので、"),
      tap("マヨネーズ", "美乃滋", "マヨネーズ", "mayonnaise", "マヨネーズ", "noun", "マヨネーズ"),
      plain("は"),
      tap("開封後", "開封後", "開封した後", "after opening", "開封後", "phrase", "かいふうご"),
      tap("冷蔵庫", "冰箱", "冷蔵庫", "refrigerator", "冷蔵庫", "noun", "れいぞうこ"),
      plain("で"),
      tap("保存してください", "請冷藏保存", "保存する", "keep refrigerated", "保存する", "verb", "ほぞんしてください"),
      plain("。"),
    ],
  },
  {
    language: "ja",
    sentence: "うどんにすでに辛みがあるなら、七味唐辛子を足す前に味見してください。",
    spans: [
      tap("うどん", "烏龍麵", "うどん", "udon", "うどん", "noun", "うどん"),
      plain("に"),
      tap("すでに", "已經", "もう", "already", "すでに", "adverb", "すでに"),
      tap("辛み", "辣味", "辛い味", "spiciness", "辛み", "noun", "からみ"),
      plain("が"),
      tap("ある", "有", "存在する", "has", "ある", "verb", "ある"),
      plain("なら、"),
      tap("七味唐辛子", "七味粉", "七味唐辛子", "shichimi", "七味唐辛子", "noun", "しちみとうがらし"),
      plain("を"),
      tap("足す", "添加", "加える", "add", "足す", "verb", "たす"),
      plain("前に"),
      tap("味見してください", "請先試味道", "味を確かめる", "taste first", "味見する", "verb", "あじみしてください"),
      plain("。"),
    ],
  },
];

function applyPatch(corpus: ExampleSpanCorpus, patch: SpanPatch): void {
  const spans = corpus[patch.language][patch.sentence];
  if (!spans) throw new Error(`missing ${patch.language} sentence: ${patch.sentence}`);
  const matches = spans.filter(({ t }) => t === patch.text);
  if (matches.length !== 1) {
    throw new Error(
      `${patch.language} ${JSON.stringify(patch.sentence)} expected one ${JSON.stringify(patch.text)} span, found ${matches.length}`,
    );
  }
  Object.assign(matches[0], patch.values);
}

function validateSeasonings(corpus: ExampleSpanCorpus): void {
  const seasoningIds = new Set(
    words
      .filter(({ category, status }) => category === "seasonings" && status === "published")
      .map(({ id }) => id),
  );
  const issues: string[] = [];
  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    if (!seasoningIds.has(pair.id)) continue;
    for (const example of pair.examples) {
      for (const [language, sentence] of [
        ["en", example.en],
        ["ja", example.ja],
      ] as const) {
        for (const issue of validateAuthoredSentence(language, sentence, corpus[language][sentence])) {
          issues.push(`${pair.id}:${example.sortOrder}:${language}: ${issue}`);
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new Error(`seasonings span validation failed (${issues.length}):\n${issues.join("\n")}`);
  }
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const corpus = loadExampleSpanCorpus();
  for (const patch of patches) applyPatch(corpus, patch);
  for (const replacement of replacements) {
    corpus[replacement.language][replacement.sentence] = replacement.spans;
  }
  validateSeasonings(corpus);
  console.log(
    `[seasonings-spans] validated ${patches.length} patches and ${replacements.length} sentence replacements`,
  );
  if (!apply) {
    console.log("[seasonings-spans] dry run; pass --apply to write data/example-spans.json");
    return;
  }
  const temp = new URL(`${OUTPUT_PATH.pathname}.tmp`, "file://");
  writeFileSync(temp, `${JSON.stringify(corpus, null, 1)}\n`, "utf8");
  renameSync(temp, OUTPUT_PATH);
  console.log("[seasonings-spans] wrote data/example-spans.json");
}

main();
