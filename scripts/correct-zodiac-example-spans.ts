// Apply the reviewed 2026-08 zodiac sentence-span corrections without calling
// a generator. The operation is idempotent and validates every current zodiac
// example before replacing the authored corpus file.

import { renameSync, writeFileSync } from "node:fs";
import {
  alignAuthoredSpans,
  containsGeneratedMetaGloss,
  loadExampleSpanCorpus,
  type AuthoredSpan,
  type ExampleSpanCorpus,
  type SentenceLanguage,
  validateAuthoredSentence,
} from "../lib/example-span-corpus";
import { MAIN_WORD_EXAMPLE_PAIRS } from "../lib/main-word-example-pairs";
import {
  ZODIAC_PREVIOUS_COMPLEX_EXAMPLES,
  ZODIAC_PREVIOUS_SIMPLE_OVERRIDES,
} from "../lib/main-word-example-pairs/zodiac";
import { words } from "../lib/words";

const OUTPUT_PATH = new URL("../data/example-spans.json", import.meta.url);

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

type Replacement = {
  language: SentenceLanguage;
  sentence: string;
  spans: AuthoredSpan[];
};

function replacement(
  language: SentenceLanguage,
  sentence: string,
  spans: AuthoredSpan[],
): Replacement {
  return {
    language,
    sentence,
    spans: alignAuthoredSpans(language, sentence, spans),
  };
}

const replacements: Replacement[] = [
  replacement("en", "When I filled in my zodiac sign on the form, I chose Aries because I was born in early April.", [
    tap("I", "我", "私", "I", "I", "pronoun"),
    tap("filled in", "填寫了", "記入した", "filled in", "fill in", "phrasal verb"),
    tap("my zodiac sign", "我的星座", "私の星座", "my zodiac sign", "zodiac sign", "noun"),
    tap("form", "表格", "申込書", "form", "form", "noun"),
    tap("chose", "選了", "選んだ", "chose", "choose", "verb"),
    tap("Aries", "牡羊座", "牡羊座", "Aries", "Aries", "noun"),
    tap("was born", "出生", "生まれた", "was born", "be born", "verb"),
    tap("early April", "四月初", "四月上旬", "early April", "early April", "phrase"),
  ]),
  replacement("ja", "申込書に星座を記入するとき、四月上旬生まれなので牡羊座を選びました。", [
    tap("申込書", "申請表", "申し込みに使う書類", "application form", "申込書", "noun", "もうしこみしょ"),
    tap("星座", "星座", "星座", "zodiac sign", "星座", "noun", "せいざ"),
    tap("記入するとき", "填寫時", "書き入れるとき", "when filling in", "記入する", "phrase", "きにゅうするとき"),
    tap("四月上旬生まれ", "四月初出生", "四月の初めに生まれた", "born in early April", "四月上旬生まれ", "phrase", "しがつじょうじゅんうまれ"),
    tap("牡羊座", "牡羊座", "牡羊座", "Aries", "牡羊座", "noun", "おひつじざ"),
    tap("選びました", "選了", "選んだ", "chose", "選ぶ", "verb", "えらびました"),
  ]),

  replacement("en", "My friend chose Taurus in the horoscope app.", [
    tap("My friend", "我的朋友", "私の友達", "my friend", "friend", "noun"),
    tap("chose", "選了", "選んだ", "chose", "choose", "verb"),
    tap("Taurus", "金牛座", "牡牛座", "Taurus", "Taurus", "noun"),
    tap("horoscope app", "占星 App", "占いアプリ", "horoscope app", "horoscope app", "noun"),
  ]),
  replacement("ja", "友達は占いアプリで牡牛座を選びました。", [
    tap("友達", "朋友", "友達", "friend", "友達", "noun", "ともだち"),
    tap("占いアプリ", "占星 App", "運勢を見るアプリ", "horoscope app", "占いアプリ", "noun", "うらないアプリ"),
    tap("牡牛座", "金牛座", "牡牛座", "Taurus", "牡牛座", "noun", "おうしざ"),
    tap("選びました", "選了", "選んだ", "chose", "選ぶ", "verb", "えらびました"),
  ]),
  replacement("en", "Although my friend is a Taurus, she does not think zodiac signs decide her personality.", [
    tap("my friend", "我的朋友", "私の友達", "my friend", "friend", "noun"),
    tap("Taurus", "金牛座", "牡牛座", "Taurus", "Taurus", "noun"),
    tap("does not think", "不認為", "そう考えていない", "does not think", "think", "verb"),
    tap("zodiac signs", "星座", "星座", "zodiac signs", "zodiac sign", "noun"),
    tap("decide", "決定", "決める", "decide", "decide", "verb"),
    tap("her personality", "她的個性", "彼女の性格", "her personality", "personality", "noun"),
  ]),
  replacement("ja", "友達は牡牛座ですが、星座で自分の性格が決まるとは思っていません。", [
    tap("友達", "朋友", "友達", "friend", "友達", "noun", "ともだち"),
    tap("牡牛座", "金牛座", "牡牛座", "Taurus", "牡牛座", "noun", "おうしざ"),
    tap("星座", "星座", "星座", "zodiac sign", "星座", "noun", "せいざ"),
    tap("自分", "自己", "自分自身", "oneself", "自分", "pronoun", "じぶん"),
    tap("性格", "個性", "人の性質", "personality", "性格", "noun", "せいかく"),
    tap("決まる", "被決定", "決定される", "be decided", "決まる", "verb", "きまる"),
    tap("思っていません", "不認為", "考えていません", "does not think", "思う", "verb", "おもっていません"),
  ]),

  replacement("en", "If your birthday is at the end of May, a horoscope app will usually show Gemini as your zodiac sign.", [
    tap("your birthday", "你的生日", "あなたの誕生日", "your birthday", "birthday", "noun"),
    tap("end of May", "五月底", "五月下旬", "end of May", "end of May", "phrase"),
    tap("horoscope app", "占星 App", "占いアプリ", "horoscope app", "horoscope app", "noun"),
    tap("usually", "通常", "通常", "usually", "usually", "adverb"),
    tap("show", "顯示", "表示する", "show", "show", "verb"),
    tap("Gemini", "雙子座", "双子座", "Gemini", "Gemini", "noun"),
    tap("your zodiac sign", "你的星座", "あなたの星座", "your zodiac sign", "zodiac sign", "noun"),
  ]),
  replacement("ja", "誕生日が五月下旬なら、占いアプリでは通常、星座が双子座と表示されます。", [
    tap("誕生日", "生日", "生まれた日", "birthday", "誕生日", "noun", "たんじょうび"),
    tap("五月下旬", "五月底", "五月の終わりごろ", "late May", "五月下旬", "phrase", "ごがつげじゅん"),
    tap("占いアプリ", "占星 App", "運勢を見るアプリ", "horoscope app", "占いアプリ", "noun", "うらないアプリ"),
    tap("通常", "通常", "ふつうは", "usually", "通常", "adverb", "つうじょう"),
    tap("星座", "星座", "星座", "zodiac sign", "星座", "noun", "せいざ"),
    tap("双子座", "雙子座", "双子座", "Gemini", "双子座", "noun", "ふたござ"),
    tap("表示されます", "會顯示", "画面に出ます", "will be shown", "表示する", "verb", "ひょうじされます"),
  ]),

  replacement("en", "My mother checks the Cancer horoscope every morning.", [
    tap("My mother", "我的媽媽", "私の母", "my mother", "mother", "noun"),
    tap("checks", "查看", "確認する", "checks", "check", "verb"),
    tap("Cancer horoscope", "巨蟹座運勢", "蟹座の運勢", "Cancer horoscope", "Cancer horoscope", "noun"),
    tap("every morning", "每天早上", "毎朝", "every morning", "every morning", "phrase"),
  ]),
  replacement("ja", "母は毎朝、蟹座の運勢を確認します。", [
    tap("母", "媽媽", "母", "mother", "母", "noun", "はは"),
    tap("毎朝", "每天早上", "毎日の朝", "every morning", "毎朝", "adverb", "まいあさ"),
    tap("蟹座", "巨蟹座", "蟹座", "Cancer", "蟹座", "noun", "かにざ"),
    tap("運勢", "運勢", "運勢", "horoscope", "運勢", "noun", "うんせい"),
    tap("確認します", "查看", "確かめます", "checks", "確認する", "verb", "かくにんします"),
  ]),
  replacement("en", "Because my sister was born in July, she chose Cancer when the app asked for her zodiac sign.", [
    tap("my sister", "我的妹妹", "私の妹", "my sister", "sister", "noun"),
    tap("was born", "出生", "生まれた", "was born", "be born", "verb"),
    tap("July", "七月", "七月", "July", "July", "noun"),
    tap("chose", "選了", "選んだ", "chose", "choose", "verb"),
    tap("Cancer", "巨蟹座", "蟹座", "Cancer", "Cancer", "noun"),
    tap("app", "App", "アプリ", "app", "app", "noun"),
    tap("asked for", "詢問", "尋ねた", "asked for", "ask for", "phrasal verb"),
    tap("her zodiac sign", "她的星座", "彼女の星座", "her zodiac sign", "zodiac sign", "noun"),
  ]),
  replacement("ja", "妹は七月生まれなので、アプリで星座を聞かれたときに蟹座を選びました。", [
    tap("妹", "妹妹", "妹", "younger sister", "妹", "noun", "いもうと"),
    tap("七月生まれ", "七月出生", "七月に生まれた", "born in July", "七月生まれ", "phrase", "しちがつうまれ"),
    tap("アプリ", "App", "アプリ", "app", "アプリ", "noun", "アプリ"),
    tap("星座", "星座", "星座", "zodiac sign", "星座", "noun", "せいざ"),
    tap("聞かれたとき", "被問到時", "尋ねられたとき", "when asked", "聞く", "phrase", "きかれたとき"),
    tap("蟹座", "巨蟹座", "蟹座", "Cancer", "蟹座", "noun", "かにざ"),
    tap("選びました", "選了", "選んだ", "chose", "選ぶ", "verb", "えらびました"),
  ]),

  replacement("en", "My nephew drew a lion next to the Leo symbol.", [
    tap("My nephew", "我的外甥", "おい", "my nephew", "nephew", "noun"),
    tap("drew", "畫了", "描いた", "drew", "draw", "verb"),
    tap("lion", "獅子", "ライオン", "lion", "lion", "noun"),
    tap("Leo symbol", "獅子座符號", "獅子座の記号", "Leo symbol", "Leo symbol", "noun"),
  ]),
  replacement("ja", "甥が獅子座の記号の隣にライオンを描きました。", [
    tap("甥", "外甥", "甥", "nephew", "甥", "noun", "おい"),
    tap("獅子座", "獅子座", "獅子座", "Leo", "獅子座", "noun", "ししざ"),
    tap("記号", "符號", "記号", "symbol", "記号", "noun", "きごう"),
    tap("隣", "旁邊", "すぐ横", "next to", "隣", "noun", "となり"),
    tap("ライオン", "獅子", "ライオン", "lion", "ライオン", "noun", "ライオン"),
    tap("描きました", "畫了", "絵にしました", "drew", "描く", "verb", "えがきました"),
  ]),
  replacement("en", "When my nephew learned that a lion represents Leo, he remembered the sign immediately.", [
    tap("my nephew", "我的外甥", "私の甥", "my nephew", "nephew", "noun"),
    tap("learned", "得知", "知った", "learned", "learn", "verb"),
    tap("lion", "獅子", "ライオン", "lion", "lion", "noun"),
    tap("represents", "代表", "表す", "represents", "represent", "verb"),
    tap("Leo", "獅子座", "獅子座", "Leo", "Leo", "noun"),
    tap("remembered", "記住了", "覚えた", "remembered", "remember", "verb"),
    tap("sign", "星座", "星座", "sign", "sign", "noun"),
    tap("immediately", "立刻", "すぐに", "immediately", "immediately", "adverb"),
  ]),
  replacement("ja", "甥はライオンが獅子座を表すと知って、すぐにその星座を覚えました。", [
    tap("甥", "外甥", "甥", "nephew", "甥", "noun", "おい"),
    tap("ライオン", "獅子", "ライオン", "lion", "ライオン", "noun", "ライオン"),
    tap("獅子座", "獅子座", "獅子座", "Leo", "獅子座", "noun", "ししざ"),
    tap("表す", "代表", "示す", "represents", "表す", "verb", "あらわす"),
    tap("知って", "得知", "知って", "learned", "知る", "verb", "しって"),
    tap("すぐに", "立刻", "すぐに", "immediately", "すぐに", "adverb", "すぐに"),
    tap("星座", "星座", "星座", "sign", "星座", "noun", "せいざ"),
    tap("覚えました", "記住了", "覚えた", "remembered", "覚える", "verb", "おぼえました"),
  ]),

  replacement("en", "My younger sister is a Virgo.", [
    tap("My younger sister", "我的妹妹", "いもうと", "my younger sister", "younger sister", "noun"),
    tap("Virgo", "處女座", "乙女座", "Virgo", "Virgo", "noun"),
  ]),
  replacement("ja", "妹は乙女座です。", [
    tap("妹", "妹妹", "妹", "younger sister", "妹", "noun", "いもうと"),
    tap("乙女座", "處女座", "乙女座", "Virgo", "乙女座", "noun", "おとめざ"),
  ]),
  replacement("en", "Because my younger sister is a Virgo, she checks the Virgo horoscope first in the app.", [
    tap("my younger sister", "我的妹妹", "私の妹", "my younger sister", "younger sister", "noun"),
    tap("Virgo", "處女座", "乙女座", "Virgo", "Virgo", "noun"),
    tap("checks", "查看", "確認する", "checks", "check", "verb"),
    tap("Virgo horoscope", "處女座運勢", "乙女座の運勢", "Virgo horoscope", "Virgo horoscope", "noun"),
    tap("first", "先", "最初に", "first", "first", "adverb"),
    tap("app", "App", "アプリ", "app", "app", "noun"),
  ]),
  replacement("ja", "妹は乙女座なので、アプリでは最初に乙女座の運勢を確認します。", [
    tap("妹", "妹妹", "妹", "younger sister", "妹", "noun", "いもうと"),
    tap("乙女座", "處女座", "乙女座", "Virgo", "乙女座", "noun", "おとめざ"),
    tap("アプリ", "App", "アプリ", "app", "アプリ", "noun", "アプリ"),
    tap("最初に", "先", "一番先に", "first", "最初に", "adverb", "さいしょに"),
    tap("乙女座の運勢", "處女座運勢", "乙女座の運勢", "Virgo horoscope", "乙女座の運勢", "noun", "おとめざのうんせい"),
    tap("確認します", "查看", "確かめます", "checks", "確認する", "verb", "かくにんします"),
  ]),

  replacement("en", "I found the Libra symbol on the horoscope poster.", [
    tap("I", "我", "私", "I", "I", "pronoun"),
    tap("found", "找到了", "見つけた", "found", "find", "verb"),
    tap("Libra symbol", "天秤座符號", "天秤座の記号", "Libra symbol", "Libra symbol", "noun"),
    tap("horoscope poster", "占星海報", "占いのポスター", "horoscope poster", "horoscope poster", "noun"),
  ]),
  replacement("ja", "占いのポスターで天秤座の記号を見つけました。", [
    tap("占い", "占星", "運勢占い", "horoscope", "占い", "noun", "うらない"),
    tap("ポスター", "海報", "ポスター", "poster", "ポスター", "noun", "ポスター"),
    tap("天秤座", "天秤座", "天秤座", "Libra", "天秤座", "noun", "てんびんざ"),
    tap("記号", "符號", "記号", "symbol", "記号", "noun", "きごう"),
    tap("見つけました", "找到了", "発見しました", "found", "見つける", "verb", "みつけました"),
  ]),
  replacement("en", "Because the Libra symbol looks like a pair of scales, I could identify it quickly on the poster.", [
    tap("Libra symbol", "天秤座符號", "天秤座の記号", "Libra symbol", "Libra symbol", "noun"),
    tap("looks like", "看起來像", "似ている", "looks like", "look like", "phrasal verb"),
    tap("pair of scales", "一座天秤", "一組の天秤", "pair of scales", "scales", "noun"),
    tap("identify", "認出", "見分ける", "identify", "identify", "verb"),
    tap("quickly", "很快", "すぐに", "quickly", "quickly", "adverb"),
    tap("poster", "海報", "ポスター", "poster", "poster", "noun"),
  ]),
  replacement("ja", "天秤座の記号は天秤の形なので、ポスターですぐに見分けられました。", [
    tap("天秤座", "天秤座", "天秤座", "Libra", "天秤座", "noun", "てんびんざ"),
    tap("記号", "符號", "記号", "symbol", "記号", "noun", "きごう"),
    tap("天秤の形", "天秤形狀", "天秤のような形", "shape of scales", "天秤の形", "phrase", "てんびんのかたち"),
    tap("ポスター", "海報", "ポスター", "poster", "ポスター", "noun", "ポスター"),
    tap("すぐに", "很快", "すぐに", "quickly", "すぐに", "adverb", "すぐに"),
    tap("見分けられました", "認出來了", "区別できました", "could identify", "見分ける", "verb", "みわけられました"),
  ]),

  replacement("en", "When he entered his birthday in the horoscope app, it showed that his zodiac sign was Scorpio.", [
    tap("entered", "輸入了", "入力した", "entered", "enter", "verb"),
    tap("his birthday", "他的生日", "彼の誕生日", "his birthday", "birthday", "noun"),
    tap("horoscope app", "占星 App", "占いアプリ", "horoscope app", "horoscope app", "noun"),
    tap("showed", "顯示", "表示した", "showed", "show", "verb"),
    tap("his zodiac sign", "他的星座", "彼の星座", "his zodiac sign", "zodiac sign", "noun"),
    tap("Scorpio", "天蠍座", "蠍座", "Scorpio", "Scorpio", "noun"),
  ]),
  replacement("ja", "占いアプリに誕生日を入力すると、星座は蠍座だと表示されました。", [
    tap("占いアプリ", "占星 App", "運勢を見るアプリ", "horoscope app", "占いアプリ", "noun", "うらないアプリ"),
    tap("誕生日", "生日", "生まれた日", "birthday", "誕生日", "noun", "たんじょうび"),
    tap("入力すると", "輸入後", "入力したところ", "when entered", "入力する", "phrase", "にゅうりょくすると"),
    tap("星座", "星座", "星座", "zodiac sign", "星座", "noun", "せいざ"),
    tap("蠍座", "天蠍座", "蠍座", "Scorpio", "蠍座", "noun", "さそりざ"),
    tap("表示されました", "顯示了", "画面に出ました", "was shown", "表示する", "verb", "ひょうじされました"),
  ]),

  replacement("en", "The magazine uses a bow and arrow for Sagittarius.", [
    tap("magazine", "雜誌", "雑誌", "magazine", "magazine", "noun"),
    tap("uses", "使用", "使う", "uses", "use", "verb"),
    tap("bow and arrow", "弓箭", "弓矢", "bow and arrow", "bow and arrow", "noun"),
    tap("Sagittarius", "射手座", "射手座", "Sagittarius", "Sagittarius", "noun"),
  ]),
  replacement("ja", "その雑誌では、射手座を弓矢で表しています。", [
    tap("雑誌", "雜誌", "雑誌", "magazine", "雑誌", "noun", "ざっし"),
    tap("射手座", "射手座", "射手座", "Sagittarius", "射手座", "noun", "いてざ"),
    tap("弓矢", "弓箭", "弓と矢", "bow and arrow", "弓矢", "noun", "ゆみや"),
    tap("表しています", "表示為", "示しています", "represents with", "表す", "verb", "あらわしています"),
  ]),
  replacement("en", "If you look for the bow-and-arrow symbol in the magazine, you can find the Sagittarius horoscope.", [
    tap("look for", "尋找", "探す", "look for", "look for", "phrasal verb"),
    tap("bow-and-arrow symbol", "弓箭符號", "弓矢の記号", "bow-and-arrow symbol", "bow-and-arrow symbol", "noun"),
    tap("magazine", "雜誌", "雑誌", "magazine", "magazine", "noun"),
    tap("find", "找到", "見つける", "find", "find", "verb"),
    tap("Sagittarius horoscope", "射手座運勢", "射手座の占い", "Sagittarius horoscope", "Sagittarius horoscope", "noun"),
  ]),
  replacement("ja", "雑誌で弓矢の記号を探せば、射手座の占いが見つかります。", [
    tap("雑誌", "雜誌", "雑誌", "magazine", "雑誌", "noun", "ざっし"),
    tap("弓矢", "弓箭", "弓と矢", "bow and arrow", "弓矢", "noun", "ゆみや"),
    tap("記号", "符號", "記号", "symbol", "記号", "noun", "きごう"),
    tap("探せば", "如果尋找", "探すと", "if you look for", "探す", "verb", "さがせば"),
    tap("射手座の占い", "射手座運勢", "射手座の運勢", "Sagittarius horoscope", "射手座の占い", "noun", "いてざのうらない"),
    tap("見つかります", "能找到", "発見できます", "can be found", "見つかる", "verb", "みつかります"),
  ]),

  replacement("en", "When my father reads the horoscope in the newspaper, he always starts with the Capricorn section.", [
    tap("my father", "我的爸爸", "私の父", "my father", "father", "noun"),
    tap("reads", "閱讀", "読む", "reads", "read", "verb"),
    tap("horoscope", "運勢", "占い", "horoscope", "horoscope", "noun"),
    tap("newspaper", "報紙", "新聞", "newspaper", "newspaper", "noun"),
    tap("always", "總是", "いつも", "always", "always", "adverb"),
    tap("starts with", "先從…開始", "最初に読む", "starts with", "start with", "phrasal verb"),
    tap("Capricorn section", "摩羯座欄位", "山羊座の欄", "Capricorn section", "Capricorn section", "noun"),
  ]),
  replacement("ja", "父は新聞の占いを読むとき、いつも山羊座の欄から読みます。", [
    tap("父", "爸爸", "父", "father", "父", "noun", "ちち"),
    tap("新聞", "報紙", "新聞", "newspaper", "新聞", "noun", "しんぶん"),
    tap("占い", "運勢", "運勢占い", "horoscope", "占い", "noun", "うらない"),
    tap("読むとき", "閱讀時", "読むとき", "when reading", "読む", "phrase", "よむとき"),
    tap("いつも", "總是", "いつも", "always", "いつも", "adverb", "いつも"),
    tap("山羊座の欄", "摩羯座欄位", "山羊座の欄", "Capricorn section", "山羊座の欄", "noun", "やぎざのらん"),
    tap("読みます", "閱讀", "読みます", "reads", "読む", "verb", "よみます"),
  ]),

  replacement("en", "My friend drew the Aquarius symbol on my birthday card.", [
    tap("My friend", "我的朋友", "私の友達", "my friend", "friend", "noun"),
    tap("drew", "畫了", "描いた", "drew", "draw", "verb"),
    tap("Aquarius symbol", "水瓶座符號", "水瓶座の記号", "Aquarius symbol", "Aquarius symbol", "noun"),
    tap("my birthday card", "我的生日卡", "私の誕生日カード", "my birthday card", "birthday card", "noun"),
  ]),
  replacement("ja", "友達が誕生日カードに水瓶座の記号を描きました。", [
    tap("友達", "朋友", "友達", "friend", "友達", "noun", "ともだち"),
    tap("誕生日カード", "生日卡", "誕生日カード", "birthday card", "誕生日カード", "noun", "たんじょうびカード"),
    tap("水瓶座", "水瓶座", "水瓶座", "Aquarius", "水瓶座", "noun", "みずがめざ"),
    tap("記号", "符號", "記号", "symbol", "記号", "noun", "きごう"),
    tap("描きました", "畫了", "絵にしました", "drew", "描く", "verb", "えがきました"),
  ]),
  replacement("en", "I checked a horoscope app because I wanted to know this week's forecast for Aquarius.", [
    tap("I", "我", "私", "I", "I", "pronoun"),
    tap("checked", "查看了", "確認した", "checked", "check", "verb"),
    tap("horoscope app", "占星 App", "占いアプリ", "horoscope app", "horoscope app", "noun"),
    tap("wanted to know", "想知道", "知りたかった", "wanted to know", "want to know", "phrase"),
    tap("this week's forecast", "本週運勢", "今週の運勢", "this week's forecast", "weekly forecast", "noun"),
    tap("Aquarius", "水瓶座", "水瓶座", "Aquarius", "Aquarius", "noun"),
  ]),
  replacement("ja", "今週の水瓶座の運勢が気になったので、占いアプリで確認しました。", [
    tap("今週", "本週", "今の週", "this week", "今週", "noun", "こんしゅう"),
    tap("水瓶座", "水瓶座", "水瓶座", "Aquarius", "水瓶座", "noun", "みずがめざ"),
    tap("運勢", "運勢", "運勢", "forecast", "運勢", "noun", "うんせい"),
    tap("気になったので", "因為想知道", "知りたいと思ったので", "because I wanted to know", "気になる", "phrase", "きになったので"),
    tap("占いアプリ", "占星 App", "運勢を見るアプリ", "horoscope app", "占いアプリ", "noun", "うらないアプリ"),
    tap("確認しました", "查看了", "確かめました", "checked", "確認する", "verb", "かくにんしました"),
  ]),

  replacement("ja", "誕生日カードに描かれた二匹の魚を見て、彼女はそれが魚座を表すと分かりました。", [
    tap("誕生日カード", "生日卡", "誕生日カード", "birthday card", "誕生日カード", "noun", "たんじょうびカード"),
    tap("描かれた", "畫著的", "絵にされた", "drawn", "描く", "verb", "えがかれた"),
    tap("二匹の魚", "兩條魚", "二匹の魚", "two fish", "二匹の魚", "noun", "にひきのさかな"),
    tap("見て", "看到", "見て", "saw", "見る", "verb", "みて"),
    tap("彼女", "她", "彼女", "she", "彼女", "pronoun", "かのじょ"),
    tap("魚座", "雙魚座", "魚座", "Pisces", "魚座", "noun", "うおざ"),
    tap("表す", "代表", "示す", "represent", "表す", "verb", "あらわす"),
    tap("分かりました", "知道了", "理解しました", "knew", "分かる", "verb", "わかりました"),
  ]),
];

function validateZodiac(corpus: ExampleSpanCorpus): void {
  const zodiacIds = new Set(
    words
      .filter(({ category, status }) => category === "zodiac" && status === "published")
      .map(({ id }) => id),
  );
  const issues: string[] = [];
  for (const pair of MAIN_WORD_EXAMPLE_PAIRS) {
    if (!zodiacIds.has(pair.id)) continue;
    for (const example of pair.examples) {
      for (const [language, sentence] of [["en", example.en], ["ja", example.ja]] as const) {
        const spans = corpus[language][sentence];
        for (const issue of validateAuthoredSentence(language, sentence, spans)) {
          issues.push(`${pair.id}:${example.sortOrder}:${language}: ${issue}`);
        }
        if (containsGeneratedMetaGloss(spans)) {
          issues.push(`${pair.id}:${example.sortOrder}:${language}: generated meta gloss`);
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new Error(`zodiac span validation failed (${issues.length}):\n${issues.join("\n")}`);
  }
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const corpus = loadExampleSpanCorpus();
  const zodiacIds = new Set(
    words
      .filter(({ category, status }) => category === "zodiac" && status === "published")
      .map(({ id }) => id),
  );
  const currentById = new Map(
    MAIN_WORD_EXAMPLE_PAIRS
      .filter(({ id }) => zodiacIds.has(id))
      .map((pair) => [pair.id, pair] as const),
  );
  for (const language of ["en", "ja"] as const) {
    const previousToCurrent = new Map<string, string>();
    for (const previous of ZODIAC_PREVIOUS_SIMPLE_OVERRIDES) {
      const current = currentById.get(previous.id)?.examples[0];
      if (!current) throw new Error(`missing current simple example for ${previous.id}`);
      previousToCurrent.set(previous[language], current[language]);
    }
    for (const previous of ZODIAC_PREVIOUS_COMPLEX_EXAMPLES) {
      const current = currentById.get(previous.id)?.examples[1];
      if (!current) throw new Error(`missing current complex example for ${previous.id}`);
      previousToCurrent.set(previous[language], current[language]);
    }
    const replacementBySentence = new Map(
      replacements
        .filter((item) => item.language === language)
        .map((item) => [item.sentence, item.spans] as const),
    );
    const ordered: Record<string, AuthoredSpan[]> = {};
    for (const [previousSentence, previousSpans] of Object.entries(corpus[language])) {
      const currentSentence = previousToCurrent.get(previousSentence) ?? previousSentence;
      ordered[currentSentence] = replacementBySentence.get(currentSentence) ?? previousSpans;
    }
    for (const [sentence, spans] of replacementBySentence) {
      if (!ordered[sentence]) ordered[sentence] = spans;
    }
    corpus[language] = ordered;
  }
  validateZodiac(corpus);
  console.log(`[zodiac-spans] validated ${replacements.length} sentence replacements`);
  if (!apply) {
    console.log("[zodiac-spans] dry run; pass --apply to write data/example-spans.json");
    return;
  }
  const temp = new URL(`${OUTPUT_PATH.pathname}.tmp`, "file://");
  writeFileSync(temp, `${JSON.stringify(corpus, null, 1)}\n`, "utf8");
  renameSync(temp, OUTPUT_PATH);
  console.log("[zodiac-spans] wrote data/example-spans.json");
}

main();
