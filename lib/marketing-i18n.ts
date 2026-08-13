// Self-contained i18n for the PUBLIC marketing surface (landing page + shell).
// Deliberately separate from the in-app catalog in `lib/i18n.ts`: the marketing
// page is server-rendered and seen by logged-out visitors, and we want all four
// UI languages here without dragging the (2-language) app catalog along.
//
// Server + client safe (pure data + a lookup fn, no hooks, no Node imports).
// Strings are grouped by key so all four languages stay side-by-side and in
// sync. zh-Hans is authored by hand (not OpenCC) because the copy carries
// Taiwan-specific vocab (腳踏車/捷運/販賣機/計程車) that needs Mainland wording.
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
    "zh-Hant": "Tuji · 圖鑑式單字學習",
    "zh-Hans": "Tuji · 图鉴式单词学习",
    ja: "Tuji · 図鑑で覚える単語学習",
    en: "Tuji · Picture-first vocabulary",
  },
  "meta.desc": {
    "zh-Hant":
      "看得見的單字，記得住的語言。Tuji 用日常生活的圖片、間隔複習與 AI 自製圖鑑，幫中文使用者學會生活英文和日文。",
    "zh-Hans":
      "看得见的单词，记得住的语言。Tuji 用日常生活的图片、间隔复习与 AI 自制图鉴，帮中文用户学会生活英语和日语。",
    ja: "見える単語は、忘れにくい。Tuji は日常の写真・間隔反復・AI 図鑑で、実生活の英語と日本語が身につく単語学習アプリです。",
    en: "Words you can see stick better. Tuji teaches everyday English and Japanese with real-life photos, spaced repetition, and an AI-built picture atlas.",
  },

  // ── Header / footer nav ─────────────────────────────────────
  "nav.features": { "zh-Hant": "產品特色", "zh-Hans": "产品特色", ja: "特長", en: "Features" },
  "nav.atlas": { "zh-Hant": "自製圖鑑", "zh-Hans": "自制图鉴", ja: "自作図鑑", en: "Custom Atlas" },
  // 物見 is the in-app name for the community surface; the app catalog renders it
  // as Sightings / 物見 / 物见, so the marketing page must say the same words.
  "nav.community": { "zh-Hant": "物見", "zh-Hans": "物见", ja: "物見", en: "Sightings" },
  "nav.how": { "zh-Hant": "怎麼學", "zh-Hans": "怎么学", ja: "使い方", en: "How it works" },
  "nav.support": { "zh-Hant": "支援", "zh-Hans": "支持", ja: "サポート", en: "Support" },

  "cta.getApp": {
    "zh-Hant": "取得 iOS App",
    "zh-Hans": "获取 iOS App",
    ja: "iOS アプリを入手",
    en: "Get the iOS App",
  },
  "cta.download": {
    "zh-Hant": "下載 iOS App",
    "zh-Hans": "下载 iOS App",
    ja: "iOS アプリをダウンロード",
    en: "Download the iOS App",
  },

  // ── Hero ────────────────────────────────────────────────────
  "hero.badge": {
    "zh-Hant": "圖鑑式單字學習 · Picture-first",
    "zh-Hans": "图鉴式单词学习 · Picture-first",
    ja: "図鑑で覚える単語学習 · Picture-first",
    en: "Picture-first vocabulary",
  },
  "hero.title1": {
    "zh-Hant": "看見什麼，",
    "zh-Hans": "看见什么，",
    ja: "見たものを、",
    en: "See it,",
  },
  "hero.title2": {
    "zh-Hant": "就學什麼",
    "zh-Hans": "就学什么",
    ja: "そのまま覚える",
    en: "learn it",
  },
  "hero.accent": { "zh-Hant": "。", "zh-Hans": "。", ja: "。", en: "." },
  "hero.subhead": {
    "zh-Hant":
      "Tuji 把日常生活變成你的單字圖鑑——圖片記憶、真人發音、間隔複習，再加上 AI 幫你把自己拍的照片變成單字卡。學英文和日文，從你眼前的世界開始。",
    "zh-Hans":
      "Tuji 把日常生活变成你的单词图鉴——图片记忆、真人发音、间隔复习，再加上 AI 帮你把自己拍的照片变成单词卡。学英语和日语，从你眼前的世界开始。",
    ja: "Tuji は日常を単語図鑑に変えます。写真で記憶し、ネイティブ音声で聞き、間隔反復で復習。さらに AI が自分で撮った写真を単語カードに変換。英語も日本語も、目の前の世界から学べます。",
    en: "Tuji turns everyday life into your own picture dictionary — image-based memory, native audio, and spaced review, plus an AI that turns your own photos into flashcards. Learn English and Japanese, starting with the world in front of you.",
  },
  "hero.stat1l": { "zh-Hant": "生活單字", "zh-Hans": "生活单词", ja: "生活の単語", en: "everyday words" },
  "hero.stat2l": { "zh-Hant": "雙語言學習", "zh-Hans": "双语言学习", ja: "2 言語対応", en: "two languages" },
  "hero.stat3l": { "zh-Hant": "圖鑑辨識", "zh-Hans": "图鉴识别", ja: "AI 認識", en: "photo recognition" },
  "hero.imgAlt": {
    "zh-Hant": "用手機拍攝桌上的物品，Tuji 將馬克杯、蘋果與筆記本轉成學習卡片",
    "zh-Hans": "用手机拍摄桌上的物品，Tuji 将马克杯、苹果与笔记本转成学习卡片",
    ja: "スマホで机の上の物を撮影し、Tuji がマグカップ・りんご・ノートを学習カードに変換",
    en: "Photographing objects on a desk with a phone; Tuji turns the mug, apple, and notebook into study cards",
  },
  "hero.aiBadge": {
    "zh-Hant": "AI 圖鑑辨識中",
    "zh-Hans": "AI 图鉴识别中",
    ja: "AI が認識中",
    en: "AI recognizing…",
  },
  "hero.floatLabel": {
    "zh-Hant": "拍照學習",
    "zh-Hans": "拍照学习",
    ja: "撮って学ぶ",
    en: "Snap to learn",
  },
  "hero.floatTag": {
    "zh-Hant": "新增單字卡 3 張 ✓",
    "zh-Hans": "新增单词卡 3 张 ✓",
    ja: "単語カード 3 枚追加 ✓",
    en: "3 cards added ✓",
  },

  // ── How it works ────────────────────────────────────────────
  "how.eyebrow": { "zh-Hant": "使用方式", "zh-Hans": "使用方式", ja: "使い方", en: "How it works" },
  "how.title": {
    "zh-Hant": "每天幾分鐘，讓複習自己找上門。",
    "zh-Hans": "每天几分钟，让复习自己找上门。",
    ja: "1 日数分。復習の方から会いに来ます。",
    en: "A few minutes a day — the reviews come to you.",
  },
  "how.subtitle": {
    "zh-Hant": "Tuji 的流程刻意保持簡單：打開、學習、離開。剩下的排程交給演算法。",
    "zh-Hans": "Tuji 的流程刻意保持简单：打开、学习、离开。剩下的排程交给算法。",
    ja: "Tuji の流れはあえてシンプル。開いて、学んで、閉じるだけ。スケジュールはアルゴリズムにお任せ。",
    en: "Tuji keeps the flow deliberately simple: open, learn, leave. The algorithm handles the scheduling.",
  },
  "how.s1t": {
    "zh-Hant": "打開 App，領取今日單字",
    "zh-Hans": "打开 App，领取今日单词",
    ja: "アプリを開いて、今日の単語を受け取る",
    en: "Open the app, get today's words",
  },
  "how.s1b": {
    "zh-Hant": "每天一份剛剛好的學習量。單字來自你選的生活分類——廚房、車站、超市，都是你真的會遇到的東西。",
    "zh-Hans": "每天一份刚刚好的学习量。单词来自你选的生活分类——厨房、车站、超市，都是你真的会遇到的东西。",
    ja: "毎日ちょうどいい量だけ。単語はあなたが選んだ生活シーン（キッチン、駅、スーパー）から。ぜんぶ実際に出会うものばかり。",
    en: "A right-sized batch each day. Words come from the everyday categories you pick — kitchen, station, supermarket — things you'll actually run into.",
  },
  "how.s2t": {
    "zh-Hant": "看圖記憶，一次記牢",
    "zh-Hans": "看图记忆，一次记牢",
    ja: "画像で覚えて、しっかり定着",
    en: "Learn by image, make it stick",
  },
  "how.s2b": {
    "zh-Hant": "每個單字都有圖片、發音與例句。用眼睛建立連結，比死背單字表記得更久。",
    "zh-Hans": "每个单词都有图片、发音与例句。用眼睛建立连结，比死背单词表记得更久。",
    ja: "どの単語にも画像・発音・例文つき。目で結びつけるから、単語帳の丸暗記より長く覚えていられます。",
    en: "Every word comes with an image, audio, and an example. Building the link visually lasts far longer than memorizing a word list.",
  },
  "how.s3t": {
    "zh-Hant": "到期自動複習",
    "zh-Hans": "到期自动复习",
    ja: "期限が来たら自動で復習",
    en: "Reviews resurface automatically",
  },
  "how.s3b": {
    "zh-Hant": "間隔重複演算法在你快忘記之前安排複習。你只要出現，Tuji 負責記得該複習什麼。",
    "zh-Hans": "间隔重复算法在你快忘记之前安排复习。你只要出现，Tuji 负责记得该复习什么。",
    ja: "間隔反復アルゴリズムが、忘れそうなタイミングで復習を用意。あなたは開くだけ。何を復習するかは Tuji が覚えています。",
    en: "The spaced-repetition algorithm schedules reviews right before you'd forget. Just show up — Tuji remembers what needs reviewing.",
  },

  // ── Features ────────────────────────────────────────────────
  "feat.eyebrow": { "zh-Hant": "主要特色", "zh-Hans": "主要特色", ja: "特長", en: "Features" },
  "feat.title": {
    "zh-Hant": "為了「每天都想打開」而設計。",
    "zh-Hans": "为了「每天都想打开」而设计。",
    ja: "「毎日開きたくなる」ために設計しました。",
    en: "Designed to make you want to open it every day.",
  },
  "feat.subtitle": {
    "zh-Hant": "從拍下真實物品、生成單字卡，到安排複習，Tuji 把學習流程做得像整理照片一樣自然。",
    "zh-Hans": "从拍下真实物品、生成单词卡，到安排复习，Tuji 把学习流程做得像整理照片一样自然。",
    ja: "実物を撮って単語カードを作り、復習を組むまで。Tuji は学習の流れを写真整理のように自然にします。",
    en: "From snapping real objects to generating cards and scheduling reviews, Tuji makes learning feel as natural as organizing your photos.",
  },
  "feat.f1t": {
    "zh-Hant": "圖像優先記憶",
    "zh-Hans": "图像优先记忆",
    ja: "画像優先の記憶",
    en: "Image-first memory",
  },
  "feat.f1b": {
    "zh-Hant": "從真實生活物品學單字，不是抽象的單字列表。看見圖片，想起單字。",
    "zh-Hans": "从真实生活物品学单词，不是抽象的单词列表。看见图片，想起单词。",
    ja: "抽象的な単語リストではなく、実物から学ぶ。画像を見れば、単語がよみがえる。",
    en: "Learn from real-life objects, not an abstract word list. See the picture, recall the word.",
  },
  "feat.f2t": {
    "zh-Hant": "間隔重複複習",
    "zh-Hans": "间隔重复复习",
    ja: "間隔反復の復習",
    en: "Spaced repetition",
  },
  "feat.f2b": {
    "zh-Hant": "科學化的複習排程，在遺忘曲線的關鍵點提醒你，讓短期記憶變成長期記憶。",
    "zh-Hans": "科学化的复习排程，在遗忘曲线的关键点提醒你，让短期记忆变成长期记忆。",
    ja: "科学的な復習スケジュールが、忘却曲線の要所でリマインド。短期記憶を長期記憶へ変えます。",
    en: "A science-based review schedule nudges you at the key points on the forgetting curve, turning short-term memory into long-term.",
  },
  "feat.f3t": {
    "zh-Hant": "多種練習模式",
    "zh-Hans": "多种练习模式",
    ja: "多彩な練習モード",
    en: "Multiple practice modes",
  },
  "feat.f3b": {
    "zh-Hant": "認圖、辨識、拼寫輪流上陣，同一個單字用不同角度練習，記憶更立體。",
    "zh-Hans": "认图、辨识、拼写轮流上阵，同一个单词用不同角度练习，记忆更立体。",
    ja: "画像認識・選択・スペルを順番に。同じ単語を違う角度で練習して、記憶が立体的に。",
    en: "Picture recall, recognition, and spelling take turns — practicing the same word from different angles makes memory stick.",
  },
  "feat.f4t": { "zh-Hant": "發音與例句", "zh-Hans": "发音与例句", ja: "発音と例文", en: "Audio & examples" },
  "feat.f4b": {
    "zh-Hant": "每個單字都能聽發音、看例句，學會怎麼念、怎麼用，而不只是認得。",
    "zh-Hans": "每个单词都能听发音、看例句，学会怎么念、怎么用，而不只是认得。",
    ja: "どの単語も発音を聞き、例文を読める。読み方・使い方まで身につき、ただ「見覚えがある」で終わりません。",
    en: "Hear the pronunciation and read an example for every word — learn how to say and use it, not just recognize it.",
  },
  "feat.f5t": { "zh-Hant": "英文・日文", "zh-Hans": "英语・日语", ja: "英語・日本語", en: "English & Japanese" },
  "feat.f5b": {
    "zh-Hant": "同一套圖鑑，支援英文與日文兩種學習目標，隨時切換學習方向。",
    "zh-Hans": "同一套图鉴，支持英语与日语两种学习目标，随时切换学习方向。",
    ja: "同じ図鑑で、英語と日本語の 2 つの学習目標に対応。いつでも学習の方向を切り替えられます。",
    en: "One picture atlas supports both English and Japanese as learning targets — switch direction anytime.",
  },
  "feat.f6t": { "zh-Hant": "進度看得見", "zh-Hans": "进度看得见", ja: "進捗が見える", en: "Visible progress" },
  "feat.f6b": {
    "zh-Hant": "每個單字的熟練度、每天的學習紀錄一目瞭然，累積的努力不會消失。",
    "zh-Hans": "每个单词的熟练度、每天的学习记录一目了然，累积的努力不会消失。",
    ja: "単語ごとの習熟度も毎日の学習記録もひと目で。積み重ねた努力は消えません。",
    en: "See each word's mastery and your daily record at a glance — the effort you build up never disappears.",
  },

  // ── Custom Atlas ────────────────────────────────────────────
  "atlas.badge": {
    "zh-Hant": "自製圖鑑 · Custom Atlas",
    "zh-Hans": "自制图鉴 · Custom Atlas",
    ja: "自作図鑑 · Custom Atlas",
    en: "Custom Atlas",
  },
  "atlas.title1": {
    "zh-Hant": "拍下你的世界，",
    "zh-Hans": "拍下你的世界，",
    ja: "あなたの世界を撮って、",
    en: "Photograph your world,",
  },
  "atlas.title2": {
    "zh-Hant": "變成你的單字卡。",
    "zh-Hans": "变成你的单词卡。",
    ja: "単語カードに変える。",
    en: "turn it into flashcards.",
  },
  "atlas.body": {
    "zh-Hant":
      "課本不會教你家廚房裡的東西。用相機把身邊的物品收進圖鑑，AI 幫你辨識命名，一起加入每天的複習。照片預設私人，只有你決定要不要分享。",
    "zh-Hans":
      "课本不会教你家厨房里的东西。用相机把身边的物品收进图鉴，AI 帮你识别命名，一起加入每天的复习。照片默认私密，只有你决定要不要分享。",
    ja: "教科書は家のキッチンにある物までは教えてくれません。カメラで身の回りの物を図鑑に収めれば、AI が認識して名前をつけ、毎日の復習に加わります。写真は初期設定で非公開。共有するかはあなた次第。",
    en: "Textbooks won't teach you what's in your own kitchen. Capture the objects around you into your atlas; AI recognizes and names them, and they join your daily review. Photos are private by default — you decide whether to share.",
  },
  "atlas.tag1": { "zh-Hant": "預設私人", "zh-Hans": "默认私密", ja: "初期設定で非公開", en: "Private by default" },
  "atlas.tag2": {
    "zh-Hant": "AI 輔助辨識",
    "zh-Hans": "AI 辅助识别",
    ja: "AI 認識サポート",
    en: "AI-assisted recognition",
  },
  "atlas.tag3": { "zh-Hant": "手動修正", "zh-Hans": "手动修正", ja: "手動で修正", en: "Manual corrections" },
  "atlas.tag4": {
    "zh-Hant": "分享自主控制",
    "zh-Hans": "分享自主控制",
    ja: "共有はあなたが管理",
    en: "You control sharing",
  },
  "atlas.s1t": { "zh-Hant": "拍下照片", "zh-Hans": "拍下照片", ja: "写真を撮る", en: "Take a photo" },
  "atlas.s1b": {
    "zh-Hant": "廚房的鍋子、巷口的招牌，拍下你想學的東西。",
    "zh-Hans": "厨房的锅子、巷口的招牌，拍下你想学的东西。",
    ja: "キッチンの鍋、路地の看板。学びたいものを撮るだけ。",
    en: "The pot in your kitchen, the sign on the corner — snap whatever you want to learn.",
  },
  "atlas.s2t": {
    "zh-Hant": "AI 辨識物品",
    "zh-Hans": "AI 识别物品",
    ja: "AI が物を認識",
    en: "AI identifies the object",
  },
  "atlas.s2b": {
    "zh-Hant": "AI 自動辨認照片裡的物品，並給出對應的單字。",
    "zh-Hans": "AI 自动识别照片里的物品，并给出对应的单词。",
    ja: "AI が写真の中の物を自動で認識し、対応する単語を提案します。",
    en: "AI automatically recognizes the object in the photo and gives you the matching word.",
  },
  "atlas.s3t": { "zh-Hant": "確認與修正", "zh-Hans": "确认与修正", ja: "確認と修正", en: "Confirm & correct" },
  "atlas.s3b": {
    "zh-Hant": "AI 猜錯了？直接改。你永遠有最後決定權。",
    "zh-Hans": "AI 猜错了？直接改。你永远有最后决定权。",
    ja: "AI が間違えた？その場で直せます。最終決定権はいつもあなたに。",
    en: "AI guessed wrong? Just fix it. You always have the final say.",
  },
  "atlas.s4t": { "zh-Hant": "變成單字卡", "zh-Hans": "变成单词卡", ja: "単語カードになる", en: "Becomes a flashcard" },
  "atlas.s4b": {
    "zh-Hant": "照片進入你的專屬圖鑑，加入每天的學習與複習。",
    "zh-Hans": "照片进入你的专属图鉴，加入每天的学习与复习。",
    ja: "写真はあなた専用の図鑑に入り、毎日の学習と復習に加わります。",
    en: "The photo joins your personal atlas and enters your daily study and review.",
  },
  // Quotas mirror atlasLimitsForTier() in lib/atlas/entitlement.ts and the iOS
  // paywall benefits. Deliberately no amounts: App Store prices are per-region,
  // so anything written here would be wrong for most visitors.
  "atlas.proNote": {
    "zh-Hant":
      "免費方案可建立 3 格自製圖鑑、每月 30 次 AI 辨識。Tuji Pro 擴充到 300 格與每月 500 次，並解鎖高精度辨識（每月 30 次）；提供月、3 個月、半年與年方案，價格請見 App Store。",
    "zh-Hans":
      "免费方案可建立 3 格自制图鉴、每月 30 次 AI 识别。Tuji Pro 扩充到 300 格与每月 500 次，并解锁高精度识别（每月 30 次）；提供月、3 个月、半年与年方案，价格请见 App Store。",
    ja: "無料プランは自作図鑑 3 枠、AI 認識は月 30 回まで。Tuji Pro なら 300 枠・月 500 回に広がり、高精度認識（月 30 回）も使えます。1 か月・3 か月・6 か月・1 年のプランがあり、価格は App Store でご確認ください。",
    en: "The free plan covers 3 custom atlas slots and 30 AI recognitions a month. Tuji Pro raises that to 300 slots and 500 a month and unlocks precision recognition (30 a month), in 1-month, 3-month, 6-month, and yearly plans — see the App Store for pricing.",
  },

  // ── Sightings (community) ───────────────────────────────────
  "comm.badge": {
    "zh-Hant": "物見 · Sightings",
    "zh-Hans": "物见 · Sightings",
    ja: "物見 · Sightings",
    en: "Sightings",
  },
  "comm.title1": {
    "zh-Hant": "別人拍下的世界，",
    "zh-Hans": "别人拍下的世界，",
    ja: "誰かが撮った世界も、",
    en: "Someone else's photos,",
  },
  "comm.title2": {
    "zh-Hant": "也能變成你的教材。",
    "zh-Hans": "也能变成你的教材。",
    ja: "あなたの教材になる。",
    en: "your next flashcards.",
  },
  "comm.body": {
    "zh-Hant":
      "物見是大家公開出來的圖鑑。看到喜歡的卡片就收進自己的複習排程，或整本收藏別人整理好的合集。所有公開內容都經過審核，你也隨時能檢舉或封鎖。",
    "zh-Hans":
      "物见是大家公开出来的图鉴。看到喜欢的卡片就收进自己的复习排程，或整本收藏别人整理好的合集。所有公开内容都经过审核，你也随时能举报或屏蔽。",
    ja: "物見は、みんなが公開した図鑑です。気に入ったカードは自分の復習に取り込み、誰かがまとめたコレクションはまるごと保存。公開される内容はすべて審査を通り、報告やブロックもいつでもできます。",
    en: "Sightings is everyone's published atlas. Take any card you like into your own review queue, or save a whole collection someone else curated. Everything public passes review, and you can report or block at any time.",
  },
  "comm.s1t": { "zh-Hant": "逛物見", "zh-Hans": "逛物见", ja: "物見をのぞく", en: "Browse Sightings" },
  "comm.s1b": {
    "zh-Hant": "別人拍下的真實物品，課本上不會有的那些。",
    "zh-Hans": "别人拍下的真实物品，课本上不会有的那些。",
    ja: "誰かが撮った実物の写真。教科書には載っていないものばかり。",
    en: "Real objects other people photographed — the ones no textbook covers.",
  },
  "comm.s2t": { "zh-Hant": "一鍵收進來", "zh-Hans": "一键收进来", ja: "ワンタップで取り込む", en: "Take it in" },
  "comm.s2b": {
    "zh-Hant": "收藏的卡片直接進入每日複習，跟自己拍的一起排程。",
    "zh-Hans": "收藏的卡片直接进入每日复习，跟自己拍的一起排程。",
    ja: "取り込んだカードは毎日の復習に入り、自分で撮ったものと一緒に出題されます。",
    en: "Saved cards drop straight into your daily review, scheduled alongside your own.",
  },
  "comm.s3t": { "zh-Hant": "整本合集", "zh-Hans": "整本合集", ja: "コレクション単位で", en: "Whole collections" },
  "comm.s3b": {
    "zh-Hant": "同主題的卡片收成一本，整本收藏、整本追蹤進度。",
    "zh-Hans": "同主题的卡片收成一本，整本收藏、整本追踪进度。",
    ja: "同じテーマのカードを一冊に。まるごと保存して、まるごと進捗を追えます。",
    en: "Cards on one theme, bound into a book — save it whole, track it whole.",
  },
  "comm.s4t": {
    "zh-Hant": "公開與否你決定",
    "zh-Hans": "公开与否你决定",
    ja: "公開するかはあなた次第",
    en: "You decide what's public",
  },
  "comm.s4b": {
    "zh-Hant": "拍下的東西預設私人。公開需經審核，遇到不舒服的內容可以檢舉或封鎖作者。",
    "zh-Hans": "拍下的东西默认私密。公开需经审核，遇到不舒服的内容可以举报或屏蔽作者。",
    ja: "撮ったものは初期設定で非公開。公開には審査があり、不快な内容は報告や作者のブロックができます。",
    en: "What you capture stays private by default. Publishing goes through review, and you can report content or block an author.",
  },

  // ── Download CTA ────────────────────────────────────────────
  "dl.title": {
    "zh-Hant": "Tuji 現在就在 App Store",
    "zh-Hans": "Tuji 现在就在 App Store",
    ja: "Tuji は App Store で公開中",
    en: "Tuji is on the App Store",
  },
  "dl.accent": { "zh-Hant": "。", "zh-Hans": "。", ja: "。", en: "." },
  "dl.subhead": {
    "zh-Hant": "立即下載 Tuji，用生活中的圖片開始學英文和日文。",
    "zh-Hans": "立即下载 Tuji，用生活中的图片开始学英语和日语。",
    ja: "今すぐ Tuji をダウンロードして、暮らしの中の写真で英語と日本語を学び始めましょう。",
    en: "Download Tuji now and start learning English and Japanese with pictures from everyday life.",
  },
  "dl.contact": { "zh-Hant": "聯絡我們", "zh-Hans": "联系我们", ja: "お問い合わせ", en: "Contact us" },

  // ── Footer ──────────────────────────────────────────────────
  "foot.tagline": {
    "zh-Hant": "圖鑑式單字學習。用日常生活的圖片，把英文和日文單字真正記進腦袋。",
    "zh-Hans": "图鉴式单词学习。用日常生活的图片，把英语和日语单词真正记进脑袋。",
    ja: "図鑑で覚える単語学習。日常の写真で、英語と日本語の単語を本当に頭に残します。",
    en: "Picture-first vocabulary. Use everyday photos to make English and Japanese words truly stick.",
  },
  "foot.product": { "zh-Hant": "產品", "zh-Hans": "产品", ja: "プロダクト", en: "Product" },
  "foot.iosApp": { "zh-Hant": "iOS App", "zh-Hans": "iOS App", ja: "iOS App", en: "iOS App" },
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

  // ── Marquee glosses (keyed by word id; en hides the gloss line) ──
  "mq.alarm-clock": { "zh-Hant": "鬧鐘", "zh-Hans": "闹钟", ja: "目覚まし時計", en: "" },
  "mq.headphones": { "zh-Hant": "耳機", "zh-Hans": "耳机", ja: "ヘッドホン", en: "" },
  "mq.rice-cooker": { "zh-Hant": "電鍋", "zh-Hans": "电饭煲", ja: "炊飯器", en: "" },
  "mq.bicycle": { "zh-Hant": "腳踏車", "zh-Hans": "自行车", ja: "自転車", en: "" },
  "mq.mug": { "zh-Hant": "馬克杯", "zh-Hans": "马克杯", ja: "マグカップ", en: "" },
  "mq.vending-machine": { "zh-Hant": "販賣機", "zh-Hans": "自动售货机", ja: "自動販売機", en: "" },
  "mq.scissors": { "zh-Hant": "剪刀", "zh-Hans": "剪刀", ja: "はさみ", en: "" },
  "mq.toaster": { "zh-Hant": "烤麵包機", "zh-Hans": "烤面包机", ja: "トースター", en: "" },
  "mq.convenience-store": { "zh-Hant": "便利商店", "zh-Hans": "便利店", ja: "コンビニ", en: "" },
  "mq.subway": { "zh-Hant": "捷運", "zh-Hans": "地铁", ja: "地下鉄", en: "" },
  "mq.frying-pan": { "zh-Hant": "平底鍋", "zh-Hans": "平底锅", ja: "フライパン", en: "" },
  "mq.towel": { "zh-Hant": "毛巾", "zh-Hans": "毛巾", ja: "タオル", en: "" },
  "mq.bookshelf": { "zh-Hant": "書櫃", "zh-Hans": "书柜", ja: "本棚", en: "" },
  "mq.taxi": { "zh-Hant": "計程車", "zh-Hans": "出租车", ja: "タクシー", en: "" },
  "mq.kettle": { "zh-Hant": "熱水壺", "zh-Hans": "热水壶", ja: "やかん", en: "" },
  "mq.shopping-cart": { "zh-Hant": "購物車", "zh-Hans": "购物车", ja: "ショッピングカート", en: "" },
};

/** Look up a marketing string; per-key fallback to zh-Hant, then the key itself. */
export function mt(lang: UiLang, key: string): string {
  const row = STRINGS[key];
  if (!row) return key;
  return row[lang] ?? row["zh-Hant"] ?? key;
}
