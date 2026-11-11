// Self-contained i18n for the PUBLIC marketing surface (landing page + shell).
// Deliberately separate from the in-app catalog in `lib/i18n.ts`: the marketing
// page is server-rendered and seen by logged-out visitors, and we want all four
// UI languages here without dragging the (2-language) app catalog along.
//
// Server + client safe (pure data + a lookup fn, no hooks, no Node imports).
// Strings are grouped by key so all four languages stay side-by-side and in
// sync. zh-Hans is authored by hand (not OpenCC) because the copy carries
// Taiwan-specific vocab that needs Mainland wording.
//
// What the page may claim (prices, what is free, scenes) follows
// docs/marketing/CLAIMS.md in the parent repo. Positioning (2026-11-11): Tuji
// is a picture atlas and scene practice per destination, for students,
// working-holiday makers and travellers. Japan is the only destination live.
import type { UiLang } from "./settings";

// Cookie that stores the marketing-page language choice. Lives here (not in the
// server-only `public-lang.ts`) so the client switcher can import it without
// pulling `next/headers` into the browser bundle.
export const PUBLIC_LANG_COOKIE = "tuji_lang";

export const PUBLIC_LOCALES: { value: UiLang; label: string }[] = [
  { value: "zh-Hant", label: "繁體中文" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

type Row = Record<UiLang, string>;

const STRINGS: Record<string, Row> = {
  // ── Metadata ────────────────────────────────────────────────
  "meta.title": {
    "zh-Hant": "Tuji｜日本的圖鑑與場面練習",
    "zh-Hans": "Tuji｜日本的图鉴与场景练习",
    ja: "Tuji｜日本の図鑑と場面練習",
    en: "Tuji · A picture atlas and scene practice for Japan",
  },
  "meta.desc": {
    "zh-Hant":
      "留學、打工度假、旅遊，到了日本會遇到的東西和問句。圖鑑看圖認東西，場面練習聽懂店員在問什麼。",
    "zh-Hans":
      "留学、打工度假、旅游，到了日本会遇到的东西和问句。图鉴看图认东西，场景练习听懂店员在问什么。",
    ja: "留学、ワーキングホリデー、旅行。日本で出会うものと、店で聞かれること。図鑑で物を覚え、場面練習で店員の質問を聞き取る。",
    en: "What you run into in Japan as a student, on a working holiday, or on a trip. The atlas shows you the things. Scenes train you to catch what the clerk is asking.",
  },

  // ── Header / footer nav ─────────────────────────────────────
  "nav.presets": { "zh-Hant": "主題組合", "zh-Hans": "主题组合", ja: "テーマセット", en: "Topic sets" },
  "nav.atlas": { "zh-Hant": "圖鑑", "zh-Hans": "图鉴", ja: "図鑑", en: "Atlas" },
  "nav.scenes": { "zh-Hant": "場面", "zh-Hans": "场景", ja: "場面", en: "Scenes" },
  "nav.custom": { "zh-Hant": "自製圖鑑", "zh-Hans": "自制图鉴", ja: "自作図鑑", en: "Custom Atlas" },
  // 物見 is the in-app name for the community surface; the app catalog renders it
  // as Sightings / 物見 / 物见, so the marketing page must say the same words.
  "nav.community": { "zh-Hant": "物見", "zh-Hans": "物见", ja: "物見", en: "Sightings" },
  "nav.pricing": { "zh-Hant": "費用", "zh-Hans": "费用", ja: "料金", en: "Pricing" },
  "nav.support": { "zh-Hant": "支援", "zh-Hans": "支持", ja: "サポート", en: "Support" },

  "cta.getApp": {
    "zh-Hant": "下載 App",
    "zh-Hans": "下载 App",
    ja: "アプリを入手",
    en: "Get the App",
  },
  "cta.download": {
    "zh-Hant": "下載 iOS App",
    "zh-Hans": "下载 iOS App",
    ja: "iOS アプリをダウンロード",
    en: "Download the iOS App",
  },
  "cta.downloadAndroid": {
    "zh-Hant": "下載 Android App",
    "zh-Hans": "下载 Android App",
    ja: "Android アプリをダウンロード",
    en: "Download the Android App",
  },

  // ── Hero ────────────────────────────────────────────────────
  "hero.badge": { "zh-Hant": "目的地：日本", "zh-Hans": "目的地：日本", ja: "行き先：日本", en: "Destination: Japan" },
  "hero.title1": {
    "zh-Hant": "到了日本會遇到的，",
    "zh-Hans": "到了日本会遇到的，",
    ja: "日本で出会うものを、",
    en: "What you'll run into in Japan,",
  },
  "hero.title2": {
    "zh-Hant": "先看過一遍。",
    "zh-Hans": "先看过一遍。",
    ja: "先にひと通り。",
    en: "seen once before you go.",
  },
  "hero.subhead": {
    "zh-Hant":
      "Tuji 有兩樣東西。圖鑑，看圖認識當地的東西；場面，練習聽懂店員在問什麼。留學、打工度假、旅遊各有一組主題。",
    "zh-Hans":
      "Tuji 有两样东西。图鉴，看图认识当地的东西；场景，练习听懂店员在问什么。留学、打工度假、旅游各有一组主题。",
    ja: "Tuji にあるのは二つ。図鑑で現地の物を写真で覚え、場面で店員の質問を聞き取る練習をする。留学、ワーキングホリデー、旅行、それぞれにテーマのセットがあります。",
    en: "Tuji does two things. The atlas shows you the things you'll see there, in pictures. Scenes train you to catch what the clerk is asking. Students, working-holiday makers and travellers each get their own set of topics.",
  },
  "hero.browse": {
    "zh-Hant": "不用下載也能先看",
    "zh-Hans": "不用下载也能先看",
    ja: "ダウンロードなしでも見られます：",
    en: "No download needed to look at the",
  },
  "hero.browseLink": { "zh-Hant": "圖鑑", "zh-Hans": "图鉴", ja: "図鑑", en: "atlas" },
  "hero.sceneAlt": {
    "zh-Hant": "日本便利商店的結帳櫃檯",
    "zh-Hans": "日本便利店的收银台",
    ja: "コンビニのレジカウンター",
    en: "A convenience store checkout counter in Japan",
  },
  "hero.screenAlt": {
    "zh-Hant": "Tuji 圖鑑的便利商店主題畫面",
    "zh-Hans": "Tuji 图鉴的便利店主题画面",
    ja: "Tuji 図鑑のコンビニのテーマ画面",
    en: "The Convenience Store topic in the Tuji atlas",
  },
  "hero.clerk": { "zh-Hant": "店員", "zh-Hans": "店员", ja: "店員", en: "Clerk" },

  // ── 主題組合 (topic presets: student / working holiday / travel) ──
  "who.eyebrow": { "zh-Hant": "主題組合", "zh-Hans": "主题组合", ja: "テーマセット", en: "Topic sets" },
  "who.title": {
    "zh-Hant": "你是去做什麼的",
    "zh-Hans": "你是去做什么的",
    ja: "日本へは何をしに？",
    en: "What are you going for?",
  },
  "who.subtitle": {
    "zh-Hant": "選一個，Tuji 幫你排好先學的六個主題。之後隨時能換。",
    "zh-Hans": "选一个，Tuji 帮你排好先学的六个主题。之后随时能换。",
    ja: "一つ選ぶと、最初に学ぶ 6 つのテーマがそろいます。あとからいつでも変えられます。",
    en: "Pick one and Tuji lines up six topics to start with. You can switch any time.",
  },
  "who.allFree": { "zh-Hant": "六個都免費", "zh-Hans": "六个都免费", ja: "6 つとも無料", en: "All six free" },
  "who.student": {
    "zh-Hant": "開戶、辦證件、寄東西，剛到的頭幾週都在跑這些。",
    "zh-Hans": "开户、办证件、寄东西，刚到的头几周都在跑这些。",
    ja: "口座開設、在留カード、郵便。着いて最初の数週間はこればかり。",
    en: "Bank account, residence card, the post office. The first few weeks are mostly this.",
  },
  "who.working-holiday": {
    "zh-Hant": "手續一樣要辦，還多了餐廳和超市。",
    "zh-Hans": "手续一样要办，还多了餐厅和超市。",
    ja: "手続きは同じ。そこに飲食店とスーパーが加わる。",
    en: "The same paperwork, plus restaurants and the supermarket.",
  },
  "who.travel": {
    "zh-Hant": "待幾天就走。現有的場面都是旅客會遇到的。",
    "zh-Hans": "待几天就走。现有的场景都是旅客会遇到的。",
    ja: "数日いて帰る。今ある場面はどれも旅行者が出会うもの。",
    en: "A few days and you're gone. Every scene so far is one a traveller runs into.",
  },

  // ── 圖鑑 ────────────────────────────────────────────────────
  "atlas.eyebrow": { "zh-Hant": "圖鑑", "zh-Hans": "图鉴", ja: "図鑑", en: "Atlas" },
  "atlas.title1": {
    "zh-Hant": "藥妝店那一排，",
    "zh-Hans": "药妆店那一排，",
    ja: "ドラッグストアの棚、",
    en: "That drugstore aisle,",
  },
  "atlas.title2": {
    "zh-Hant": "不再只靠猜。",
    "zh-Hans": "不再只靠猜。",
    ja: "もう勘で選ばない。",
    en: "no more guessing.",
  },
  "atlas.body": {
    "zh-Hant": "按地方分主題：便利商店、車站、銀行、溫泉旅館。每個單字有圖片、日文和英文、發音、例句。",
    "zh-Hans": "按地方分主题：便利店、车站、银行、温泉旅馆。每个单词有图片、日语和英语、发音、例句。",
    ja: "テーマは場所ごと。コンビニ、駅、銀行、温泉旅館。どの単語にも写真、日本語と英語、発音、例文。",
    en: "Topics go by place: convenience store, station, bank, ryokan. Every word has a picture, Japanese and English, audio and an example.",
  },
  "atlas.r1t": { "zh-Hant": "看圖", "zh-Hans": "看图", ja: "写真で", en: "Pictures" },
  "atlas.r1b": {
    "zh-Hant": "叫不出名字的，先從圖片認識。",
    "zh-Hans": "叫不出名字的，先从图片认识。",
    ja: "名前が出てこない物は、まず写真から。",
    en: "Can't name it? Start from the picture.",
  },
  "atlas.r2t": { "zh-Hant": "練", "zh-Hans": "练", ja: "練習", en: "Practice" },
  "atlas.r2b": {
    "zh-Hant": "看圖、選字、拼寫，輪著來。",
    "zh-Hans": "看图、选词、拼写，轮着来。",
    ja: "写真、選択、スペル。順番に。",
    en: "Picture, pick, spell. In turns.",
  },
  "atlas.r3t": { "zh-Hant": "複習", "zh-Hans": "复习", ja: "復習", en: "Review" },
  "atlas.r3b": {
    "zh-Hant": "快忘的時候會自己排回來。",
    "zh-Hans": "快忘的时候会自己排回来。",
    ja: "忘れかけた頃に、また出てくる。",
    en: "Comes back around when you're about to forget.",
  },
  "atlas.r4t": { "zh-Hant": "學英文", "zh-Hans": "学英语", ja: "英語も", en: "English" },
  "atlas.r4b": {
    "zh-Hant": "用的是同一本圖鑑。",
    "zh-Hans": "用的是同一本图鉴。",
    ja: "同じ図鑑で学べます。",
    en: "Same atlas, other direction.",
  },
  "atlas.cta": { "zh-Hant": "瀏覽圖鑑", "zh-Hans": "浏览图鉴", ja: "図鑑を見る", en: "Browse the atlas" },
  "atlas.all": { "zh-Hant": "全部主題", "zh-Hans": "全部主题", ja: "すべてのテーマ", en: "All topics" },
  "atlas.alt1": {
    "zh-Hant": "圖鑑的便利商店主題，列出店裡的設備與商品",
    "zh-Hans": "图鉴的便利店主题，列出店里的设备与商品",
    ja: "図鑑のコンビニのテーマ。店内の設備や商品が並ぶ",
    en: "The Convenience Store topic, listing what's in the shop",
  },
  "atlas.alt2": {
    "zh-Hant": "單字頁：絆創膏的圖片、讀音與說明",
    "zh-Hans": "单词页：絆創膏的图片、读音与说明",
    ja: "単語ページ：絆創膏の写真、読み、説明",
    en: "A word page: 絆創膏 (adhesive bandage) with picture, reading and notes",
  },

  // ── 場面 (scene practice; Japanese learners only, synthetic voices) ──
  "scene.eyebrow": { "zh-Hant": "場面", "zh-Hans": "场景", ja: "場面", en: "Scenes" },
  "scene.title": {
    "zh-Hant": "店員開口的那一下",
    "zh-Hans": "店员开口的那一下",
    ja: "店員に話しかけられた、その一瞬",
    en: "The moment the clerk speaks",
  },
  "scene.body1": {
    "zh-Hant":
      "單字都認得，被問話還是愣住。場面練的是這個：聽一句店員或機器的問句，選怎麼回，或是照著操作付款機、食券機。",
    "zh-Hans":
      "单词都认得，被问话还是愣住。场景练的是这个：听一句店员或机器的问句，选怎么回，或是照着操作付款机、餐券机。",
    ja: "単語はわかるのに、聞かれると固まる。場面で練習するのはそこです。店員や機械の問いかけを聞いて答えを選ぶ。支払い機や券売機の操作も。",
    en: "You know the words, and still freeze when asked. That's what scenes practise: hear a clerk or a machine, pick your reply, or work the payment terminal or ticket machine.",
  },
  "scene.body2": {
    "zh-Hant": "複習的時候會換成你沒聽過的問法。",
    "zh-Hans": "复习的时候会换成你没听过的问法。",
    ja: "復習では、聞いたことのない言い方に変わります。",
    en: "On review, it's asked a way you haven't heard yet.",
  },
  "scene.note": {
    "zh-Hant": "學日文才有場面。問句和回應是合成語音。",
    "zh-Hans": "学日语才有场景。问句和回应是合成语音。",
    ja: "場面は日本語を学ぶときだけ。質問と応答は合成音声です。",
    en: "Scenes are for learning Japanese only. Questions and replies use synthetic voices.",
  },
  "scene.tryLabel": {
    "zh-Hant": "便利商店結帳",
    "zh-Hans": "便利店结账",
    ja: "コンビニのレジ",
    en: "Convenience store checkout",
  },
  "scene.tryTag": { "zh-Hant": "試一題", "zh-Hans": "试一题", ja: "1 問やってみる", en: "Try one" },
  "scene.asks": { "zh-Hant": "店員問你", "zh-Hans": "店员问你", ja: "店員の質問", en: "The clerk asks" },
  "scene.groupLabel": {
    "zh-Hant": "店員在問什麼",
    "zh-Hans": "店员在问什么",
    ja: "店員は何を聞いている？",
    en: "What is the clerk asking?",
  },
  "scene.prompt": {
    "zh-Hant": "店員在問什麼？選一個。",
    "zh-Hans": "店员在问什么？选一个。",
    ja: "店員は何を聞いている？一つ選んで。",
    en: "What is the clerk asking? Pick one.",
  },
  "scene.right": { "zh-Hant": "是這句", "zh-Hans": "是这句", ja: "これ", en: "This one" },
  "scene.wrong": { "zh-Hant": "不是", "zh-Hans": "不是", ja: "違う", en: "No" },
  "scene.reply": { "zh-Hant": "可以這樣回", "zh-Hans": "可以这样回", ja: "こう返せます", en: "You can reply" },
  // Choices and explanation come from tuji-ios Scenes/konbini-checkout.json
  // (question konbini-checkout.heat). ja is written here: the scene file has none.
  "scene.choiceA": {
    "zh-Hant": "要不要幫你加熱",
    "zh-Hans": "要不要帮你加热",
    ja: "温めるかどうか",
    en: "Do you want it heated",
  },
  "scene.choiceB": { "zh-Hant": "要不要袋子", "zh-Hans": "要不要袋子", ja: "袋が要るかどうか", en: "Do you need a bag" },
  "scene.choiceC": {
    "zh-Hant": "要不要附筷子或湯匙",
    "zh-Hans": "要不要附筷子或勺子",
    ja: "箸やスプーンが要るかどうか",
    en: "Do you need chopsticks or a spoon",
  },
  "scene.explain": {
    "zh-Hant": "「温める」是加熱。要的話說「お願いします」，不用就說「そのままで大丈夫です」。",
    "zh-Hans": "「温める」是加热。要的话说「お願いします」，不用就说「そのままで大丈夫です」。",
    ja: "「温める」は加熱すること。お願いするなら「お願いします」、いらなければ「そのままで大丈夫です」。",
    en: "温める means to heat up. Say お願いします for yes, or そのままで大丈夫です to take it as it is.",
  },
  "scene.listTitle": {
    "zh-Hant": "現有 {n} 個場面",
    "zh-Hans": "现有 {n} 个场景",
    ja: "いまある場面は {n} 個",
    en: "{n} scenes so far",
  },
  "scene.listNote": {
    "zh-Hant": "2026 年 11 月。「便利商店結帳」「餐廳」免費，其餘給永久會員。",
    "zh-Hans": "2026 年 11 月。「便利店结账」「餐厅」免费，其余给永久会员。",
    ja: "2026 年 11 月時点。「コンビニのレジ」「レストラン」は無料、ほかは永久会員向け。",
    en: "As of November 2026. Convenience store checkout and Restaurant are free; the rest come with Lifetime Membership.",
  },
  "scene.count": { "zh-Hant": "{n} 個", "zh-Hans": "{n} 个", ja: "{n} 個", en: "{n} scenes" },
  // Group names from tuji-ios Scenes/index.json; ja written here.
  "scene.g.konbini-cafe": {
    "zh-Hant": "便利商店與咖啡",
    "zh-Hans": "便利店与咖啡",
    ja: "コンビニとカフェ",
    en: "Convenience stores and cafés",
  },
  "scene.g.restaurants": { "zh-Hant": "餐廳", "zh-Hans": "餐厅", ja: "飲食店", en: "Restaurants" },
  "scene.g.airport": {
    "zh-Hant": "機場與進城",
    "zh-Hans": "机场与进城",
    ja: "空港から市内へ",
    en: "Airport and getting into town",
  },
  "scene.g.getting-around": {
    "zh-Hant": "車站與市區交通",
    "zh-Hans": "车站与市内交通",
    ja: "駅と市内の移動",
    en: "Stations and getting around",
  },
  "scene.g.hotels": { "zh-Hant": "飯店與溫泉", "zh-Hans": "酒店与温泉", ja: "ホテルと旅館", en: "Hotels and ryokan" },
  "scene.g.shopping": {
    "zh-Hant": "購物與生活",
    "zh-Hans": "购物与生活",
    ja: "買い物と用事",
    en: "Shopping and errands",
  },

  // ── 還有 (custom atlas, Sightings, Moira) ───────────────────
  "more.eyebrow": { "zh-Hant": "還有", "zh-Hans": "还有", ja: "ほかにも", en: "Also" },
  "more.title": {
    "zh-Hant": "圖鑑裡沒有的",
    "zh-Hans": "图鉴里没有的",
    ja: "図鑑にないもの",
    en: "For what the atlas doesn't have",
  },
  "more.customBody": {
    "zh-Hant": "拍下來，AI 幫你認、幫你取名，進到每天的複習。認錯了自己改。照片預設只有你看得到。",
    "zh-Hans": "拍下来，AI 帮你认、帮你取名，进到每天的复习。认错了自己改。照片默认只有你看得到。",
    ja: "撮れば AI が認識して名前をつけ、毎日の復習に入ります。間違っていたら自分で直せます。写真は初期設定で自分だけ。",
    en: "Snap it, AI recognises and names it, and it joins your daily review. Fix it if it's wrong. Photos are only visible to you by default.",
  },
  "more.commBody": {
    "zh-Hant": "別人在日本拍到的東西。喜歡的卡片收進自己的複習，整本合集也能收。公開的內容都審過。",
    "zh-Hans": "别人在日本拍到的东西。喜欢的卡片收进自己的复习，整本合集也能收。公开的内容都审过。",
    ja: "誰かが日本で撮った物。気に入ったカードは自分の復習へ、コレクションごと保存も。公開されたものはすべて審査済み。",
    en: "Things other people photographed in Japan. Take cards you like into your review, or save a whole collection. Everything public is reviewed.",
  },
  "more.moiraBody": {
    "zh-Hant": "不懂的日文，問問 Moira。查詞、看語法，用點數。",
    "zh-Hans": "不懂的日语，问问 Moira。查词、看语法，用点数。",
    ja: "わからない日本語は Moira に。単語や文法を調べられます。ポイントを使います。",
    en: "Stuck on some Japanese? Ask Moira. Look up words and grammar, using points.",
  },

  // ── 費用 ────────────────────────────────────────────────────
  // Per docs/marketing/CLAIMS.md: the US price with a regional note, and no
  // monthly point figure — it changes when AI_CREDITS_TRIAL_STARTS_AT is set
  // (lib/credits/policy.ts), and a static page would go stale.
  "price.eyebrow": { "zh-Hant": "費用", "zh-Hans": "费用", ja: "料金", en: "Pricing" },
  "price.title": {
    "zh-Hant": "先免費學，要全部再買一次",
    "zh-Hans": "先免费学，要全部再买一次",
    ja: "まず無料で。全部ほしくなったら一度だけ購入",
    en: "Start free. Buy once if you want everything.",
  },
  "price.free": { "zh-Hant": "免費", "zh-Hans": "免费", ja: "無料", en: "Free" },
  "price.freeTag": { "zh-Hant": "登入就有", "zh-Hans": "登录就有", ja: "ログインで利用可", en: "Just sign in" },
  "price.free1": {
    "zh-Hant": "8 個主題可以學：「水果」「臥室」和留學生組合的 6 個",
    "zh-Hans": "8 个主题可以学：「水果」「卧室」和留学生组合的 6 个",
    ja: "8 つのテーマを学べます：「果物」「寝室」と留学生セットの 6 つ",
    en: "8 topics to learn: Fruits, Bedroom, and the six in the Student set",
  },
  "price.free2": {
    "zh-Hant": "其他官方主題可以瀏覽",
    "zh-Hans": "其他官方主题可以浏览",
    ja: "ほかの公式テーマは閲覧できます",
    en: "Browse every other official topic",
  },
  "price.free3": {
    "zh-Hant": "場面「便利商店結帳」「餐廳」",
    "zh-Hans": "场景「便利店结账」「餐厅」",
    ja: "場面「コンビニのレジ」「レストラン」",
    en: "Scenes: Convenience store checkout, Restaurant",
  },
  "price.member": { "zh-Hant": "永久會員", "zh-Hans": "永久会员", ja: "永久会員", en: "Lifetime Membership" },
  "price.member1": {
    "zh-Hant": "全部官方主題、全部場面",
    "zh-Hans": "全部官方主题、全部场景",
    ja: "すべての公式テーマ、すべての場面",
    en: "Every official topic and every scene",
  },
  "price.member2": {
    "zh-Hant": "自製圖鑑 200 格、個人詞表 20 張、單字筆記",
    "zh-Hans": "自制图鉴 200 格、个人词表 20 张、单词笔记",
    ja: "自作図鑑 200 枠、単語リスト 20 個、単語メモ",
    en: "200 custom atlas slots, 20 word lists, word notes",
  },
  "price.member3": {
    "zh-Hant": "每月送點數；AI 拍照辨識一次 100 點",
    "zh-Hans": "每月送点数；AI 拍照识别一次 100 点",
    ja: "毎月ポイント付与。AI 写真認識は 1 回 100 ポイント",
    en: "Monthly points; an AI photo recognition costs 100",
  },
  "price.memberNote": {
    "zh-Hant": "一次購買，在 App 裡買。美國售價，其他地區依 App Store 或 Google Play 顯示。",
    "zh-Hans": "一次购买，在 App 里买。美国售价，其他地区以 App Store 或 Google Play 显示为准。",
    ja: "買い切り。アプリ内で購入できます。米国での価格です。ほかの地域は App Store または Google Play の表示をご確認ください。",
    en: "One-time purchase, inside the app. US price; other regions as shown in the App Store or Google Play.",
  },

  // ── Download CTA ────────────────────────────────────────────
  "dl.title": {
    "zh-Hant": "出發前裝起來",
    "zh-Hans": "出发前装起来",
    ja: "出発前に入れておく",
    en: "Install it before you fly",
  },
  "dl.subhead": {
    "zh-Hant": "iPhone、Android 都能下載。",
    "zh-Hans": "iPhone、Android 都能下载。",
    ja: "iPhone でも Android でも。",
    en: "On iPhone and Android.",
  },
  "dl.contact": { "zh-Hant": "聯絡我們", "zh-Hans": "联系我们", ja: "お問い合わせ", en: "Contact us" },

  // ── Footer ──────────────────────────────────────────────────
  "foot.tagline": {
    "zh-Hant": "日本的圖鑑與場面練習。給留學、打工度假和旅遊的人。",
    "zh-Hans": "日本的图鉴与场景练习。给留学、打工度假和旅游的人。",
    ja: "日本の図鑑と場面練習。留学、ワーキングホリデー、旅行の人へ。",
    en: "A picture atlas and scene practice for Japan. For students, working holidays and trips.",
  },
  "foot.product": { "zh-Hant": "產品", "zh-Hans": "产品", ja: "プロダクト", en: "Product" },
  "foot.iosApp": { "zh-Hant": "iOS App", "zh-Hans": "iOS App", ja: "iOS App", en: "iOS App" },
  "foot.androidApp": { "zh-Hant": "Android App", "zh-Hans": "Android App", ja: "Android App", en: "Android App" },
  "foot.supportLegal": {
    "zh-Hant": "支援與法律",
    "zh-Hans": "支持与法律",
    ja: "サポートと法的情報",
    en: "Support & legal",
  },
  "foot.supportCenter": {
    "zh-Hant": "支援中心",
    "zh-Hans": "支持中心",
    ja: "サポートセンター",
    en: "Support center",
  },
  "foot.privacy": {
    "zh-Hant": "隱私權政策",
    "zh-Hans": "隐私政策",
    ja: "プライバシーポリシー",
    en: "Privacy Policy",
  },
  "foot.terms": { "zh-Hant": "服務條款", "zh-Hans": "服务条款", ja: "利用規約", en: "Terms of Service" },
};

/** Look up a marketing string; per-key fallback to zh-Hant, then the key itself. */
export function mt(lang: UiLang, key: string, vars?: Record<string, string | number>): string {
  const row = STRINGS[key];
  if (!row) return key;
  const s = row[lang] ?? row["zh-Hant"] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
