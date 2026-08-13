import type postgres from "postgres";
import { segmentFurigana } from "./kana";

type Sql = ReturnType<typeof postgres>;

type ExampleCorrection = {
  sortOrder: number;
  oldEn: string;
  en: string;
  oldZh: string;
  zh: string;
  oldJa?: string;
  ja?: string;
};

type TextCorrection = { old: string; value: string };

type LocalizedTextCorrection = TextCorrection & {
  field: "etymology" | "note";
  language: "en" | "ja";
};

type MainWordCorrection = {
  id: string;
  oldWord?: string;
  word?: string;
  oldZh?: string;
  zh?: string;
  oldJa?: string;
  ja?: string;
  oldJaReading?: string;
  jaReading?: string;
  enDefinition?: TextCorrection;
  jaDefinition?: TextCorrection;
  chineseDefinition?: TextCorrection;
  localizedTexts?: LocalizedTextCorrection[];
  oldCategory?: string;
  category?: string;
  oldPronunciation?: string;
  pronunciation?: string;
  examples?: ExampleCorrection[];
};

export const MAIN_WORD_CORRECTIONS: MainWordCorrection[] = [
  {
    id: "electric-cooker",
    oldWord: "electric cooker",
    word: "slow cooker",
    oldZh: "電鍋",
    zh: "慢燉鍋",
    oldJa: "電気調理器",
    ja: "スロークッカー",
    oldJaReading: "でんきちょうりき",
    jaReading: "スロークッカー",
    oldPronunciation: "/ɪˌlek.trɪk ˈkʊk.ɚ/",
    pronunciation: "/ˈsloʊ ˌkʊk.ɚ/",
    enDefinition: {
      old: "An electric appliance used to cook food, especially rice or stews.",
      value:
        "An electric pot that cooks food slowly at a low temperature, often used for soups and stews.",
    },
    jaDefinition: {
      old: "「炊飯器」は、電気を使って調理する家電製品です。炊飯や煮込み料理によく使われます。",
      value:
        "「スロークッカー」は、低い温度で食材を長時間かけて煮込む電気調理器です。スープやシチューによく使います。",
    },
    chineseDefinition: {
      old: "以電力烹煮食物的家電，常用於煮飯或燉煮料理。",
      value: "以低溫長時間慢慢烹煮食材的電器，常用來煮湯或燉菜。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "electric + cooker. Electric comes from Greek ēlektron (amber) — the ancients noticed rubbed amber sparks static, and the word became the root of 'electricity'. Together: a pot that cooks on electric power.",
        value: "slow + cooker: an appliance that cooks food slowly at low heat.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "複合語 electric + cook + -er。",
        value: "slow（ゆっくりした）+ cooker（調理器具）から。",
      },
      {
        field: "note",
        language: "en",
        old: "electric + cooker",
        value: "slow + cooker",
      },
      {
        field: "note",
        language: "ja",
        old: "electric（電気の）+ cooker（調理器具）。",
        value: "slow（ゆっくりした）+ cooker（調理器具）。",
      },
    ],
    examples: [
      {
        sortOrder: 0,
        oldEn: "I use the slow cooker in the kitchen.",
        en: "I make stew in the slow cooker.",
        oldZh: "我在廚房使用慢燉鍋。",
        zh: "我用慢燉鍋煮燉菜。",
        oldJa: "私はキッチンで炊飯器を使います。",
        ja: "スロークッカーでシチューを作ります。",
      },
    ],
  },
  {
    id: "toilet-seat",
    oldZh: "馬桶蓋",
    zh: "馬桶座圈",
    examples: [
      {
        sortOrder: 0,
        oldEn: "The toilet seat is in the bathroom.",
        en: "The toilet seat is in the bathroom.",
        oldZh: "馬桶蓋在浴室裡。",
        zh: "馬桶座圈在浴室裡。",
      },
    ],
  },
  {
    id: "deodorant",
    oldZh: "除臭劑",
    zh: "體香劑",
    oldJa: "制汗剤",
    ja: "デオドラント",
    oldJaReading: "せいかんざい",
    jaReading: "デオドラント",
    examples: [
      {
        sortOrder: 0,
        oldEn: "The deodorant is in the bathroom.",
        en: "The deodorant is in the bathroom.",
        oldZh: "除臭劑在浴室裡。",
        zh: "體香劑在浴室裡。",
      },
    ],
  },
  {
    id: "lotion",
    oldJa: "ローション",
    ja: "ボディローション",
    oldJaReading: "ローション",
    jaReading: "ボディローション",
  },
  {
    id: "eraser",
    oldWord: "eraser",
    word: "whiteboard eraser",
    oldZh: "板擦",
    zh: "白板擦",
    oldJa: "消しゴム",
    ja: "ホワイトボード用イレーザー",
    oldJaReading: "けしゴム",
    jaReading: "ホワイトボードようイレーザー",
    oldPronunciation: "/ɪˈreɪ.sɚ/",
    pronunciation: "/ˈwaɪt.bɔːrd ɪˌreɪ.sɚ/",
    enDefinition: {
      old: "A small object used to remove pencil or pen marks.",
      value: "A felt or foam tool used to wipe writing off a whiteboard.",
    },
    jaDefinition: {
      old: "「消しゴム」とは、鉛筆やボールペンで書いた文字を消すための小物です。",
      value:
        "「ホワイトボード用イレーザー」は、ホワイトボードに書いた文字を拭き取るための道具です。",
    },
    chineseDefinition: {
      old: "小型物品，用來擦除鉛筆或原子筆筆跡。",
      value: "用來擦除白板筆字跡的絨布或海綿製工具。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "erase + -er. Erase comes from Latin eradere: e- (out) + radere (to scrape). So an eraser is literally 'the thing that scrapes the writing off' — there's a hint of abrasion in its roots.",
        value: "whiteboard + eraser: the tool used to wipe writing from a whiteboard.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "erase + -er。消すもの。",
        value: "whiteboard（ホワイトボード）+ eraser（消す道具）から。",
      },
      {
        field: "note",
        language: "en",
        old: "erase + er = the rubbing-out tool",
        value: "whiteboard + eraser",
      },
      {
        field: "note",
        language: "ja",
        old: "erase（消す）+ -er = 消しゴム。",
        value: "ホワイトボードの文字を消す道具。",
      },
    ],
    examples: [
      {
        sortOrder: 0,
        oldEn: "I need the eraser at the office.",
        en: "I need the whiteboard eraser at the office.",
        oldZh: "我在辦公室需要板擦。",
        zh: "我在辦公室需要白板擦。",
        oldJa: "オフィスで消しゴムが必要です。",
        ja: "オフィスでホワイトボード用イレーザーが必要です。",
      },
    ],
  },
  {
    id: "bathroom-cabinet",
    oldJa: "洗面台収納",
    ja: "洗面所の収納棚",
    oldJaReading: "せんめんだいしゅうのう",
    jaReading: "せんめんじょのしゅうのうだな",
  },
  {
    id: "nightstand",
    oldJa: "ナイトスタンド",
    ja: "ベッドサイドテーブル",
    oldJaReading: "ナイトスタンド",
    jaReading: "ベッドサイドテーブル",
  },
  {
    id: "display-cabinet",
    oldJa: "ディスプレイキャビネット",
    ja: "飾り棚",
    oldJaReading: "ディスプレイキャビネット",
    jaReading: "かざりだな",
  },
  {
    id: "wall-art",
    oldJa: "壁面アート",
    ja: "壁飾り",
    oldJaReading: "へきめんアート",
    jaReading: "かべかざり",
  },
  {
    id: "footstool",
    oldJa: "フットスツール",
    ja: "足置き",
    oldJaReading: "フットスツール",
    jaReading: "あしおき",
  },
  {
    id: "computer",
    oldJa: "コンピューター",
    ja: "パソコン",
    oldJaReading: "コンピューター",
    jaReading: "パソコン",
  },
  {
    id: "paper-clip",
    oldJa: "ペーパークリップ",
    ja: "クリップ",
    oldJaReading: "ペーパークリップ",
    jaReading: "クリップ",
  },
  {
    id: "reception-desk",
    oldJa: "受付",
    ja: "受付カウンター",
    oldJaReading: "うけつけ",
    jaReading: "うけつけカウンター",
  },
  {
    id: "cashier",
    oldZh: "收銀員 / 收銀台",
    zh: "收銀員",
    oldJa: "レジ",
    ja: "レジ係",
    oldJaReading: "レジ",
    jaReading: "レジがかり",
    enDefinition: {
      old: "A person who handles payments at a store, or the place where payment is made.",
      value: "A person who takes payments and scans purchases at a store.",
    },
    jaDefinition: {
      old: "「レジ」とは、店舗内で支払いの回収を担当する人、または支払いが行われるカウンターのことです。",
      value: "「レジ係」は、店で商品の会計や支払いを担当する人です。",
    },
    chineseDefinition: {
      old: "商店中負責收取付款的人員，或進行付款的櫃台。",
      value: "商店中負責掃描商品、結帳並收取付款的人員。",
    },
    examples: [
      {
        sortOrder: 0,
        oldEn: "Pay at the cashier.",
        en: "The cashier scanned my groceries.",
        oldZh: "在收銀台付款。",
        zh: "收銀員掃描了我買的商品。",
        oldJa: "レジでお支払いください。",
        ja: "レジ係が商品をスキャンしました。",
      },
      {
        sortOrder: 1,
        oldEn: "The cashier was friendly.",
        en: "The cashier was friendly.",
        oldZh: "收銀員很親切。",
        zh: "收銀員很親切。",
        oldJa: "レジ係は親切でした。",
        ja: "レジ係は親切でした。",
      },
      {
        sortOrder: 2,
        oldEn: "There's a long line at the cashier.",
        en: "The cashier gave me the receipt.",
        oldZh: "收銀台排了長長的隊伍。",
        zh: "收銀員把收據交給我。",
        oldJa: "レジには長い列ができていました。",
        ja: "レジ係がレシートを渡してくれました。",
      },
    ],
  },
  {
    id: "invoice",
    oldZh: "發票",
    zh: "請款單",
    oldCategory: "supermarket",
    category: "office",
    examples: [
      {
        sortOrder: 0,
        oldEn: "I found the invoice at the supermarket.",
        en: "I received the invoice at the office.",
        oldZh: "我在超市找到發票。",
        zh: "我在辦公室收到請款單。",
        oldJa: "スーパーで請求書を見つけました。",
        ja: "オフィスで請求書を受け取りました。",
      },
    ],
  },
  {
    id: "mailbox",
    oldZh: "信箱",
    zh: "郵筒",
    examples: [
      {
        sortOrder: 0,
        oldEn: "Drop the letter in the mailbox.",
        en: "Drop the letter in the mailbox.",
        oldZh: "把信投進信箱。",
        zh: "把信投進郵筒。",
      },
      {
        sortOrder: 1,
        oldEn: "The mailbox is red.",
        en: "The mailbox is red.",
        oldZh: "信箱是紅色的。",
        zh: "郵筒是紅色的。",
      },
      {
        sortOrder: 2,
        oldEn: "Check your mailbox tomorrow.",
        en: "The mailbox is on the corner.",
        oldZh: "明天去看信箱。",
        zh: "郵筒在街角。",
      },
    ],
  },
  {
    id: "pedestrian-button",
    oldJa: "押しボタン式信号",
    ja: "歩行者用押しボタン",
    oldJaReading: "おしボタンしきしんごう",
    jaReading: "ほこうしゃようおしボタン",
  },
  {
    id: "roadblock",
    oldWord: "roadblock",
    word: "barricade",
    oldJa: "路上の障害物",
    ja: "バリケード",
    oldJaReading: "ろじょうのしょうがいぶつ",
    jaReading: "バリケード",
    oldPronunciation: "/ˈroʊd.blɑːk/",
    pronunciation: "/ˌber.əˈkeɪd/",
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "road + block. Block comes from Old French bloc (a lump, a wooden block). Together: something set across the road — a stone, a barrier, or a police checkpoint.",
        value:
          "From French barricade, a barrier built to block a road or passage.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "複合語 road + block。",
        value: "フランス語 barricade（通路をふさぐ障害物）に由来。",
      },
      {
        field: "note",
        language: "en",
        old: "road + block",
        value: "a barrier that blocks a road or passage",
      },
      {
        field: "note",
        language: "ja",
        old: "road（道）+ block（障害物）。",
        value: "道路や通路をふさぐ障害物。",
      },
    ],
    examples: [
      {
        sortOrder: 0,
        oldEn: "You can see the roadblock on the street.",
        en: "You can see the barricade on the street.",
        oldZh: "你可以在街上看到路障。",
        zh: "你可以在街上看到路障。",
      },
    ],
  },
  {
    id: "street-vendor",
    oldWord: "street vendor",
    word: "food cart",
    oldZh: "路邊攤",
    zh: "餐車",
    oldJa: "屋台",
    ja: "屋台",
    oldPronunciation: "/ˈstriːt ˌven.dɚ/",
    pronunciation: "/ˈfuːd ˌkɑːrt/",
    enDefinition: {
      old: "A person who sells food or goods from a stall on the street.",
      value: "A small wheeled cart or mobile stall used to prepare and sell food.",
    },
    jaDefinition: {
      old: "「屋台」とは、路上で食べ物や商品を販売する業者のことです。",
      value: "「屋台」は、路上などで食べ物を調理して販売するための移動式の店です。",
    },
    chineseDefinition: {
      old: "在街頭擺攤販售食物或商品的小販。",
      value: "可移動的小型攤車，用來在街頭烹調並販售食物。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "street + vendor. Vendor comes from Latin vendere (to sell). Together: a seller with a stall on the street — the street-hawker culture common in cities.",
        value: "food + cart: a wheeled cart used to prepare or sell food.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "複合語 street + vendor。",
        value: "food（食べ物）+ cart（手押し車）から。",
      },
      {
        field: "note",
        language: "en",
        old: "street + vendor",
        value: "food + cart",
      },
      {
        field: "note",
        language: "ja",
        old: "street（通り）+ vendor（売り手）。",
        value: "食べ物を売る移動式の屋台。",
      },
    ],
    examples: [
      {
        sortOrder: 0,
        oldEn: "You can see the street vendor on the street.",
        en: "You can see the food cart on the street.",
        oldZh: "你可以在街上看到路邊攤。",
        zh: "你可以在街上看到餐車。",
      },
    ],
  },
  {
    id: "vendor",
    oldWord: "vendor",
    word: "market stall",
    oldZh: "攤販",
    zh: "市場攤位",
    oldJa: "売り手",
    ja: "露店",
    oldJaReading: "うりて",
    jaReading: "ろてん",
    oldPronunciation: "/ˈven.dɚ/",
    pronunciation: "/ˈmɑːr.kɪt ˌstɔːl/",
    enDefinition: {
      old: "A person or company that sells goods or services.",
      value: "A small stand or booth where goods are sold in a market.",
    },
    jaDefinition: {
      old: "「売り手」とは、商品またはサービスを販売する個人または企業です。",
      value: "「露店」は、市場や路上で商品を売るための小さな店や売り場です。",
    },
    chineseDefinition: {
      old: "販售商品或服務的個人或公司。",
      value: "設在市場或街頭、用來販售商品的小型攤位。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "From Latin venditor: vendere (to sell) + -tor (agent). So vendor literally means 'one who sells' — a pure core feeling, big or small, as long as they're the seller.",
        value: "market + stall: a small stand where goods are sold in a market.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "ラテン語 vendere（売る）+ -or。",
        value: "market（市場）+ stall（露店・売り場）から。",
      },
      {
        field: "note",
        language: "en",
        old: "vend (sell) + or = the vendor / hawker",
        value: "market + stall",
      },
      {
        field: "note",
        language: "ja",
        old: "物を売る人。",
        value: "市場や路上に出す小さな売り場。",
      },
    ],
    examples: [
      {
        sortOrder: 0,
        oldEn: "You can see the vendor on the street.",
        en: "You can see the market stall on the street.",
        oldZh: "你可以在街上看到攤販。",
        zh: "你可以在街上看到市場攤位。",
        oldJa: "街で売り手を見ることができます。",
        ja: "街で露店を見ることができます。",
      },
    ],
  },
  {
    id: "dark-soy-sauce",
    oldJa: "濃口醤油（老抽）",
    ja: "老抽",
    oldJaReading: "こいくちしょうゆ（ろうちゅう）",
    jaReading: "ラオチョウ",
    jaDefinition: {
      old: "「濃口醤油（老抽）」は、色付けやコクを加えるために使用される、色が濃くて濃いめのほんのり甘い醤油です。",
      value:
        "「老抽」は、料理に色とコクをつけるために使う、色が濃く少し甘みのある中国の醤油です。",
    },
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some dark soy sauce to the dish.",
        en: "Add some dark soy sauce to the dish.",
        oldZh: "在這道菜裡加一些老抽。",
        zh: "在這道菜裡加一些老抽。",
        oldJa: "この料理に濃口醤油を少し加えます。",
        ja: "老抽を少し加えて、料理に色とコクをつけます。",
      },
    ],
  },
  {
    id: "light-soy-sauce",
    oldJa: "薄口醤油（生抽）",
    ja: "生抽",
    oldJaReading: "うすくちしょうゆ（せいちゅう）",
    jaReading: "シェンチョウ",
    jaDefinition: {
      old: "「薄口醤油（生抽）」は、食べ物の味付けに使用される、薄めの塩味のしょうゆです。",
      value:
        "「生抽」は、料理の味付けやつけだれに使う、色が薄く塩味のある中国の醤油です。",
    },
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some light soy sauce to the dish.",
        en: "Add some light soy sauce to the dish.",
        oldZh: "在這道菜裡加一些生抽。",
        zh: "在這道菜裡加一些生抽。",
        oldJa: "この料理に薄口醤油を少し加えます。",
        ja: "生抽を少し加えて、料理に味をつけます。",
      },
    ],
  },
  {
    id: "white-vinegar",
    oldJa: "穀物酢",
    ja: "ホワイトビネガー",
    oldJaReading: "こくもつず",
    jaReading: "ホワイトビネガー",
  },
  {
    id: "cinnamon-bark",
    oldWord: "cinnamon bark",
    word: "cinnamon sticks",
    oldZh: "桂皮",
    zh: "肉桂棒",
    oldJa: "シナモンスティック",
    ja: "シナモンスティック",
    oldPronunciation: "/ˈsɪn.ə.mən bɑːrk/",
    pronunciation: "/ˈsɪn.ə.mən ˌstɪks/",
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "cinnamon + bark. Bark comes from Old Norse bǫrkr (tree bark). Together: the bark of the cinnamon tree, used whole or curled into sticks.",
        value: "cinnamon + sticks: rolled pieces of dried cinnamon bark used as a spice.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "複合語 cinnamon + bark。",
        value: "cinnamon（シナモン）+ sticks（棒状のもの）から。",
      },
      {
        field: "note",
        language: "en",
        old: "cinnamon + bark = cassia bark",
        value: "cinnamon + sticks",
      },
      {
        field: "note",
        language: "ja",
        old: "cinnamon（シナモン）+ bark（樹皮）。",
        value: "棒状に巻いたシナモンの樹皮。",
      },
    ],
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some cinnamon bark to the dish.",
        en: "Add some cinnamon sticks to the dish.",
        oldZh: "在這道菜裡加一些桂皮。",
        zh: "在這道菜裡加一些肉桂棒。",
      },
    ],
  },
  {
    id: "cornstarch",
    oldZh: "玉米粉",
    zh: "玉米澱粉",
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some cornstarch to the dish.",
        en: "Add some cornstarch to the dish.",
        oldZh: "在這道菜裡加一些玉米粉。",
        zh: "在這道菜裡加一些玉米澱粉。",
      },
    ],
  },
];

/**
 * Applies curated corrections only while a field is still at the known old
 * value (or already at the corrected value). Later admin edits are preserved.
 */
export async function applyMainWordCorrections(sql: Sql): Promise<number> {
  const touched = new Set<string>();

  await sql.begin(async (tx) => {
    for (const correction of MAIN_WORD_CORRECTIONS) {
      const rows = await tx`
        UPDATE words
        SET
          word = CASE
            WHEN ${correction.word ?? null}::text IS NOT NULL
             AND word IN (${correction.oldWord ?? null}, ${correction.word ?? null})
              THEN ${correction.word ?? null}
            ELSE word
          END,
          category = CASE
            WHEN ${correction.category ?? null}::text IS NOT NULL
             AND category IN (${correction.oldCategory ?? null}, ${correction.category ?? null})
              THEN ${correction.category ?? null}
            ELSE category
          END,
          pronunciation = CASE
            WHEN ${correction.pronunciation ?? null}::text IS NOT NULL
             AND pronunciation IN (
               ${correction.oldPronunciation ?? correction.pronunciation ?? null},
               ${correction.pronunciation ?? null}
             )
              THEN ${correction.pronunciation ?? null}
            ELSE pronunciation
          END,
          updated_at = now()
        WHERE id = ${correction.id}
          AND deleted_at IS NULL
        RETURNING id
      `;
      if (rows.length === 0) continue;
      touched.add(correction.id);

      if (correction.zh) {
        await tx`
          UPDATE word_definitions
          SET definition = ${correction.zh}, updated_at = now()
          WHERE word_id = ${correction.id}
            AND language = 'zh'
            AND sort_order = (
              SELECT min(sort_order) FROM word_definitions
              WHERE word_id = ${correction.id} AND language = 'zh'
            )
            AND definition IN (${correction.oldZh ?? correction.zh}, ${correction.zh})
        `;
      }

      for (const [language, definition] of [
        ["en", correction.enDefinition],
        ["ja", correction.jaDefinition],
      ] as const) {
        if (!definition) continue;
        await tx`
          UPDATE word_definitions
          SET definition = ${definition.value}, updated_at = now()
          WHERE word_id = ${correction.id}
            AND language = ${language}
            AND sort_order = (
              SELECT min(sort_order) FROM word_definitions
              WHERE word_id = ${correction.id} AND language = ${language}
            )
            AND definition IN (${definition.old}, ${definition.value})
        `;
      }

      if (
        correction.oldJa &&
        correction.ja &&
        correction.oldJa !== correction.ja &&
        !correction.jaDefinition
      ) {
        await tx`
          UPDATE word_definitions
          SET definition = CASE
                WHEN definition LIKE ${`「${correction.ja.replace(correction.oldJa, correction.ja)}」%`}
                  THEN replace(
                    definition,
                    ${`「${correction.ja.replace(correction.oldJa, correction.ja)}」`},
                    ${`「${correction.ja}」`}
                  )
                ELSE replace(
                  definition,
                  ${`「${correction.oldJa}」`},
                  ${`「${correction.ja}」`}
                )
              END,
              updated_at = now()
          WHERE word_id = ${correction.id}
            AND language = 'ja'
            AND definition LIKE ${`「${correction.oldJa}」%`}
             OR (
               word_id = ${correction.id}
               AND language = 'ja'
               AND definition LIKE ${`「${correction.ja.replace(correction.oldJa, correction.ja)}」%`}
             )
        `;

        await tx`
          UPDATE word_example_translations t
          SET translation = CASE
                WHEN t.translation LIKE ${`%${correction.ja.replace(correction.oldJa, correction.ja)}%`}
                  THEN replace(
                    t.translation,
                    ${correction.ja.replace(correction.oldJa, correction.ja)},
                    ${correction.ja}
                  )
                ELSE replace(t.translation, ${correction.oldJa}, ${correction.ja})
              END
          FROM word_examples e
          WHERE t.example_id = e.id
            AND e.word_id = ${correction.id}
            AND t.language = 'ja'
            AND t.translation LIKE ${`%${correction.oldJa}%`}
            AND t.translation NOT LIKE ${`%${correction.ja}%`}
             OR (
               t.example_id = e.id
               AND e.word_id = ${correction.id}
               AND t.language = 'ja'
               AND t.translation LIKE ${`%${correction.ja.replace(correction.oldJa, correction.ja)}%`}
             )
        `;
      }

      if (correction.chineseDefinition) {
        await tx`
          UPDATE words
          SET chinese_definition = ${correction.chineseDefinition.value}, updated_at = now()
          WHERE id = ${correction.id}
            AND chinese_definition IN (
              ${correction.chineseDefinition.old},
              ${correction.chineseDefinition.value}
            )
        `;
      }

      if (correction.ja) {
        const reading = correction.jaReading ?? correction.ja;
        const readingSegments = segmentFurigana(correction.ja, reading, new Map());
        await tx`
          INSERT INTO word_terms (
            word_id, language, term, reading, pronunciation, reading_segments
          )
          VALUES (
            ${correction.id},
            'ja',
            ${correction.ja},
            ${reading},
            ${reading},
            ${readingSegments ? tx.json(readingSegments as never) : null}
          )
          ON CONFLICT (word_id, language) DO UPDATE SET
            term = EXCLUDED.term,
            reading = EXCLUDED.reading,
            pronunciation = EXCLUDED.pronunciation,
            reading_segments = EXCLUDED.reading_segments,
            updated_at = now()
          WHERE word_terms.term IN (${correction.oldJa ?? correction.ja}, ${correction.ja})
            AND (
              ${correction.oldJaReading ?? reading}::text IS NULL
              OR word_terms.reading IS NULL
              OR word_terms.reading IN (${correction.oldJaReading ?? reading}, ${reading})
            )
        `;
      }

      if (correction.word) {
        await tx`
          INSERT INTO word_terms (word_id, language, term, pronunciation)
          SELECT id, 'en', word, pronunciation FROM words WHERE id = ${correction.id}
          ON CONFLICT (word_id, language) DO UPDATE SET
            term = EXCLUDED.term,
            pronunciation = EXCLUDED.pronunciation,
            updated_at = now()
          WHERE word_terms.term IN (${correction.oldWord ?? correction.word}, ${correction.word})
        `;

      }

      for (const text of correction.localizedTexts ?? []) {
        await tx`
          UPDATE word_localized_texts
          SET value = ${text.value}
          WHERE word_id = ${correction.id}
            AND field = ${text.field}
            AND language = ${text.language}
            AND value IN (${text.old}, ${text.value})
        `;
      }

      for (const example of correction.examples ?? []) {
        const exampleRows = await tx`
          UPDATE word_examples
          SET sentence = ${example.en}
          WHERE id = (
            SELECT id FROM word_examples
            WHERE word_id = ${correction.id} AND sort_order = ${example.sortOrder}
            ORDER BY id
            LIMIT 1
          )
            AND sentence IN (${example.oldEn}, ${example.en})
          RETURNING id
        `;
        if (exampleRows.length === 0) continue;
        const exampleId = exampleRows[0].id;
        await tx`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES (${exampleId}, 'zh', ${example.zh})
          ON CONFLICT (example_id, language) DO UPDATE SET
            translation = EXCLUDED.translation
          WHERE word_example_translations.translation IN (${example.oldZh}, ${example.zh})
        `;

        if (example.ja) {
          await tx`
            INSERT INTO word_example_translations (example_id, language, translation)
            VALUES (${exampleId}, 'ja', ${example.ja})
            ON CONFLICT (example_id, language) DO UPDATE SET
              translation = EXCLUDED.translation
            WHERE word_example_translations.translation IN (
              ${example.oldJa ?? example.ja},
              ${example.ja}
            )
          `;
        }
      }

      if (correction.word || correction.zh || correction.pronunciation) {
        await tx`
          UPDATE cards c
          SET
            back = w.word,
            explanation = concat(w.word, ' ', w.pronunciation, ' — ', d.definition)
          FROM words w
          JOIN LATERAL (
            SELECT definition
            FROM word_definitions
            WHERE word_id = w.id AND language = 'zh'
            ORDER BY sort_order
            LIMIT 1
          ) d ON true
          WHERE c.word_id = w.id
            AND c.word_id = ${correction.id}
            AND c.deck_key = 'image-en'
        `;
      }
    }
  });

  return touched.size;
}
