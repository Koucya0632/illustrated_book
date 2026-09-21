import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import batchA from "../data/convenience-store-series-2026-09-batch-a.json";
import batchB from "../data/convenience-store-series-2026-09-batch-b.json";
import {
  alignAuthoredSpans,
  validateAuthoredSentence,
  type AuthoredSpan,
  type ExampleSpanCorpus,
  type SentenceLanguage,
} from "../lib/example-span-corpus";

const root = fileURLToPath(new URL("..", import.meta.url));
const generatedPath = `${root}/output/convenience-store-publish-prep/generated-spans-full.json`;
const overlayPath = `${root}/data/example-spans-convenience-store-2026-09.json`;
const basePath = `${root}/data/example-spans.json`;
const generated = JSON.parse(readFileSync(generatedPath, "utf8")) as ExampleSpanCorpus;
const base = JSON.parse(readFileSync(basePath, "utf8")) as ExampleSpanCorpus;
const entries = [...batchA.entries, ...batchB.entries];

const content = (
  t: string,
  z: string,
  j: string,
  e: string,
  b: string,
  p: AuthoredSpan["p"],
  r?: string,
): AuthoredSpan => ({ t, z, j, e, b, p, ...(r ? { r } : {}) });

const manual = new Map<string, { language: SentenceLanguage; spans: AuthoredSpan[] }>([
  [
    "After choosing a card from the prepaid card rack, I asked the clerk to activate it for the gift amount.",
    {
      language: "en",
      spans: [
        content("choosing", "選好", "選び", "choosing", "choose", "verb"),
        content("card", "卡片", "カード", "card", "card", "noun"),
        content("prepaid card rack", "預付卡架", "POSAカード売り場", "prepaid card rack", "prepaid card rack", "noun"),
        content("I", "我", "私", "I", "I", "pronoun"),
        content("asked", "請", "頼みました", "asked", "ask", "verb"),
        content("clerk", "店員", "店員", "clerk", "clerk", "noun"),
        content("activate", "啟用", "有効にする", "activate", "activate", "verb"),
        content("gift amount", "贈送金額", "贈る金額", "gift amount", "gift amount", "noun"),
      ],
    },
  ],
  [
    "The tobacco display is behind the counter.",
    {
      language: "en",
      spans: [
        content("tobacco display", "菸品陳列架", "たばこ什器", "tobacco display", "tobacco display", "noun"),
        content("counter", "櫃台", "レジ", "counter", "counter", "noun"),
      ],
    },
  ],
  [
    "POSAカード売り場はレジの近くにあります。",
    {
      language: "ja",
      spans: [
        content("POSAカード売り場", "預付卡專區", "プリペイドカード売り場", "prepaid card rack", "POSAカード売り場", "noun", "ポサカードうりば"),
        content("レジ", "收銀台", "会計カウンター", "checkout", "レジ", "noun", "レジ"),
        content("近く", "附近", "そば", "nearby", "近く", "noun", "ちかく"),
        content("あります", "位於", "ございます", "is located", "ある", "verb", "あります"),
      ],
    },
  ],
  [
    "POSAカード売り場でカードを選び、贈りたい金額で使えるよう店員に頼みました。",
    {
      language: "ja",
      spans: [
        content("POSAカード売り場", "預付卡專區", "プリペイドカード売り場", "prepaid card rack", "POSAカード売り場", "noun", "ポサカードうりば"),
        content("カード", "卡片", "カード", "card", "カード", "noun", "カード"),
        content("選び", "選好", "選択し", "chose", "選ぶ", "verb", "えらび"),
        content("贈りたい", "想贈送的", "プレゼントしたい", "want to give", "贈る", "verb", "おくりたい"),
        content("金額", "金額", "値段", "amount", "金額", "noun", "きんがく"),
        content("使えるよう", "能夠使用", "利用できるよう", "so it can be used", "使える", "verb", "つかえるよう"),
        content("店員", "店員", "スタッフ", "clerk", "店員", "noun", "てんいん"),
        content("頼みました", "請託了", "お願いしました", "asked", "頼む", "verb", "たのみました"),
      ],
    },
  ],
  [
    "たばこ什器はレジの後ろにあります。",
    {
      language: "ja",
      spans: [
        content("たばこ什器", "菸品陳列架", "たばこ陳列棚", "tobacco display", "たばこ什器", "noun", "たばこじゅうき"),
        content("レジ", "收銀台", "会計カウンター", "checkout", "レジ", "noun", "レジ"),
        content("後ろ", "後方", "背後", "behind", "後ろ", "noun", "うしろ"),
        content("あります", "位於", "ございます", "is located", "ある", "verb", "あります"),
      ],
    },
  ],
  [
    "I returned the dessert to the chilled food case after noticing that its use-by date was today.",
    {
      language: "en",
      spans: [
        content("I", "我", "私", "I", "I", "pronoun"),
        content("returned", "放回", "戻しました", "returned", "return", "verb"),
        content("dessert", "甜點", "デザート", "dessert", "dessert", "noun"),
        content("chilled food case", "冷藏食品櫃", "チルドケース", "chilled food case", "chilled food case", "noun"),
        content("noticing", "注意到", "気づき", "noticing", "notice", "verb"),
        content("use-by date", "食用期限", "消費期限", "use-by date", "use-by date", "noun"),
        content("today", "今天", "今日", "today", "today", "noun"),
      ],
    },
  ],
  [
    "消費期限が今日だと気づき、デザートをチルドケースに戻しました。",
    {
      language: "ja",
      spans: [
        content("消費期限", "食用期限", "食べられる期限", "use-by date", "消費期限", "noun", "しょうひきげん"),
        content("今日", "今天", "本日", "today", "今日", "noun", "きょう"),
        content("気づき", "注意到", "分かり", "noticed", "気づく", "verb", "きづき"),
        content("デザート", "甜點", "甘い食べ物", "dessert", "デザート", "noun", "デザート"),
        content("チルドケース", "冷藏食品櫃", "冷蔵食品ケース", "chilled food case", "チルドケース", "noun", "チルドケース"),
        content("戻しました", "放回", "返しました", "returned", "戻す", "verb", "もどしました"),
      ],
    },
  ],
]);

for (const [sentence, authored] of manual) {
  generated[authored.language][sentence] = alignAuthoredSpans(
    authored.language,
    sentence,
    authored.spans,
  );
}

const overlay: ExampleSpanCorpus = { en: {}, ja: {} };
const issues: string[] = [];
for (const entry of entries) {
  for (const example of entry.examples) {
    for (const language of ["en", "ja"] as const) {
      const sentence = example[language];
      const spans = generated[language][sentence];
      if (!spans) {
        issues.push(`${entry.id}/${language}: missing ${sentence}`);
        continue;
      }
      for (const issue of validateAuthoredSentence(language, sentence, spans)) {
        issues.push(`${entry.id}/${language}: ${issue}`);
      }
      overlay[language][sentence] = spans;
      delete base[language][sentence];
    }
  }
}

const amend = (
  language: SentenceLanguage,
  sentence: string,
  text: string,
  values: Partial<AuthoredSpan>,
) => {
  const span = overlay[language][sentence]?.find(({ t }) => t === text);
  if (!span) throw new Error(`cannot amend missing span: ${language}/${sentence}/${text}`);
  Object.assign(span, values);
};

amend("en", "After removing the lid from the ice cup, I placed it under the coffee machine.", "removing", { z: "取下", j: "外して", e: "removing" });
amend("en", "Because one oven was in use, I waited beside the microwave station for a minute.", "oven", { z: "微波爐", j: "電子レンジ", e: "microwave oven" });
for (const [text, values] of Object.entries({
  finishing: { z: "喝完", j: "飲み終えて", e: "finishing" },
  checked: { z: "確認", j: "確認し", e: "checked" },
  labels: { z: "分類標示", j: "分別表示", e: "labels" },
  "sorting bin": { z: "分類垃圾桶", j: "分別ゴミ箱", e: "sorting bin" },
  throwing: { z: "丟棄", j: "捨てる", e: "throwing" },
  cup: { z: "杯子", j: "カップ", e: "cup" },
})) {
  amend("en", "After finishing my drink, I checked the labels on the sorting bin before throwing the cup away.", text, values);
}
amend("en", "After choosing noodles from the cup noodle shelf, I used the hot water dispenser near the counter.", "choosing noodles", { z: "選好麵", j: "麺を選んで", e: "choosing noodles" });
amend("ja", "家のプリンターが壊れていたので、USBメモリにファイルを保存してマルチコピー機を使いました。", "USBメモリ", { r: "ユーエスビーメモリ" });
amend("ja", "マルチメディア端末に予約番号を入力した後、印刷された申込券をレジに持っていきました。", "マルチメディア端末", { r: "マルチメディアたんまつ" });
amend("ja", "マルチメディア端末に予約番号を入力した後、印刷された申込券をレジに持っていきました。", "予約番号", { r: "よやくばんごう" });
amend("ja", "朝刊が売り切れていたので、新聞ラックのその区画は空でした。", "売り切れていた", { z: "賣完了" });
amend("ja", "手前のボトルがまだ冷えていなかったので、飲料ケースの奥から一本選びました。", "飲料ケース", { z: "飲料冷藏櫃", j: "飲料を冷やすケース", e: "drink refrigerator" });

for (const language of ["en", "ja"] as const) {
  for (const [sentence, spans] of Object.entries(overlay[language])) {
    for (const issue of validateAuthoredSentence(language, sentence, spans)) {
      issues.push(`amended ${language}/${sentence}: ${issue}`);
    }
  }
}

if (Object.keys(overlay.en).length !== 68 || Object.keys(overlay.ja).length !== 68) {
  issues.push("overlay must contain exactly 68 English and 68 Japanese sentences");
}
if (issues.length > 0) throw new Error(issues.join("\n"));

writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 1)}\n`, "utf8");
writeFileSync(basePath, `${JSON.stringify(base, null, 1)}\n`, "utf8");
console.log(JSON.stringify({ overlayPath, en: 68, ja: 68, manual: manual.size }, null, 2));
