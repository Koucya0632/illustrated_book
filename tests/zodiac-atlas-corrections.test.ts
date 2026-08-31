import assert from "node:assert/strict";
import test from "node:test";
import {
  containsGeneratedMetaGloss,
  loadExampleSpanCorpus,
  validateAuthoredSentence,
} from "../lib/example-span-corpus";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import { words } from "../lib/words";

const corpus = loadExampleSpanCorpus();

const expected = {
  aries: [
    ["My zodiac sign is Aries.", "私の星座は牡羊座です。", "我的星座是牡羊座。"],
    [
      "When I filled in my zodiac sign on the form, I chose Aries because I was born in early April.",
      "申込書に星座を記入するとき、四月上旬生まれなので牡羊座を選びました。",
      "填寫申請表的星座欄時，我因為四月初出生而選了牡羊座。",
    ],
  ],
  taurus: [
    [
      "My friend chose Taurus in the horoscope app.",
      "友達は占いアプリで牡牛座を選びました。",
      "朋友在占星 App 裡選了金牛座。",
    ],
    [
      "Although my friend is a Taurus, she does not think zodiac signs decide her personality.",
      "友達は牡牛座ですが、星座で自分の性格が決まるとは思っていません。",
      "朋友雖然是金牛座，但她不認為星座會決定自己的個性。",
    ],
  ],
  gemini: [
    ["His zodiac sign is Gemini.", "彼の星座は双子座です。", "他的星座是雙子座。"],
    [
      "If your birthday is at the end of May, a horoscope app will usually show Gemini as your zodiac sign.",
      "誕生日が五月下旬なら、占いアプリでは通常、星座が双子座と表示されます。",
      "如果生日在五月底，星座 App 通常會顯示你的星座是雙子座。",
    ],
  ],
  cancer: [
    [
      "My mother checks the Cancer horoscope every morning.",
      "母は毎朝、蟹座の運勢を確認します。",
      "媽媽每天早上都會查看巨蟹座運勢。",
    ],
    [
      "Because my sister was born in July, she chose Cancer when the app asked for her zodiac sign.",
      "妹は七月生まれなので、アプリで星座を聞かれたときに蟹座を選びました。",
      "妹妹七月出生，所以 App 詢問星座時，她選了巨蟹座。",
    ],
  ],
  leo: [
    [
      "My nephew drew a lion next to the Leo symbol.",
      "甥が獅子座の記号の隣にライオンを描きました。",
      "外甥在獅子座符號旁畫了一隻獅子。",
    ],
    [
      "When my nephew learned that a lion represents Leo, he remembered the sign immediately.",
      "甥はライオンが獅子座を表すと知って、すぐにその星座を覚えました。",
      "外甥知道獅子代表獅子座後，立刻記住了這個星座。",
    ],
  ],
  virgo: [
    ["My younger sister is a Virgo.", "妹は乙女座です。", "我妹妹是處女座。"],
    [
      "Because my younger sister is a Virgo, she checks the Virgo horoscope first in the app.",
      "妹は乙女座なので、アプリでは最初に乙女座の運勢を確認します。",
      "妹妹是處女座，所以她會先在 App 裡查看處女座運勢。",
    ],
  ],
  libra: [
    [
      "I found the Libra symbol on the horoscope poster.",
      "占いのポスターで天秤座の記号を見つけました。",
      "我在占星海報上找到了天秤座符號。",
    ],
    [
      "Because the Libra symbol looks like a pair of scales, I could identify it quickly on the poster.",
      "天秤座の記号は天秤の形なので、ポスターですぐに見分けられました。",
      "因為天秤座符號像一座天秤，所以我很快就在海報上認出來。",
    ],
  ],
  scorpio: [
    ["He is a Scorpio.", "彼は蠍座です。", "他是天蠍座。"],
    [
      "When he entered his birthday in the horoscope app, it showed that his zodiac sign was Scorpio.",
      "占いアプリに誕生日を入力すると、星座は蠍座だと表示されました。",
      "他在占星 App 輸入生日後，畫面顯示他的星座是天蠍座。",
    ],
  ],
  sagittarius: [
    [
      "The magazine uses a bow and arrow for Sagittarius.",
      "その雑誌では、射手座を弓矢で表しています。",
      "那本雜誌用弓箭表示射手座。",
    ],
    [
      "If you look for the bow-and-arrow symbol in the magazine, you can find the Sagittarius horoscope.",
      "雑誌で弓矢の記号を探せば、射手座の占いが見つかります。",
      "在雜誌裡尋找弓箭符號，就能找到射手座運勢。",
    ],
  ],
  capricorn: [
    ["My father is a Capricorn.", "私の父は山羊座です。", "我爸爸是摩羯座。"],
    [
      "When my father reads the horoscope in the newspaper, he always starts with the Capricorn section.",
      "父は新聞の占いを読むとき、いつも山羊座の欄から読みます。",
      "爸爸看報紙運勢時，總是先讀摩羯座那一欄。",
    ],
  ],
  aquarius: [
    [
      "My friend drew the Aquarius symbol on my birthday card.",
      "友達が誕生日カードに水瓶座の記号を描きました。",
      "朋友在生日卡上畫了水瓶座符號。",
    ],
    [
      "I checked a horoscope app because I wanted to know this week's forecast for Aquarius.",
      "今週の水瓶座の運勢が気になったので、占いアプリで確認しました。",
      "我想知道本週水瓶座的運勢，所以用占星 App 查看。",
    ],
  ],
  pisces: [
    ["Pisces is represented by two fish.", "魚座は2匹の魚で表されます。", "雙魚座以兩條魚作為代表。"],
    [
      "When she saw two fish on the birthday card, she knew they represented Pisces.",
      "誕生日カードに描かれた二匹の魚を見て、彼女はそれが魚座を表すと分かりました。",
      "她看到生日卡上畫著兩條魚，就知道那代表雙魚座。",
    ],
  ],
} as const;

function pairFor(id: keyof typeof expected) {
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find((candidate) => candidate.id === id);
  assert.ok(pair, `missing pair for ${id}`);
  return pair;
}

function tappable(language: "en" | "ja", sentence: string, text: string) {
  const span = corpus[language][sentence]?.find((candidate) => candidate.t === text);
  assert.ok(span?.z && span.j && span.e, `${language}: ${JSON.stringify(text)} must be tappable`);
  return span;
}

test("the zodiac category keeps the reviewed two-example set", () => {
  const publishedIds = words
    .filter(({ category, status }) => category === "zodiac" && status === "published")
    .map(({ id }) => id)
    .sort();
  assert.deepEqual(publishedIds, Object.keys(expected).sort());

  for (const [id, examples] of Object.entries(expected) as [
    keyof typeof expected,
    (typeof expected)[keyof typeof expected],
  ][]) {
    const pair = pairFor(id);
    assert.deepEqual(
      pair.examples.map(({ en, ja, zh, cefrLevel, sortOrder }) => ({
        en,
        ja,
        zh,
        cefrLevel,
        sortOrder,
      })),
      examples.map(([en, ja, zh], sortOrder) => ({
        en,
        ja,
        zh,
        cefrLevel: sortOrder === 0 ? "A2" : "B1",
        sortOrder,
      })),
      id,
    );
  }
});

test("every reviewed zodiac sentence has complete high-quality click translations", () => {
  for (const id of Object.keys(expected) as (keyof typeof expected)[]) {
    for (const example of pairFor(id).examples) {
      for (const [language, sentence] of [["en", example.en], ["ja", example.ja]] as const) {
        assert.deepEqual(
          validateAuthoredSentence(language, sentence, corpus[language][sentence]),
          [],
          `${id}/${example.sortOrder}/${language}`,
        );
        assert.equal(
          containsGeneratedMetaGloss(corpus[language][sentence]),
          false,
          `${id}/${example.sortOrder}/${language}`,
        );
      }
    }
  }
});

test("the audited zodiac glosses preserve the exact contextual meaning", () => {
  const taurus = pairFor("taurus");
  assert.equal(tappable("ja", taurus.examples[0].ja, "牡牛座").r, "おうしざ");
  assert.equal(tappable("ja", taurus.examples[0].ja, "牡牛座").z, "金牛座");

  const cancer = pairFor("cancer");
  assert.equal(tappable("ja", cancer.examples[0].ja, "蟹座").z, "巨蟹座");

  const leo = pairFor("leo");
  assert.equal(tappable("en", leo.examples[0].en, "My nephew").j, "おい");
  assert.equal(tappable("en", leo.examples[0].en, "My nephew").z, "我的外甥");

  const virgo = pairFor("virgo");
  assert.equal(tappable("en", virgo.examples[0].en, "My younger sister").j, "いもうと");

  const scorpio = pairFor("scorpio").examples[1];
  assert.equal(
    corpus.en[scorpio.en].some(({ t, z }) => t === "he" && Boolean(z)),
    false,
    "When must never be split to expose a false he pronoun",
  );
  assert.equal(tappable("ja", scorpio.ja, "入力すると").r, "にゅうりょくすると");
  assert.equal(tappable("ja", scorpio.ja, "表示されました").e, "was shown");
});
