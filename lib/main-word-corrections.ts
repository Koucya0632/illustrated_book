import type postgres from "postgres";
import { segmentFurigana } from "./kana";

type Sql = ReturnType<typeof postgres>;

type ExampleCorrection = {
  sortOrder: number;
  oldEn: string;
  previousEn?: string;
  en: string;
  oldZh: string;
  previousZh?: string;
  zh: string;
  oldJa?: string;
  previousJa?: string;
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

function dailySeasoningExample(
  oldEnIngredient: string,
  oldZhIngredient: string,
  oldJaIngredient: string,
  en: string,
  zh: string,
  ja: string,
): ExampleCorrection {
  return {
    sortOrder: 0,
    oldEn: `Add some ${oldEnIngredient} to the dish.`,
    en,
    oldZh: `在這道菜裡加一些${oldZhIngredient}。`,
    zh,
    oldJa: `この料理に${oldJaIngredient}を少し加えます。`,
    ja,
  };
}

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
    id: "apple-cider-vinegar",
    jaDefinition: {
      old: "「リンゴ酢」はリンゴ酢を発酵させて醸造した酢です。",
      value: "「リンゴ酢」は、リンゴ果汁を発酵させて造る酢です。",
    },
    chineseDefinition: {
      old: "以發酵的蘋果酒釀製而成的醋。",
      value: "以蘋果汁發酵釀製而成的醋。",
    },
    examples: [
      dailySeasoningExample(
        "apple cider vinegar",
        "蘋果醋",
        "リンゴ酢",
        "I use apple cider vinegar in salad dressing.",
        "我用蘋果醋做沙拉醬。",
        "サラダのドレッシングにリンゴ酢を使います。",
      ),
    ],
  },
  {
    id: "baking-powder",
    examples: [
      dailySeasoningExample(
        "baking powder",
        "發粉",
        "ベーキングパウダー",
        "Add baking powder to the cake batter.",
        "在蛋糕麵糊裡加入發粉。",
        "ケーキの生地にベーキングパウダーを入れます。",
      ),
    ],
  },
  {
    id: "baking-soda",
    examples: [
      dailySeasoningExample(
        "baking soda",
        "小蘇打粉",
        "重曹",
        "Add baking soda to the cookie dough.",
        "在餅乾麵糰裡加入小蘇打粉。",
        "クッキーの生地に重曹を入れます。",
      ),
    ],
  },
  {
    id: "black-vinegar",
    examples: [
      dailySeasoningExample(
        "black vinegar",
        "黑醋",
        "黒酢",
        "Dip the dumplings in black vinegar.",
        "水餃沾黑醋吃。",
        "餃子に黒酢をつけて食べます。",
      ),
    ],
  },
  {
    id: "bonito-powder",
    jaDefinition: {
      old: "「鰹節粉」は、かつお節を燻製した粉末調味料です。",
      value: "「鰹節粉」は、鰹節を細かく粉末にした調味料です。",
    },
    chineseDefinition: {
      old: "以柴魚乾燻製後磨成的調味粉。",
      value: "將柴魚乾磨成細粉的調味料。",
    },
    examples: [
      dailySeasoningExample(
        "bonito powder",
        "柴魚粉",
        "鰹節粉",
        "Sprinkle bonito powder on the okonomiyaki.",
        "在大阪燒上撒柴魚粉。",
        "お好み焼きに鰹節粉をかけます。",
      ),
    ],
  },
  {
    id: "bouillon-powder",
    examples: [
      dailySeasoningExample(
        "bouillon powder",
        "高湯粉",
        "ブイヨンパウダー",
        "Dissolve the bouillon powder in the soup.",
        "把高湯粉溶進湯裡。",
        "スープにブイヨンパウダーを溶かします。",
      ),
    ],
  },
  {
    id: "brown-sugar",
    examples: [
      dailySeasoningExample(
        "brown sugar",
        "紅糖",
        "ブラウンシュガー",
        "Stir brown sugar into the milk tea.",
        "在奶茶裡加入紅糖。",
        "ミルクティーにブラウンシュガーを入れます。",
      ),
    ],
  },
  {
    id: "cardamom",
    jaDefinition: {
      old: "カルダモンは、南アジアや中東の料理でよく見られる、さやと​​種子を含むスパイスです。",
      value:
        "「カルダモン」は、爽やかで甘い香りが特徴のスパイスで、南アジアや中東の料理によく使われます。",
    },
    examples: [
      dailySeasoningExample(
        "cardamom",
        "豆蔻",
        "カルダモン",
        "Add cardamom to the chai.",
        "在印度奶茶裡加入豆蔻。",
        "チャイにカルダモンを加えます。",
      ),
    ],
  },
  {
    id: "chicken-bouillon-powder",
    oldJa: "鶏ガラスープの素",
    ja: "鶏ガラスープの素",
    oldJaReading: "にわとりガラスープのもと",
    jaReading: "とりガラスープのもと",
    jaDefinition: {
      old: "「鶏ガラスープの素」は鶏ガラを濃縮した粉末調味料です。",
      value: "「鶏ガラスープの素」は、鶏ガラのだしを濃縮して粉末にした調味料です。",
    },
    chineseDefinition: {
      old: "由濃縮雞高湯製成的調味粉。",
      value: "將雞骨高湯濃縮成粉末的調味料。",
    },
    examples: [
      dailySeasoningExample(
        "chicken bouillon powder",
        "雞粉",
        "鶏ガラスープの素",
        "Add chicken bouillon powder to the stir-fry.",
        "炒菜時加入雞粉。",
        "炒め物に鶏ガラスープの素を加えます。",
      ),
    ],
  },
  {
    id: "chili-bean-paste",
    examples: [
      dailySeasoningExample(
        "chili bean paste",
        "豆瓣醬",
        "豆板醤",
        "Use chili bean paste in mapo tofu.",
        "麻婆豆腐要用豆瓣醬。",
        "麻婆豆腐に豆板醤を使います。",
      ),
    ],
  },
  {
    id: "chili-oil",
    examples: [
      dailySeasoningExample(
        "chili oil",
        "辣椒油",
        "ラー油",
        "Add chili oil to the dumpling sauce.",
        "在水餃沾醬裡加入辣椒油。",
        "餃子のたれにラー油を入れます。",
      ),
    ],
  },
  {
    id: "cloves",
    examples: [
      dailySeasoningExample(
        "cloves",
        "丁香",
        "クローブ",
        "Add one clove to the curry.",
        "在咖哩裡放一顆丁香。",
        "カレーにクローブを一粒入れます。",
      ),
    ],
  },
  {
    id: "cooking-wine",
    jaDefinition: {
      old: "「料理酒」は料理に風味を加えるために使用されるワインで、多くの場合塩を加えて作られます。",
      value:
        "「料理酒」は、料理の臭みを抑え、風味やうま味を加えるために使う酒です。商品によっては塩分を含みます。",
    },
    chineseDefinition: {
      old: "用於烹飪以增添風味的酒，常加鹽製成。",
      value: "用於去腥並增添風味或鮮味的料理用酒，有些產品含鹽。",
    },
  },
  {
    id: "coriander-seeds",
    examples: [
      dailySeasoningExample(
        "coriander seeds",
        "香菜籽",
        "コリアンダーシード",
        "Crush the coriander seeds before adding them to the curry.",
        "把香菜籽壓碎後加入咖哩。",
        "コリアンダーシードを砕いてカレーに加えます。",
      ),
    ],
  },
  {
    id: "cumin-powder",
    examples: [
      dailySeasoningExample(
        "cumin powder",
        "孜然粉",
        "クミンパウダー",
        "Add cumin powder to the curry.",
        "在咖哩裡加入孜然粉。",
        "カレーにクミンパウダーを加えます。",
      ),
    ],
  },
  {
    id: "curry-roux",
    jaDefinition: {
      old: "「カレールー」は、カレースパイス、小麦粉、油脂を塊にしてカレーソースをとろみ付けた調味料です。",
      value:
        "「カレールー」は、カレースパイス、小麦粉、油脂などを固めた、カレーに味ととろみを付ける調味料です。",
    },
    chineseDefinition: {
      old: "以咖哩香料、麵粉與油脂壓製成塊的調味物，用以為咖哩醬增稠。",
      value: "以咖哩香料、麵粉與油脂等固化成塊，為咖哩增加味道與濃稠度的調味料。",
    },
    examples: [
      dailySeasoningExample(
        "curry roux",
        "咖哩塊",
        "カレールー",
        "Add the curry roux to the pot and let it melt.",
        "把咖哩塊放進鍋裡煮化。",
        "鍋にカレールーを入れて溶かします。",
      ),
    ],
  },
  {
    id: "dark-brown-sugar",
    examples: [
      dailySeasoningExample(
        "dark brown sugar",
        "黑糖",
        "黒糖",
        "Stir dark brown sugar into the coffee.",
        "在咖啡裡加入黑糖。",
        "コーヒーに黒糖を入れます。",
      ),
    ],
  },
  {
    id: "fennel-seeds",
    examples: [
      dailySeasoningExample(
        "fennel seeds",
        "小茴香",
        "フェンネルシード",
        "Mix fennel seeds into the bread dough.",
        "把小茴香拌進麵包麵糰。",
        "パン生地にフェンネルシードを混ぜます。",
      ),
    ],
  },
  {
    id: "fish-sauce",
    jaDefinition: {
      old: "「ナンプラー」は、魚を発酵させて作るスパイシーで塩辛いソースで、東南アジア料理によく見られます。",
      value:
        "「ナンプラー」は、魚を塩漬けにして発酵させた、塩味とうま味、独特の香りがある調味料です。",
    },
    chineseDefinition: {
      old: "由發酵魚製成的辛鹹醬料，常見於東南亞料理。",
      value: "以魚鹽漬發酵製成，具有鹹味、鮮味和獨特香氣的調味料。",
    },
  },
  {
    id: "flour",
    jaDefinition: {
      old: "小麦粉は穀物を挽いて作られた細かい白い粉末で、パンや料理に使用されます。",
      value: "「小麦粉」は、小麦を挽いて作る粉で、パンやお菓子、料理に使われます。",
    },
    chineseDefinition: {
      old: "由穀物研磨而成的細白粉末，用於烘焙與烹飪。",
      value: "由小麥研磨而成的粉末，用於做麵包、點心和各種料理。",
    },
    examples: [
      dailySeasoningExample(
        "flour",
        "麵粉",
        "小麦粉",
        "I use flour to make bread.",
        "我用麵粉做麵包。",
        "小麦粉でパンを作ります。",
      ),
    ],
  },
  {
    id: "honey",
    jaDefinition: {
      old: "「蜂蜜」はミツバチが花蜜から醸造する甘くてねばねばした物質です。",
      value: "「蜂蜜」は、ミツバチが集めた花の蜜から作る、甘くとろみのある食品です。",
    },
    chineseDefinition: {
      old: "蜜蜂以花蜜釀製而成的甜膩黏稠物質。",
      value: "蜜蜂採集花蜜後製成的香甜濃稠食品。",
    },
    examples: [
      dailySeasoningExample(
        "honey",
        "蜂蜜",
        "蜂蜜",
        "Drizzle honey over the yogurt.",
        "在優格上淋蜂蜜。",
        "ヨーグルトに蜂蜜をかけます。",
      ),
    ],
  },
  {
    id: "kombu-powder",
    examples: [
      dailySeasoningExample(
        "kombu powder",
        "昆布粉",
        "昆布パウダー",
        "Add a little kombu powder to the miso soup.",
        "在味噌湯裡加一點昆布粉。",
        "味噌汁に昆布パウダーを少し入れます。",
      ),
    ],
  },
  {
    id: "mayonnaise",
    jaDefinition: {
      old: "「マヨネーズ」は、卵黄、油、酢から作られた濃厚なミルキーソースです。",
      value:
        "「マヨネーズ」は、卵黄、油、酢などを混ぜて作る、濃厚でクリーミーな調味料です。",
    },
    chineseDefinition: {
      old: "由蛋黃、油與醋打發成的濃稠乳狀醬料。",
      value: "由蛋黃、油和醋等混合製成的濃郁滑順調味醬。",
    },
  },
  {
    id: "mirin",
    jaDefinition: {
      old: "「みりん」は日本料理に使用される甘酒です。",
      value: "「みりん」は、もち米、米こうじ、焼酎などから作る、甘みのある酒類調味料です。",
    },
    chineseDefinition: {
      old: "日本料理中使用的甜味米酒。",
      value: "由糯米、米麴和燒酎等製成，帶有甜味的酒類調味料。",
    },
    examples: [
      dailySeasoningExample(
        "mirin",
        "味醂",
        "みりん",
        "Add mirin to the simmered dish.",
        "在燉煮料理裡加入味醂。",
        "煮物にみりんを加えます。",
      ),
    ],
  },
  {
    id: "miso",
    examples: [
      dailySeasoningExample(
        "miso",
        "味噌",
        "味噌",
        "Dissolve the miso to make miso soup.",
        "把味噌化開來煮味噌湯。",
        "味噌を溶いて味噌汁を作ります。",
      ),
    ],
  },
  {
    id: "oregano",
    examples: [
      dailySeasoningExample(
        "oregano",
        "奧勒岡",
        "オレガノ",
        "Sprinkle oregano on the pizza.",
        "在披薩上撒奧勒岡。",
        "ピザにオレガノをふりかけます。",
      ),
    ],
  },
  {
    id: "parsley",
    examples: [
      dailySeasoningExample(
        "parsley",
        "巴西里",
        "パセリ",
        "Sprinkle parsley over the soup.",
        "在湯上撒巴西里。",
        "スープにパセリを散らします。",
      ),
    ],
  },
  {
    id: "peanut-butter",
    examples: [
      dailySeasoningExample(
        "peanut butter",
        "花生醬",
        "ピーナッツバター",
        "Spread peanut butter on the toast.",
        "在吐司上抹花生醬。",
        "トーストにピーナッツバターを塗ります。",
      ),
    ],
  },
  {
    id: "potato-starch",
    examples: [
      dailySeasoningExample(
        "potato starch",
        "太白粉",
        "片栗粉",
        "Thicken the sauce with potato starch.",
        "用太白粉把醬汁勾芡。",
        "片栗粉であんにとろみをつけます。",
      ),
    ],
  },
  {
    id: "rice-vinegar",
    examples: [
      {
        sortOrder: 1,
        oldEn: "Rice vinegar is milder than white vinegar.",
        en: "Rice vinegar is milder than grain vinegar.",
        oldZh: "米醋比白醋來得溫和。",
        zh: "米醋比穀物醋溫和。",
        oldJa: "米酢は穀物酢よりまろやかです。",
        ja: "米酢は穀物酢よりまろやかです。",
      },
    ],
  },
  {
    id: "rice-wine",
    oldJa: "料理酒（米酒）",
    ja: "台湾米酒",
    oldJaReading: "りょうりしゅ（べいしゅ）",
    jaReading: "たいわんミーチュウ",
    jaDefinition: {
      old: "「料理酒（米酒）」はお米を発酵させて作られたお酒で、料理にも使えます。",
      value:
        "「台湾米酒」は、米を原料にして造る台湾の酒で、三杯鶏や麻油鶏などの料理によく使われます。",
    },
    chineseDefinition: {
      old: "由米發酵釀成的酒精飲料，也可用於烹飪。",
      value: "以米為原料釀製或蒸餾而成的台灣酒類，常用於三杯雞、麻油雞等料理。",
    },
    examples: [
      dailySeasoningExample(
        "rice wine",
        "米酒",
        "料理酒",
        "Add Taiwanese rice wine to three cup chicken.",
        "三杯雞裡要加入米酒。",
        "三杯鶏に台湾米酒を加えます。",
      ),
    ],
  },
  {
    id: "rock-sugar",
    examples: [
      dailySeasoningExample(
        "rock sugar",
        "冰糖",
        "氷砂糖",
        "Add one piece of rock sugar to the tea.",
        "在茶裡放一顆冰糖。",
        "お茶に氷砂糖を一つ入れます。",
      ),
    ],
  },
  {
    id: "sake",
    examples: [
      dailySeasoningExample(
        "sake",
        "清酒",
        "日本酒",
        "Add sake when simmering the fish.",
        "煮魚時加入清酒。",
        "魚を煮るときに日本酒を加えます。",
      ),
    ],
  },
  {
    id: "sesame-paste",
    examples: [
      dailySeasoningExample(
        "sesame paste",
        "芝麻醬",
        "ごまペースト",
        "Use sesame paste to make the dressing.",
        "用芝麻醬做拌醬。",
        "ごまペーストで和え物のたれを作ります。",
      ),
    ],
  },
  {
    id: "shacha-sauce",
    examples: [
      dailySeasoningExample(
        "shacha sauce",
        "沙茶醬",
        "沙茶醤",
        "Add shacha sauce to the hot pot dipping sauce.",
        "在火鍋沾醬裡加入沙茶醬。",
        "火鍋のつけだれに沙茶醤を加えます。",
      ),
    ],
  },
  {
    id: "shichimi",
    jaDefinition: {
      old: "「七味唐辛子」は7種類の香辛料を配合した和の総合スパイスパウダーです。パスタやご飯にふりかけることが多いです。",
      value:
        "「七味唐辛子」は、唐辛子や山椒、ごまなどを混ぜた日本の香辛料で、うどん、そば、焼き鳥、汁物、鍋物などに振りかけて使います。",
    },
    chineseDefinition: {
      old: "由七種香料混合而成的日本綜合辛香粉，常撒在麵食或飯上。",
      value: "由辣椒、山椒、芝麻等混合而成的日本辛香料，常撒在烏龍麵、蕎麥麵、烤雞串、湯品或鍋物上。",
    },
    examples: [
      dailySeasoningExample(
        "shichimi",
        "七味粉",
        "七味唐辛子",
        "Sprinkle shichimi over the udon.",
        "在烏龍麵上撒七味粉。",
        "うどんに七味唐辛子をふりかけます。",
      ),
    ],
  },
  {
    id: "sichuan-peppercorn",
    jaDefinition: {
      old: "「花椒」は、食べるとピリピリとした刺激を感じる小さなドライフルーツです。",
      value:
        "「花椒」は、乾燥させた果皮を香辛料として使い、舌がしびれるような刺激と爽やかな香りがあります。",
    },
    chineseDefinition: {
      old: "乾燥的小型果實，入口時會帶來酥麻刺激的感受。",
      value: "將乾燥果皮作為辛香料使用，帶有使舌頭發麻的刺激與清爽香氣。",
    },
    examples: [
      dailySeasoningExample(
        "Sichuan peppercorn",
        "花椒",
        "花椒",
        "Add Sichuan peppercorns to the mapo tofu.",
        "在麻婆豆腐裡加入花椒。",
        "麻婆豆腐に花椒を加えます。",
      ),
    ],
  },
  {
    id: "star-anise",
    examples: [
      dailySeasoningExample(
        "star anise",
        "八角",
        "八角",
        "Add one star anise to the braised pork.",
        "在滷肉裡放一顆八角。",
        "豚の角煮に八角を一つ入れます。",
      ),
    ],
  },
  {
    id: "sweet-chili-sauce",
    examples: [
      dailySeasoningExample(
        "sweet chili sauce",
        "甜辣醬",
        "スイートチリソース",
        "Dip the spring rolls in sweet chili sauce.",
        "把春捲沾甜辣醬吃。",
        "生春巻きをスイートチリソースにつけます。",
      ),
    ],
  },
  {
    id: "thick-soy-sauce",
    oldJa: "醤油膏",
    ja: "台湾とろみ醤油",
    oldJaReading: "しょうゆあぶら",
    jaReading: "たいわんとろみしょうゆ",
    jaDefinition: {
      old: "「醤油膏」は、台湾料理でよく使われる濃厚でほんのり甘い醤油です。",
      value:
        "「台湾とろみ醤油」は、台湾でよく使われる、とろみと甘みのある醤油です。現地では醤油膏（ジャンヨウガオ）と呼ばれます。",
    },
    examples: [
      dailySeasoningExample(
        "thick soy sauce",
        "醬油膏",
        "醤油膏",
        "Drizzle Taiwanese thick soy sauce over the turnip cake.",
        "在蘿蔔糕上淋醬油膏。",
        "大根餅に台湾とろみ醤油をかけます。",
      ),
    ],
  },
  {
    id: "turmeric-powder",
    examples: [
      dailySeasoningExample(
        "turmeric powder",
        "薑黃粉",
        "ターメリックパウダー",
        "Add turmeric powder to the curry.",
        "在咖哩裡加入薑黃粉。",
        "カレーにターメリックパウダーを加えます。",
      ),
    ],
  },
  {
    id: "vanilla-extract",
    examples: [
      dailySeasoningExample(
        "vanilla extract",
        "香草精",
        "バニラエッセンス",
        "Add vanilla extract to the cake batter.",
        "在蛋糕麵糊裡加入香草精。",
        "ケーキの生地にバニラエッセンスを加えます。",
      ),
    ],
  },
  {
    id: "vegetable-oil",
    examples: [
      dailySeasoningExample(
        "vegetable oil",
        "植物油",
        "植物油",
        "Coat the pan with vegetable oil.",
        "在平底鍋裡抹上植物油。",
        "フライパンに植物油をひきます。",
      ),
    ],
  },
  {
    id: "wasabi",
    examples: [
      dailySeasoningExample(
        "wasabi",
        "山葵",
        "わさび",
        "Eat the sashimi with wasabi.",
        "生魚片沾山葵吃。",
        "刺身にわさびをつけて食べます。",
      ),
    ],
  },
  {
    id: "white-sugar",
    examples: [
      dailySeasoningExample(
        "white sugar",
        "白糖",
        "白砂糖",
        "Stir a teaspoon of white sugar into the coffee.",
        "在咖啡裡加入一茶匙白糖。",
        "コーヒーに白砂糖を小さじ一杯入れます。",
      ),
    ],
  },
  {
    id: "yellow-mustard",
    examples: [
      dailySeasoningExample(
        "yellow mustard",
        "黃芥末",
        "イエローマスタード",
        "Squeeze yellow mustard onto the hot dog.",
        "在熱狗上擠黃芥末。",
        "ホットドッグにイエローマスタードをかけます。",
      ),
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
        en: "Use dark soy sauce to give the braised pork a deeper color.",
        oldZh: "在這道菜裡加一些老抽。",
        zh: "用老抽替滷肉上色。",
        oldJa: "この料理に濃口醤油を少し加えます。",
        previousJa: "老抽を少し加えて、料理に色とコクをつけます。",
        ja: "老抽を加えて、煮込み料理に色とコクをつけます。",
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
        en: "Use light soy sauce to season the stir-fry.",
        oldZh: "在這道菜裡加一些生抽。",
        zh: "炒菜時用生抽調味。",
        oldJa: "この料理に薄口醤油を少し加えます。",
        previousJa: "生抽を少し加えて、料理に味をつけます。",
        ja: "生抽で炒め物に味をつけます。",
      },
    ],
  },
  {
    id: "white-vinegar",
    oldJa: "穀物酢",
    ja: "ホワイトビネガー",
    oldJaReading: "こくもつず",
    jaReading: "ホワイトビネガー",
    examples: [
      dailySeasoningExample(
        "white vinegar",
        "白醋",
        "ホワイトビネガー",
        "Use white vinegar for the pickles.",
        "醃漬物要用白醋。",
        "ピクルスにホワイトビネガーを使います。",
      ),
    ],
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
        previousEn: "Add some cinnamon sticks to the dish.",
        en: "Put a cinnamon stick in the tea.",
        oldZh: "在這道菜裡加一些桂皮。",
        previousZh: "在這道菜裡加一些肉桂棒。",
        zh: "在茶裡放一根肉桂棒。",
        oldJa: "この料理にシナモンスティックを少し加えます。",
        ja: "紅茶にシナモンスティックを入れます。",
      },
    ],
  },
  {
    id: "cornstarch",
    oldZh: "玉米粉",
    zh: "玉米澱粉",
    jaDefinition: {
      old: "「コーンスターチ」はトウモロコシから作られる細か​​い白い粉末で、グレービーソースを濃くするために使用されます。",
      value:
        "「コーンスターチ」は、トウモロコシのでんぷんから作る細かい白い粉で、料理にとろみをつけるために使います。",
    },
    examples: [
      {
        sortOrder: 0,
        oldEn: "Add some cornstarch to the dish.",
        en: "Thicken the soup with cornstarch.",
        oldZh: "在這道菜裡加一些玉米粉。",
        previousZh: "在這道菜裡加一些玉米澱粉。",
        zh: "用玉米澱粉把湯勾芡。",
        oldJa: "この料理にコーンスターチを少し加えます。",
        ja: "コーンスターチでスープにとろみをつけます。",
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
            AND sentence IN (
              ${example.oldEn},
              ${example.previousEn ?? example.oldEn},
              ${example.en}
            )
          RETURNING id
        `;
        if (exampleRows.length === 0) continue;
        const exampleId = exampleRows[0].id;
        await tx`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES (${exampleId}, 'zh', ${example.zh})
          ON CONFLICT (example_id, language) DO UPDATE SET
            translation = EXCLUDED.translation
          WHERE word_example_translations.translation IN (
            ${example.oldZh},
            ${example.previousZh ?? example.oldZh},
            ${example.zh}
          )
        `;

        if (example.ja) {
          await tx`
            INSERT INTO word_example_translations (example_id, language, translation)
            VALUES (${exampleId}, 'ja', ${example.ja})
            ON CONFLICT (example_id, language) DO UPDATE SET
              translation = EXCLUDED.translation
            WHERE word_example_translations.translation IN (
              ${example.oldJa ?? example.ja},
              ${example.previousJa ?? example.oldJa ?? example.ja},
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
