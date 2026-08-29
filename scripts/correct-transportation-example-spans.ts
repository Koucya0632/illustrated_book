// Apply the reviewed 2026-08 transportation span corrections without calling
// a generator. The operation is idempotent and validates every current
// transportation example before replacing the authored corpus file.

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
  values?: Partial<Pick<AuthoredSpan, "z" | "j" | "e" | "b" | "p" | "r">>;
  untappable?: boolean;
};

const patches: SpanPatch[] = [
  { language: "ja", sentence: "最終バスがもう出ていたら、駅から歩いて帰る必要があります。", text: "出ていたら", values: { z: "如果已經開走", j: "すでに出発していたら", e: "if it has already left" } },
  { language: "ja", sentence: "最終バスがもう出ていたら、駅から歩いて帰る必要があります。", text: "あります", untappable: true },
  { language: "en", sentence: "Before riding my bicycle at night, I check that both lights are working.", text: "my", untappable: true },
  { language: "ja", sentence: "道路が凍っていたので、彼はバイクを家に置いて電車で行きました。", text: "凍っていた", values: { z: "結冰了", j: "氷で滑りやすくなっていた", e: "was icy" } },
  { language: "ja", sentence: "電車が遅れているときは、駅のアプリで使うホームが表示されることが多いです。", text: "こと", untappable: true },
  { language: "en", sentence: "We flew on an airplane.", text: "flew", values: { z: "搭飛機前往", j: "飛行機で移動した", e: "flew" } },
  { language: "ja", sentence: "私たちは飛行機に乗りました。", text: "乗りました", values: { z: "搭乘了", j: "乗った", e: "rode" } },
  { language: "ja", sentence: "前方にパトカーが止まっていたので、運転手は速度を落として慎重に車線を変えました。", text: "止まっていた", values: { z: "停著", j: "停止していた", e: "was stopped" } },
  { language: "ja", sentence: "消防車がサイレンを鳴らして到着しました。", text: "鳴らして", values: { z: "鳴著", j: "音を出して", e: "sounding" } },
  { language: "ja", sentence: "消防車が消防署を出ると、道を空けるためにすべての車が止まりました。", text: "出ると", values: { z: "離開時", j: "消防署を離れると", e: "when leaving" } },
  { language: "ja", sentence: "火曜日はゴミ収集車が早く来るので、前の晩に袋を出しておいてください。", text: "ので", untappable: true },
  { language: "ja", sentence: "湖のそばでキャンピングカーに泊まりました。", text: "湖", values: { z: "湖", j: "大きな水域", e: "lake" } },
  { language: "ja", sentence: "彼女は駅の近くで電動キックボードを借りました。", text: "彼女", values: { z: "她", j: "彼女", e: "she" } },
  { language: "ja", sentence: "新幹線に乗れば、飛行機を使わなくても昼前に着けます。", text: "乗れば", values: { z: "如果搭乘", j: "乗ると", e: "if we take" } },
  { language: "ja", sentence: "新幹線に乗れば、飛行機を使わなくても昼前に着けます。", text: "使わなくても", values: { z: "即使不搭", j: "使わずに", e: "without using" } },
  { language: "ja", sentence: "新幹線に乗れば、飛行機を使わなくても昼前に着けます。", text: "着けます", values: { z: "能抵達", j: "到着できます", e: "can arrive" } },
  { language: "en", sentence: "Since the monorail connects directly to the airport, we avoided carrying bags up station stairs.", text: "connects directly", values: { z: "直通", j: "乗り換えなしでつながる", e: "connects without a transfer" } },
  { language: "ja", sentence: "モノレールは空港へ直通するので、駅の階段で荷物を運ばずに済みました。", text: "直通する", values: { z: "直通", j: "乗り換えなしでつながる", e: "goes directly without a transfer" } },
  { language: "en", sentence: "We rode the cable car up the mountain.", text: "rode", values: { z: "搭乘了", j: "乗った", e: "rode" } },
  { language: "en", sentence: "We rode the cable car up the mountain.", text: "cable car", values: { z: "地面纜車", j: "ケーブルで引かれる鉄道車両", e: "a rail car pulled by a cable" } },
  { language: "ja", sentence: "ケーブルカーで山を登りました。", text: "ケーブルカー", values: { z: "地面纜車", j: "ケーブルで引かれる鉄道車両", e: "cable railway" } },
  { language: "ja", sentence: "ケーブルカーで山を登りました。", text: "登りました", values: { z: "上山了", j: "登った", e: "went up" } },
  { language: "en", sentence: "When the cable car is crowded, wait for the next one rather than blocking the doors.", text: "cable car", values: { z: "地面纜車", j: "ケーブルで引かれる鉄道車両", e: "a rail car pulled by a cable" } },
  { language: "ja", sentence: "ケーブルカーが混んでいるときは、ドアをふさがず次の便を待ってください。", text: "ケーブルカー", values: { z: "地面纜車", j: "ケーブルで引かれる鉄道車両", e: "cable railway" } },
  { language: "ja", sentence: "ケーブルカーが混んでいるときは、ドアをふさがず次の便を待ってください。", text: "待ってください", values: { z: "請等待", j: "待つ", e: "please wait" } },
  { language: "ja", sentence: "ゴンドラリフトがスキー客を山の上へ運びます。", text: "上", values: { z: "上方", j: "上の位置", e: "upper area" } },
  { language: "en", sentence: "A helicopter flew over the hospital.", text: "flew", values: { z: "飛過", j: "空を飛んだ", e: "flew" } },
  { language: "ja", sentence: "ヘリコプターが病院の上を飛びました。", text: "飛びました", values: { z: "飛過了", j: "空を飛んだ", e: "flew" } },
  { language: "ja", sentence: "山道がふさがれていたので、ヘリコプターが村へ物資を運びました。", text: "運びました", values: { z: "運送了", j: "物資を届けた", e: "delivered" } },
  { language: "ja", sentence: "熱気球を予約していましたが、風が強すぎたため中止になりました。", text: "予約していました", values: { z: "已經預訂了", j: "予約済みでした", e: "had booked" } },
  { language: "ja", sentence: "熱気球を予約していましたが、風が強すぎたため中止になりました。", text: "強すぎた", values: { z: "太強了", j: "とても強かった", e: "was too strong" } },
  { language: "ja", sentence: "テレビでロケットの打ち上げを見ました。", text: "見ました", values: { z: "看了", j: "見た", e: "watched" } },
  { language: "ja", sentence: "橋が渋滞しているなら、湾を渡るフェリーのほうが早いかもしれません。", text: "かもしれません", values: { z: "可能會", j: "可能です", e: "may be" } },
  { language: "ja", sentence: "クルーズ船が港に入りました。", text: "入りました", values: { z: "進入了", j: "中に入りました", e: "entered" } },
  { language: "ja", sentence: "カヌーをこいで川を下りました。", text: "下りました", values: { z: "順流而下", j: "下った", e: "went down", r: "くだりました" } },
  { language: "en", sentence: "If the canoe tips over, stay with it because it is easier for rescuers to see.", text: "stay with it", values: { z: "留在船旁", j: "船のそばにいる", e: "stay beside the canoe" } },
  { language: "ja", sentence: "カヌーが転覆したら、救助する人から見つけやすいので船のそばにいてください。", text: "そばにいてください", values: { z: "請留在船旁", j: "船のそばにいてください", e: "stay beside the canoe" } },
  { language: "en", sentence: "Before taking the kayak onto the lake, we checked that the drain plug was closed.", text: "taking", values: { z: "帶到湖上", j: "湖に出す", e: "taking onto the lake" } },
  { language: "ja", sentence: "カヤックを湖へ出す前に、水抜き栓が閉まっているか確認しました。", text: "出す前に", values: { z: "下水前", j: "湖に出す前に", e: "before taking it onto the lake" } },
  { language: "en", sentence: "We took a coach to the hot spring.", text: "coach", values: { z: "遊覽車", j: "観光バス", e: "coach" } },
  { language: "ja", sentence: "観光バスで温泉へ行きました。", text: "観光バス", values: { z: "遊覽車", j: "観光バス", e: "coach" } },
  { language: "en", sentence: "Because the coach ride takes four hours, it stops once so passengers can take a break.", text: "coach ride", values: { z: "遊覽車車程", j: "観光バスの乗車", e: "coach ride" } },
  { language: "ja", sentence: "観光バスは四時間走るので、乗客が休憩できるよう途中で一度止まります。", text: "観光バス", values: { z: "遊覽車", j: "観光バス", e: "coach" } },
  { language: "en", sentence: "We loaded the boxes into the van.", text: "van", values: { z: "廂型車", j: "人や荷物を運ぶ箱型の車", e: "van" } },
  { language: "ja", sentence: "箱をバンに積みました。", text: "バン", values: { z: "廂型車", j: "人や荷物を運ぶ箱型の車", e: "van" } },
  { language: "en", sentence: "We rented a van because five people and all their luggage would not fit in a small car.", text: "van", values: { z: "廂型車", j: "人や荷物を運ぶ箱型の車", e: "van" } },
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
  r?: string,
): AuthoredSpan {
  return { t, z, j, e, b, p, ...(r ? { r } : {}) };
}

const replacements: Array<{
  language: SentenceLanguage;
  sentence: string;
  spans: AuthoredSpan[];
}> = [
  {
    language: "ja",
    sentence: "けがをした人のために救急車を呼びました。",
    spans: [
      tap("けがをした", "受傷的", "負傷した", "injured", "けがをする", "expression", "けがをした"),
      tap("人", "人", "人", "person", "人", "noun", "ひと"),
      plain("のために"),
      tap("救急車", "救護車", "救急車", "ambulance", "救急車", "noun", "きゅうきゅうしゃ"),
      plain("を"),
      tap("呼びました", "叫了救護車", "救急車を要請しました", "called an ambulance", "呼ぶ", "verb", "よびました"),
      plain("。"),
    ],
  },
  {
    language: "ja",
    sentence: "五人と全員分の荷物が小さい車に収まらないので、バンを借りました。",
    spans: [
      tap("五人", "五個人", "五人", "five people", "五人", "numeral", "ごにん"),
      plain("と"),
      tap("全員分", "所有人的份量", "全員の分", "everyone's share", "全員分", "phrase", "ぜんいんぶん"),
      plain("の"),
      tap("荷物", "行李", "持ち運ぶ荷物", "luggage", "荷物", "noun", "にもつ"),
      plain("が"),
      tap("小さい", "小的", "サイズが小さい", "small", "小さい", "adjective", "ちいさい"),
      tap("車", "汽車", "自動車", "car", "車", "noun", "くるま"),
      plain("に"),
      tap("収まらない", "裝不下", "中に入りきらない", "will not fit", "収まる", "verb", "おさまらない"),
      plain("ので、"),
      tap("バン", "廂型車", "人や荷物を運ぶ箱型の車", "van", "バン", "noun", "バン"),
      plain("を"),
      tap("借りました", "租了", "借りて使いました", "rented", "借りる", "verb", "かりました"),
      plain("。"),
    ],
  },
  {
    language: "ja",
    sentence: "スポーツカーは速いですが、車体が低いため急な駐車場の坂を上りにくいです。",
    spans: [
      tap("スポーツカー", "跑車", "高速走行向けの車", "sports car", "スポーツカー", "noun", "スポーツカー"),
      plain("は"),
      tap("速い", "快", "速度がある", "fast", "速い", "adjective", "はやい"),
      plain("ですが、"),
      tap("車体", "車身", "車の本体", "car body", "車体", "noun", "しゃたい"),
      plain("が"),
      tap("低い", "低", "高さが少ない", "low", "低い", "adjective", "ひくい"),
      plain("ため"),
      tap("急な", "陡峭的", "傾斜が大きい", "steep", "急な", "adjective", "きゅうな"),
      tap("駐車場", "停車場", "車を止める場所", "parking lot", "駐車場", "noun", "ちゅうしゃじょう"),
      plain("の"),
      tap("坂", "斜坡", "傾斜した道", "slope", "坂", "noun", "さか"),
      plain("を"),
      tap("上りにくい", "很難駛上", "上るのが難しい", "difficult to drive up", "上りにくい", "expression", "のぼりにくい"),
      plain("です。"),
    ],
  },
  {
    language: "en",
    sentence: "Because the rocket launch was delayed by weather, we checked the new launch time on the news.",
    spans: [
      plain("Because the "),
      tap("rocket launch", "火箭發射", "ロケットの打ち上げ", "rocket launch", "rocket launch", "noun"),
      plain(" was "),
      tap("delayed", "延期", "延期された", "delayed", "delay", "verb"),
      plain(" by "),
      tap("weather", "天氣", "天候", "weather", "weather", "noun"),
      plain(", we "),
      tap("checked", "確認了", "確認した", "checked", "check", "verb"),
      plain(" the "),
      tap("new launch time", "新的發射時間", "新しい打ち上げ時刻", "new launch time", "launch time", "phrase"),
      plain(" on the "),
      tap("news", "新聞", "ニュース", "news", "news", "noun"),
      plain("."),
    ],
  },
  {
    language: "ja",
    sentence: "天候でロケットの打ち上げが延期されたので、ニュースで新しい打ち上げ時刻を確認しました。",
    spans: [
      tap("天候", "天氣", "空の状態", "weather", "天候", "noun", "てんこう"),
      plain("で"),
      tap("ロケット", "火箭", "宇宙へ飛ぶ乗り物", "rocket", "ロケット", "noun", "ロケット"),
      plain("の"),
      tap("打ち上げ", "發射", "ロケットを空へ飛ばすこと", "launch", "打ち上げ", "noun", "うちあげ"),
      plain("が"),
      tap("延期された", "延期了", "予定が後へ変更された", "was delayed", "延期する", "verb", "えんきされた"),
      plain("ので、"),
      tap("ニュース", "新聞", "報道", "news", "ニュース", "noun", "ニュース"),
      plain("で"),
      tap("新しい", "新的", "以前と違う", "new", "新しい", "adjective", "あたらしい"),
      tap("打ち上げ時刻", "發射時間", "発射予定の時刻", "launch time", "打ち上げ時刻", "phrase", "うちあげじこく"),
      plain("を"),
      tap("確認しました", "確認了", "確かめました", "checked", "確認する", "verb", "かくにんしました"),
      plain("。"),
    ],
  },
  {
    language: "en",
    sentence: "Before riding the rickshaw, we confirmed the route and price with the driver.",
    spans: [
      plain("Before "),
      tap("riding", "搭乘", "乗る", "riding", "ride", "verb"),
      plain(" the "),
      tap("rickshaw", "人力車", "人力車", "rickshaw", "rickshaw", "noun"),
      plain(", we "),
      tap("confirmed", "確認了", "確かめた", "confirmed", "confirm", "verb"),
      plain(" the "),
      tap("route", "路線", "コース", "route", "route", "noun"),
      plain(" and "),
      tap("price", "價格", "料金", "price", "price", "noun"),
      plain(" with the "),
      tap("driver", "車伕", "車夫", "driver", "driver", "noun"),
      plain("."),
    ],
  },
];

function applyPatch(corpus: ExampleSpanCorpus, patch: SpanPatch): void {
  const spans = corpus[patch.language][patch.sentence];
  if (!spans) throw new Error(`missing ${patch.language} sentence: ${patch.sentence}`);
  const matches = spans.filter(({ t }) => t === patch.text);
  if (matches.length !== 1) {
    throw new Error(`${patch.language} ${JSON.stringify(patch.sentence)} expected one ${JSON.stringify(patch.text)} span, found ${matches.length}`);
  }
  const span = matches[0];
  if (patch.untappable) {
    for (const key of ["z", "j", "e", "b", "p", "r"] as const) delete span[key];
    return;
  }
  Object.assign(span, patch.values);
}

function validateTransportation(corpus: ExampleSpanCorpus): void {
  const transportationIds = new Set(
    words.filter(({ category, status }) => category === "transportation" && status === "published").map(({ id }) => id),
  );
  const issues: string[] = [];
  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    if (!transportationIds.has(pair.id)) continue;
    for (const example of pair.examples) {
      for (const [language, sentence] of [["en", example.en], ["ja", example.ja]] as const) {
        const spans = corpus[language][sentence];
        for (const issue of validateAuthoredSentence(language, sentence, spans)) {
          issues.push(`${pair.id}:${example.sortOrder}:${language}: ${issue}`);
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new Error(`transportation span validation failed (${issues.length}):\n${issues.join("\n")}`);
  }
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const corpus = loadExampleSpanCorpus();
  for (const patch of patches) applyPatch(corpus, patch);
  for (const replacement of replacements) {
    corpus[replacement.language][replacement.sentence] = replacement.spans;
  }
  validateTransportation(corpus);
  console.log(`[transportation-spans] validated ${patches.length} patches and ${replacements.length} sentence replacements`);
  if (!apply) {
    console.log("[transportation-spans] dry run; pass --apply to write data/example-spans.json");
    return;
  }
  const temp = new URL(`${OUTPUT_PATH.pathname}.tmp`, "file://");
  writeFileSync(temp, `${JSON.stringify(corpus, null, 1)}\n`, "utf8");
  renameSync(temp, OUTPUT_PATH);
  console.log("[transportation-spans] wrote data/example-spans.json");
}

main();
