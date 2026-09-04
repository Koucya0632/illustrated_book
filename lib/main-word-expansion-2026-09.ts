import type { CEFRLevel, Definition } from "@/types";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type ExpansionExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

type ExpansionEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: string;
  partOfSpeech: "noun";
  pronunciation: string;
  definitions: Definition[];
  examples: [ExpansionExample, ExpansionExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

function definitions(zh: string, en: string, ja: string): Definition[] {
  return [
    { language: "zh", definition: zh, sortOrder: 0 },
    { language: "en", definition: en, sortOrder: 0 },
    { language: "ja", definition: ja, sortOrder: 0 },
  ];
}

const EXPANSION_ENTRIES: ExpansionEntry[] = [
  {
    id: "dish-rack",
    word: "dish rack",
    chinese: "瀝水架",
    chineseDefinition: "用來放置洗好餐具、讓水分瀝乾並晾乾的架子。",
    category: "kitchen",
    partOfSpeech: "noun",
    pronunciation: "/ˈdɪʃ ˌræk/",
    definitions: definitions(
      "瀝水架",
      "A rack that holds washed dishes while water drains and the dishes dry.",
      "「水切りかご」とは、洗った食器の水を切り、乾かすために置くかごです。",
    ),
    examples: [
      { en: "Put the clean plates on the dish rack.", ja: "洗ったお皿は水切りかごに置いてください。", zh: "把洗好的盤子放到瀝水架上。", cefrLevel: "A2" },
      { en: "After washing the dishes, leave them on the dish rack until they are completely dry.", ja: "食器を洗ったら、完全に乾くまで水切りかごに置いておきます。", zh: "洗完碗盤後，把它們放在瀝水架上直到完全乾燥。", cefrLevel: "B1" },
    ],
    relatedWords: ["sink", "plate", "dish-towel"],
    ja: "水切りかご",
    jaReading: "みずきりかご",
    jaReadingSegments: [{ text: "水切り", ruby: "みずきり" }, { text: "かご", ruby: null }],
  },
  {
    id: "oven-mitt",
    word: "oven mitt",
    chinese: "隔熱手套",
    chineseDefinition: "拿取烤箱中高溫器皿時，用來保護手部的厚手套。",
    category: "kitchen",
    partOfSpeech: "noun",
    pronunciation: "/ˈʌv.ən ˌmɪt/",
    definitions: definitions(
      "隔熱手套",
      "A thick protective glove used to handle hot cookware and oven trays.",
      "「オーブンミトン」とは、熱い天板や調理器具を持つときに手を守る厚手の手袋です。",
    ),
    examples: [
      { en: "Use an oven mitt to take out the hot tray.", ja: "熱い天板を取り出すときは、オーブンミトンを使ってください。", zh: "取出熱烤盤時要戴隔熱手套。", cefrLevel: "A2" },
      { en: "Because the baking tray is still hot, put on an oven mitt before you touch it.", ja: "天板はまだ熱いので、触る前にオーブンミトンをはめてください。", zh: "烤盤還很燙，所以碰之前請先戴上隔熱手套。", cefrLevel: "B1" },
    ],
    relatedWords: ["oven", "baking-tray", "pot-holder"],
    ja: "オーブンミトン",
    jaReading: "オーブンミトン",
    jaReadingSegments: null,
  },
  {
    id: "kitchen-timer",
    word: "kitchen timer",
    chinese: "廚房計時器",
    chineseDefinition: "用來計算烹調時間，並在設定時間到時發出提醒的計時工具。",
    category: "kitchen",
    partOfSpeech: "noun",
    pronunciation: "/ˈkɪtʃ.ən ˌtaɪ.mɚ/",
    definitions: definitions(
      "廚房計時器",
      "A timer used to measure cooking time and signal when the set time ends.",
      "「キッチンタイマー」とは、調理時間を計り、設定した時間を音で知らせる道具です。",
    ),
    examples: [
      { en: "Set the kitchen timer for ten minutes.", ja: "キッチンタイマーを10分にセットしてください。", zh: "把廚房計時器設定為十分鐘。", cefrLevel: "A2" },
      { en: "While the eggs are boiling, I use the kitchen timer so I do not forget to turn off the heat.", ja: "卵をゆでている間、火を止め忘れないようにキッチンタイマーを使います。", zh: "煮蛋時我會使用廚房計時器，以免忘記關火。", cefrLevel: "B1" },
    ],
    relatedWords: ["clock", "oven", "stove"],
    ja: "キッチンタイマー",
    jaReading: "キッチンタイマー",
    jaReadingSegments: null,
  },
  {
    id: "bath-stool",
    word: "bath stool",
    chinese: "浴室凳",
    chineseDefinition: "在浴室清洗身體時坐的矮凳，通常可排水且容易清洗。",
    category: "bathroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈbæθ ˌstuːl/",
    definitions: definitions(
      "浴室凳",
      "A low water-resistant stool used while washing the body in a bathroom.",
      "「風呂いす」とは、浴室で体を洗うときに座る、水に強い低いいすです。",
    ),
    examples: [
      { en: "Sit on the bath stool while you wash.", ja: "体を洗うときは風呂いすに座ります。", zh: "洗澡時坐在浴室凳上。", cefrLevel: "A2" },
      { en: "After using the bath stool, rinse it and stand it up so the bottom can dry.", ja: "風呂いすを使ったら、洗い流して立て、裏側まで乾かします。", zh: "浴室凳用完後沖乾淨並立起來，讓底部也能乾燥。", cefrLevel: "B1" },
    ],
    relatedWords: ["shower", "bathtub", "bucket"],
    ja: "風呂いす",
    jaReading: "ふろいす",
    jaReadingSegments: [{ text: "風呂", ruby: "ふろ" }, { text: "いす", ruby: null }],
  },
  {
    id: "bathtub-cover",
    word: "bathtub cover",
    chinese: "浴缸蓋",
    chineseDefinition: "蓋在裝有熱水的浴缸上，用來減少散熱與保持水溫的蓋子。",
    category: "bathroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈbæθ.tʌb ˌkʌv.ɚ/",
    definitions: definitions(
      "浴缸蓋",
      "A cover placed over a filled bathtub to help keep the water warm.",
      "「風呂ふた」とは、お湯を張った浴槽にかぶせて、湯温が下がりにくくするふたです。",
    ),
    examples: [
      { en: "Put the bathtub cover on after filling the tub.", ja: "お湯を張ったら、風呂ふたを閉めてください。", zh: "浴缸放好熱水後，請蓋上浴缸蓋。", cefrLevel: "A2" },
      { en: "Close the bathtub cover while the water is hot so the bath does not cool down quickly.", ja: "お湯が熱いうちに風呂ふたを閉めると、お湯が冷めにくくなります。", zh: "趁水還熱時蓋上浴缸蓋，洗澡水就不容易很快變涼。", cefrLevel: "B1" },
    ],
    relatedWords: ["bathtub", "bath-mat", "shower"],
    ja: "風呂ふた",
    jaReading: "ふろふた",
    jaReadingSegments: [{ text: "風呂", ruby: "ふろ" }, { text: "ふた", ruby: null }],
  },
  {
    id: "toothbrush-holder",
    word: "toothbrush holder",
    chinese: "牙刷架",
    chineseDefinition: "用來直立收納牙刷並保持刷頭通風乾燥的小型容器或架子。",
    category: "bathroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈtuːθ.brʌʃ ˌhoʊl.dɚ/",
    definitions: definitions(
      "牙刷架",
      "A small stand or container that stores toothbrushes upright so they can dry.",
      "「歯ブラシスタンド」とは、歯ブラシを立てて収納し、乾かしやすくする小さな容器です。",
    ),
    examples: [
      { en: "Put your toothbrush back in the toothbrush holder.", ja: "歯磨きのあと、歯ブラシを歯ブラシスタンドに戻します。", zh: "刷牙後，把牙刷放回牙刷架。", cefrLevel: "A2" },
      { en: "To keep it clean, rinse the toothbrush holder before putting the toothbrushes back.", ja: "清潔に保つため、歯ブラシを戻す前に歯ブラシスタンドを洗います。", zh: "為了保持清潔，放回牙刷前先沖洗牙刷架。", cefrLevel: "B1" },
    ],
    relatedWords: ["toothbrush", "toothpaste", "sink"],
    ja: "歯ブラシスタンド",
    jaReading: "はブラシスタンド",
    jaReadingSegments: [{ text: "歯", ruby: "は" }, { text: "ブラシスタンド", ruby: null }],
  },
  {
    id: "futon",
    word: "futon",
    chinese: "日式床褥",
    chineseDefinition: "可直接鋪在榻榻米或地板上睡眠，白天能折疊收起的日式寢具。",
    category: "bedroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈfuː.tɑːn/",
    definitions: definitions(
      "日式床褥",
      "Traditional Japanese bedding that is spread on the floor for sleeping and folded away afterward.",
      "「布団」とは、床や畳に敷いて寝て、使わないときは折りたたんで収納できる寝具です。",
    ),
    examples: [
      { en: "I spread out the futon before bed.", ja: "寝る前に布団を敷きます。", zh: "我睡前會鋪好日式床褥。", cefrLevel: "A2" },
      { en: "When the weather is sunny, I air the futon on the balcony so it stays dry.", ja: "天気のいい日は、湿気がこもらないようにベランダで布団を干します。", zh: "天氣晴朗時，我把日式床褥曬在陽台上，避免受潮。", cefrLevel: "B1" },
    ],
    relatedWords: ["pillow", "blanket", "bed-sheet"],
    ja: "布団",
    jaReading: "ふとん",
    jaReadingSegments: [{ text: "布団", ruby: "ふとん" }],
  },
  {
    id: "full-length-mirror",
    word: "full-length mirror",
    chinese: "全身鏡",
    chineseDefinition: "高度足以照見全身，常用來確認整體穿著的鏡子。",
    category: "bedroom",
    partOfSpeech: "noun",
    pronunciation: "/ˌfʊl.leŋθ ˈmɪr.ɚ/",
    definitions: definitions(
      "全身鏡",
      "A tall mirror that lets a person see their whole body and outfit.",
      "「姿見」とは、頭から足元まで全身を映して、服装を確認できる縦長の鏡です。",
    ),
    examples: [
      { en: "I check my outfit in the full-length mirror.", ja: "姿見で服装を確認します。", zh: "我用全身鏡檢查穿著。", cefrLevel: "A2" },
      { en: "Before leaving home, I use the full-length mirror to make sure my coat is not wrinkled.", ja: "外出前に、コートにしわがないか姿見で確認します。", zh: "出門前，我用全身鏡確認外套有沒有皺。", cefrLevel: "B1" },
    ],
    relatedWords: ["mirror", "closet", "dresser"],
    ja: "姿見",
    jaReading: "すがたみ",
    jaReadingSegments: [{ text: "姿見", ruby: "すがたみ" }],
  },
  {
    id: "clothes-rack",
    word: "clothes rack",
    chinese: "衣物掛架",
    chineseDefinition: "設有橫桿，可用衣架懸掛外套與其他衣物的獨立式架子。",
    category: "bedroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈkloʊðz ˌræk/",
    definitions: definitions(
      "衣物掛架",
      "A freestanding rack with a horizontal bar for hanging clothes on hangers.",
      "「ハンガーラック」とは、ハンガーに掛けた服を横棒につるして収納する独立式の棚です。",
    ),
    examples: [
      { en: "Hang your jacket on the clothes rack.", ja: "上着をハンガーラックに掛けてください。", zh: "把外套掛在衣物掛架上。", cefrLevel: "A2" },
      { en: "Because the closet is full, I keep the clothes I wear often on a clothes rack.", ja: "クローゼットがいっぱいなので、よく着る服はハンガーラックに掛けています。", zh: "因為衣櫃滿了，我把常穿的衣服掛在衣物掛架上。", cefrLevel: "B1" },
    ],
    relatedWords: ["hanger", "closet", "clothes"],
    ja: "ハンガーラック",
    jaReading: "ハンガーラック",
    jaReadingSegments: null,
  },
  {
    id: "kotatsu",
    word: "kotatsu",
    chinese: "暖桌",
    chineseDefinition: "桌下裝有加熱器並覆蓋厚被，可把腿伸入取暖的日式矮桌。",
    category: "living-room",
    partOfSpeech: "noun",
    pronunciation: "/kəˈtɑːt.suː/",
    definitions: definitions(
      "暖桌",
      "A low Japanese table with a heater underneath and a quilt that traps the warmth.",
      "「こたつ」とは、天板の下に暖房器具があり、布団を掛けて足元を温める日本の低い机です。",
    ),
    examples: [
      { en: "We warm our legs under the kotatsu.", ja: "こたつに入って足を温めます。", zh: "我們把腳伸進暖桌取暖。", cefrLevel: "A2" },
      { en: "When winter comes, we set up the kotatsu in the living room and gather around it after dinner.", ja: "冬になると、リビングにこたつを出して、夕食後に家族で囲みます。", zh: "冬天一到，我們就在客廳擺出暖桌，晚餐後全家圍坐在一起。", cefrLevel: "B1" },
    ],
    relatedWords: ["low-table", "heater", "blanket"],
    ja: "こたつ",
    jaReading: "こたつ",
    jaReadingSegments: null,
  },
  {
    id: "floor-cushion",
    word: "floor cushion",
    chinese: "坐墊",
    chineseDefinition: "直接放在地板或榻榻米上，供人坐下時使用的厚墊子。",
    category: "living-room",
    partOfSpeech: "noun",
    pronunciation: "/ˈflɔːr ˌkʊʃ.ən/",
    definitions: definitions(
      "坐墊",
      "A thick cushion placed on the floor for a person to sit on.",
      "「座布団」とは、床や畳の上に置いて座るための厚いクッションです。",
    ),
    examples: [
      { en: "Please sit on this floor cushion.", ja: "この座布団に座ってください。", zh: "請坐在這個坐墊上。", cefrLevel: "A2" },
      { en: "When guests sit around the low table, I put out extra floor cushions for everyone.", ja: "お客さんが座卓を囲むときは、人数分の座布団を用意します。", zh: "客人圍坐矮桌時，我會準備足夠每人一個的坐墊。", cefrLevel: "B1" },
    ],
    relatedWords: ["cushion", "low-table", "rug"],
    ja: "座布団",
    jaReading: "ざぶとん",
    jaReadingSegments: [{ text: "座布団", ruby: "ざぶとん" }],
  },
  {
    id: "tissue-box",
    word: "tissue box",
    chinese: "面紙盒",
    chineseDefinition: "裝著可從上方開口逐張抽取的面紙的盒子。",
    category: "living-room",
    partOfSpeech: "noun",
    pronunciation: "/ˈtɪʃ.uː ˌbɑːks/",
    definitions: definitions(
      "面紙盒",
      "A box that holds facial tissues so they can be pulled out one at a time.",
      "「ティッシュボックス」とは、上の取り出し口から紙を一枚ずつ引き出せる箱です。",
    ),
    examples: [
      { en: "The tissue box is next to the sofa.", ja: "ティッシュボックスはソファの横にあります。", zh: "面紙盒在沙發旁邊。", cefrLevel: "A2" },
      { en: "I keep a tissue box on the coffee table so anyone can reach it easily.", ja: "誰でもすぐ取れるように、コーヒーテーブルにティッシュボックスを置いています。", zh: "我把面紙盒放在茶几上，讓大家都能輕鬆拿到。", cefrLevel: "B1" },
    ],
    relatedWords: ["coffee-table", "sofa", "trash-can"],
    ja: "ティッシュボックス",
    jaReading: "ティッシュボックス",
    jaReadingSegments: null,
  },
  {
    id: "correction-tape",
    word: "correction tape",
    chinese: "修正帶",
    chineseDefinition: "把白色不透明帶覆在錯字上，便於立即重新書寫的文具。",
    category: "office",
    partOfSpeech: "noun",
    pronunciation: "/kəˈrek.ʃən ˌteɪp/",
    definitions: definitions(
      "修正帶",
      "Stationery that covers written mistakes with an opaque white strip.",
      "「修正テープ」とは、書き間違えた部分を白い帯で覆い、その上から書き直せる文房具です。",
    ),
    examples: [
      { en: "Use correction tape to cover the mistake.", ja: "間違えた文字を修正テープで消します。", zh: "用修正帶蓋掉錯字。", cefrLevel: "A2" },
      { en: "Because the form must stay neat, I used correction tape instead of crossing out the wrong number.", ja: "書類をきれいに仕上げるため、間違えた数字に線を引かず修正テープを使いました。", zh: "因為表格要保持整潔，我用修正帶蓋掉錯誤的數字，而沒有直接劃掉。", cefrLevel: "B1" },
    ],
    relatedWords: ["eraser", "pen", "tape"],
    ja: "修正テープ",
    jaReading: "しゅうせいテープ",
    jaReadingSegments: [{ text: "修正", ruby: "しゅうせい" }, { text: "テープ", ruby: null }],
  },
  {
    id: "hole-punch",
    word: "hole punch",
    chinese: "打孔機",
    chineseDefinition: "在紙張上打出規則圓孔，方便放入活頁夾歸檔的文具。",
    category: "office",
    partOfSpeech: "noun",
    pronunciation: "/ˈhoʊl ˌpʌntʃ/",
    definitions: definitions(
      "打孔機",
      "A tool that cuts round holes in paper so the pages can be filed in a binder.",
      "「穴あけパンチ」とは、紙に丸い穴を開けてファイルにとじられるようにする文房具です。",
    ),
    examples: [
      { en: "Punch two holes in this paper.", ja: "この紙に穴あけパンチで二つ穴を開けてください。", zh: "請用打孔機在這張紙上打兩個孔。", cefrLevel: "A2" },
      { en: "Before filing the handouts, line up the pages and use the hole punch on all of them.", ja: "資料をファイルする前に、紙をそろえて穴あけパンチで穴を開けます。", zh: "把講義歸檔前，先把紙張對齊，再全部用打孔機打孔。", cefrLevel: "B1" },
    ],
    relatedWords: ["stapler", "binder", "paper"],
    ja: "穴あけパンチ",
    jaReading: "あなあけパンチ",
    jaReadingSegments: [{ text: "穴", ruby: "あな" }, { text: "あけパンチ", ruby: null }],
  },
  {
    id: "desk-organizer",
    word: "desk organizer",
    chinese: "桌面收納盒",
    chineseDefinition: "分隔收納筆、便條紙與迴紋針等桌面小物的容器。",
    category: "office",
    partOfSpeech: "noun",
    pronunciation: "/ˈdesk ˌɔːr.ɡə.naɪ.zɚ/",
    definitions: definitions(
      "桌面收納盒",
      "A divided container that keeps pens and other small office supplies organized on a desk.",
      "「デスクオーガナイザー」とは、ペンや付箋などの小物を分けて机上に収納する容器です。",
    ),
    examples: [
      { en: "Keep the pens in the desk organizer.", ja: "ペンはデスクオーガナイザーに入れてください。", zh: "把筆放在桌面收納盒裡。", cefrLevel: "A2" },
      { en: "After I sorted the small office supplies into a desk organizer, it became easier to find what I needed.", ja: "小さな文房具をデスクオーガナイザーに分けたら、必要な物が見つけやすくなりました。", zh: "把小文具分類放進桌面收納盒後，要找需要的東西就更容易了。", cefrLevel: "B1" },
    ],
    relatedWords: ["pen-holder", "drawer", "paper-clip"],
    ja: "デスクオーガナイザー",
    jaReading: "デスクオーガナイザー",
    jaReadingSegments: null,
  },
  {
    id: "tactile-paving",
    word: "tactile paving",
    chinese: "導盲磚",
    chineseDefinition: "鋪在人行道或車站地面、以凸點和凸條引導視障者行走的地磚。",
    category: "street",
    partOfSpeech: "noun",
    pronunciation: "/ˈtæk.taɪl ˌpeɪ.vɪŋ/",
    definitions: definitions(
      "導盲磚",
      "Raised paving tiles that help visually impaired pedestrians follow routes and notice hazards.",
      "「点字ブロック」とは、視覚に障害のある人が進行方向や危険な場所を足裏などで確認できる突起付きの舗装です。",
    ),
    examples: [
      { en: "Do not leave your bicycle on the tactile paving.", ja: "点字ブロックの上に自転車を置かないでください。", zh: "不要把腳踏車停在導盲磚上。", cefrLevel: "A2" },
      { en: "At the station, follow the tactile paving until it reaches the ticket gate.", ja: "駅では、改札口まで点字ブロックに沿って進みます。", zh: "在車站裡，沿著導盲磚走到驗票閘門。", cefrLevel: "B1" },
    ],
    relatedWords: ["sidewalk", "crosswalk", "ticket-gate"],
    ja: "点字ブロック",
    jaReading: "てんじブロック",
    jaReadingSegments: [{ text: "点字", ruby: "てんじ" }, { text: "ブロック", ruby: null }],
  },
  {
    id: "guardrail",
    word: "guardrail",
    chinese: "護欄",
    chineseDefinition: "設在道路邊緣或車道與人行區之間，用來降低碰撞與墜落風險的欄杆。",
    category: "street",
    partOfSpeech: "noun",
    pronunciation: "/ˈɡɑːrd.reɪl/",
    definitions: definitions(
      "護欄",
      "A protective rail beside a road that helps separate traffic and prevent vehicles or people from leaving the safe area.",
      "「ガードレール」とは、車両の逸脱や衝突を防ぐために道路の端などに設ける防護柵です。",
    ),
    examples: [
      { en: "The guardrail separates the sidewalk from the road.", ja: "ガードレールが歩道と車道を分けています。", zh: "護欄把人行道和車道分開。", cefrLevel: "A2" },
      { en: "Because visibility is poor around the curve, a guardrail protects pedestrians along the outside edge.", ja: "見通しの悪いカーブなので、外側のガードレールが歩行者を守っています。", zh: "因為彎道視線不佳，外側的護欄保護著行人。", cefrLevel: "B1" },
    ],
    relatedWords: ["sidewalk", "road", "curb"],
    ja: "ガードレール",
    jaReading: "ガードレール",
    jaReadingSegments: null,
  },
  {
    id: "curb",
    word: "curb",
    chinese: "路緣石",
    chineseDefinition: "位於車道邊緣、把道路與人行道或路肩分隔開的凸起石材。",
    category: "street",
    partOfSpeech: "noun",
    pronunciation: "/kɝːb/",
    definitions: definitions(
      "路緣石",
      "A raised stone or concrete edge that separates a roadway from a sidewalk or roadside area.",
      "「縁石」とは、車道と歩道などの境界に設置して、両方を分ける石やコンクリートの部材です。",
    ),
    examples: [
      { en: "Be careful not to trip over the curb.", ja: "縁石につまずかないように気をつけてください。", zh: "小心不要被路緣石絆倒。", cefrLevel: "A2" },
      { en: "Where the curb is lowered, wheelchairs and strollers can cross the street more easily.", ja: "縁石が低くなっている所では、車いすやベビーカーが通りやすくなっています。", zh: "路緣石降低的地方，輪椅和嬰兒車更容易過馬路。", cefrLevel: "B1" },
    ],
    relatedWords: ["sidewalk", "road", "guardrail"],
    ja: "縁石",
    jaReading: "えんせき",
    jaReadingSegments: [{ text: "縁石", ruby: "えんせき" }],
  },
  {
    id: "bagging-counter",
    word: "bagging counter",
    chinese: "裝袋台",
    chineseDefinition: "設在超市收銀區後方，讓顧客把已結帳商品裝進購物袋的工作台。",
    category: "supermarket",
    partOfSpeech: "noun",
    pronunciation: "/ˈbæɡ.ɪŋ ˌkaʊn.tɚ/",
    definitions: definitions(
      "裝袋台",
      "A counter near a supermarket checkout where customers pack paid groceries into bags.",
      "「サッカー台」とは、スーパーで会計を済ませた商品を客が袋に詰めるための作業台です。",
    ),
    examples: [
      { en: "Put the groceries in your bag at the bagging counter.", ja: "買った物はサッカー台で袋に入れます。", zh: "在裝袋台把買好的東西裝進袋子。", cefrLevel: "A2" },
      { en: "After paying, I moved to the bagging counter and packed the cold items together.", ja: "会計後、サッカー台へ移動して、冷蔵品をまとめて袋に入れました。", zh: "結帳後，我移到裝袋台，把冷藏商品一起裝袋。", cefrLevel: "B1" },
    ],
    relatedWords: ["checkout-counter", "shopping-bag", "cashier"],
    ja: "サッカー台",
    jaReading: "サッカーだい",
    jaReadingSegments: [{ text: "サッカー", ruby: null }, { text: "台", ruby: "だい" }],
  },
  {
    id: "refrigerated-display-case",
    word: "refrigerated display case",
    chinese: "冷藏展示櫃",
    chineseDefinition: "在低溫下陳列牛奶、優格等冷藏商品，並讓顧客查看取用的展示櫃。",
    category: "supermarket",
    partOfSpeech: "noun",
    pronunciation: "/rɪˈfrɪdʒ.ə.reɪ.tɪd dɪˈspleɪ ˌkeɪs/",
    definitions: definitions(
      "冷藏展示櫃",
      "A chilled display cabinet that keeps refrigerated products visible and cold in a store.",
      "「冷蔵ショーケース」とは、牛乳やヨーグルトなどの商品を低温で保ちながら陳列する棚です。",
    ),
    examples: [
      { en: "The yogurt is in the refrigerated display case.", ja: "ヨーグルトは冷蔵ショーケースにあります。", zh: "優格在冷藏展示櫃裡。", cefrLevel: "A2" },
      { en: "After taking milk from the refrigerated display case, close the door so the temperature stays low.", ja: "冷蔵ショーケースから牛乳を取ったら、温度が上がらないように扉を閉めてください。", zh: "從冷藏展示櫃拿出牛奶後，請關上門，避免溫度升高。", cefrLevel: "B1" },
    ],
    relatedWords: ["dairy-section", "milk", "yogurt"],
    ja: "冷蔵ショーケース",
    jaReading: "れいぞうショーケース",
    jaReadingSegments: [{ text: "冷蔵", ruby: "れいぞう" }, { text: "ショーケース", ruby: null }],
  },
  {
    id: "coin-tray",
    word: "coin tray",
    chinese: "零錢盤",
    chineseDefinition: "收銀時供顧客與店員放置硬幣或紙鈔，以便確認與交付的淺盤。",
    category: "supermarket",
    partOfSpeech: "noun",
    pronunciation: "/ˈkɔɪn ˌtreɪ/",
    definitions: definitions(
      "零錢盤",
      "A shallow tray at a register where customers and cashiers place money during payment.",
      "「コイントレー」とは、会計時に客や店員が硬貨や紙幣を置いて受け渡すための浅い皿です。",
    ),
    examples: [
      { en: "Please place the coins on the coin tray.", ja: "硬貨はコイントレーに置いてください。", zh: "請把硬幣放在零錢盤上。", cefrLevel: "A2" },
      { en: "At the register, I put the exact change on the coin tray so the cashier could count it easily.", ja: "レジで店員が数えやすいように、ちょうどの小銭をコイントレーに置きました。", zh: "在收銀台，我把剛好的零錢放在零錢盤上，讓店員方便清點。", cefrLevel: "B1" },
    ],
    relatedWords: ["cashier", "checkout-counter", "coin"],
    ja: "コイントレー",
    jaReading: "コイントレー",
    jaReadingSegments: null,
  },
  {
    id: "kei-car",
    word: "kei car",
    chinese: "輕型汽車",
    chineseDefinition: "符合日本輕自動車規格、車身與引擎排氣量較小的汽車。",
    category: "transportation",
    partOfSpeech: "noun",
    pronunciation: "/ˈkeɪ ˌkɑːr/",
    definitions: definitions(
      "輕型汽車",
      "A small Japanese motor vehicle that meets the legal size and engine limits for the kei class.",
      "「軽自動車」とは、日本の規格で車体の大きさや排気量などが定められた小型の自動車です。",
    ),
    examples: [
      { en: "My neighbor drives a small kei car.", ja: "隣の人は小さな軽自動車に乗っています。", zh: "我的鄰居開一輛小型輕型汽車。", cefrLevel: "A2" },
      { en: "Because a kei car is easy to park on narrow streets, many people use one for local trips.", ja: "狭い道でも駐車しやすいので、近所への移動に軽自動車を使う人が多いです。", zh: "因為輕型汽車在狹窄街道也容易停車，很多人會開它在附近移動。", cefrLevel: "B1" },
    ],
    relatedWords: ["car", "parking-lot", "kei-truck"],
    ja: "軽自動車",
    jaReading: "けいじどうしゃ",
    jaReadingSegments: [{ text: "軽自動車", ruby: "けいじどうしゃ" }],
  },
  {
    id: "kei-truck",
    word: "kei truck",
    chinese: "輕型卡車",
    chineseDefinition: "符合日本輕自動車規格、帶有小型開放式貨台的輕便卡車。",
    category: "transportation",
    partOfSpeech: "noun",
    pronunciation: "/ˈkeɪ ˌtrʌk/",
    definitions: definitions(
      "輕型卡車",
      "A compact Japanese kei-class truck with a small cab and an open cargo bed.",
      "「軽トラック」とは、軽自動車の規格に入る、小さな運転席と荷台を備えたトラックです。",
    ),
    examples: [
      { en: "The farmer loaded boxes onto the kei truck.", ja: "農家の人が軽トラックに箱を積みました。", zh: "農夫把箱子裝上輕型卡車。", cefrLevel: "A2" },
      { en: "Because the road to the field is narrow, they use a kei truck to carry tools and vegetables.", ja: "畑までの道が狭いので、道具や野菜を運ぶのに軽トラックを使います。", zh: "因為通往田地的路很窄，他們用輕型卡車運送工具和蔬菜。", cefrLevel: "B1" },
    ],
    relatedWords: ["truck", "pickup-truck", "kei-car"],
    ja: "軽トラック",
    jaReading: "けいトラック",
    jaReadingSegments: [{ text: "軽", ruby: "けい" }, { text: "トラック", ruby: null }],
  },
  {
    id: "delivery-truck",
    word: "delivery truck",
    chinese: "送貨卡車",
    chineseDefinition: "設有封閉貨廂，用來把商品或包裹運送到商店與收件地點的卡車。",
    category: "transportation",
    partOfSpeech: "noun",
    pronunciation: "/dɪˈlɪv.ɚ.i ˌtrʌk/",
    definitions: definitions(
      "送貨卡車",
      "A truck used to transport goods or parcels to stores, homes, or other destinations.",
      "「配送トラック」とは、商品や荷物を店や届け先まで運ぶために使うトラックです。",
    ),
    examples: [
      { en: "A delivery truck stopped in front of the store.", ja: "店の前に配送トラックが止まりました。", zh: "一輛送貨卡車停在店門前。", cefrLevel: "A2" },
      { en: "When the delivery truck arrives, the staff move the boxes inside before opening the store.", ja: "配送トラックが着いたら、開店前にスタッフが箱を店内へ運びます。", zh: "送貨卡車抵達後，員工會在開店前把箱子搬進店裡。", cefrLevel: "B1" },
    ],
    relatedWords: ["truck", "van", "parcel"],
    ja: "配送トラック",
    jaReading: "はいそうトラック",
    jaReadingSegments: [{ text: "配送", ruby: "はいそう" }, { text: "トラック", ruby: null }],
  },
  {
    id: "ponzu-sauce",
    word: "ponzu sauce",
    chinese: "柚子醋醬油",
    chineseDefinition: "以柑橘果汁和醬油等調製，帶有酸味與鹹鮮味的日式調味醬。",
    category: "seasonings",
    partOfSpeech: "noun",
    pronunciation: "/ˈpɑːn.zuː ˌsɔːs/",
    definitions: definitions(
      "柚子醋醬油",
      "A tangy Japanese seasoning sauce commonly made with citrus juice and soy sauce.",
      "「ポン酢」とは、かんきつ果汁やしょうゆなどを合わせた、酸味のある日本の調味料です。",
    ),
    examples: [
      { en: "Dip the dumplings in ponzu sauce.", ja: "餃子をポン酢につけて食べます。", zh: "餃子沾柚子醋醬油吃。", cefrLevel: "A2" },
      { en: "When the hot pot is ready, I mix grated daikon with ponzu sauce for dipping.", ja: "鍋ができたら、ポン酢に大根おろしを加えてつけだれにします。", zh: "火鍋煮好後，我把蘿蔔泥加入柚子醋醬油做成蘸醬。", cefrLevel: "B1" },
    ],
    relatedWords: ["soy-sauce", "vinegar", "yuzu-peel"],
    ja: "ポン酢",
    jaReading: "ポンず",
    jaReadingSegments: [{ text: "ポン", ruby: null }, { text: "酢", ruby: "ず" }],
  },
  {
    id: "noodle-soup-base",
    word: "noodle soup base",
    chinese: "麵味露",
    chineseDefinition: "以醬油、味醂和高湯等調製的濃縮日式調味液，可稀釋作麵湯或蘸汁。",
    category: "seasonings",
    partOfSpeech: "noun",
    pronunciation: "/ˈnuː.dəl suːp ˌbeɪs/",
    definitions: definitions(
      "麵味露",
      "A concentrated Japanese seasoning liquid diluted for noodle soup or dipping sauce.",
      "「めんつゆ」とは、しょうゆやだしなどを合わせ、麺のつゆやつけ汁に使う濃縮調味料です。",
    ),
    examples: [
      { en: "Dilute the noodle soup base with water.", ja: "めんつゆを水で薄めます。", zh: "用水稀釋麵味露。", cefrLevel: "A2" },
      { en: "When I am in a hurry, I season the simmered vegetables with noodle soup base instead of mixing several seasonings.", ja: "急いでいるときは、いくつもの調味料を合わせる代わりに、めんつゆで煮物に味をつけます。", zh: "趕時間時，我不用混合多種調味料，而是直接用麵味露替燉菜調味。", cefrLevel: "B1" },
    ],
    relatedWords: ["soy-sauce", "mirin", "dashi-stock"],
    ja: "めんつゆ",
    jaReading: "めんつゆ",
    jaReadingSegments: null,
  },
  {
    id: "dashi-stock",
    word: "dashi stock",
    chinese: "日式高湯",
    chineseDefinition: "以昆布、柴魚片等材料萃取鮮味，作為味噌湯和日式料理基底的高湯。",
    category: "seasonings",
    partOfSpeech: "noun",
    pronunciation: "/ˈdɑː.ʃi ˌstɑːk/",
    definitions: definitions(
      "日式高湯",
      "A savory Japanese cooking stock commonly made from kombu, dried bonito, or other ingredients.",
      "「だし」とは、昆布やかつお節などからうま味を引き出し、料理の土台に使う日本のスープです。",
    ),
    examples: [
      { en: "Use dashi stock to make miso soup.", ja: "みそ汁にだしを使います。", zh: "用日式高湯煮味噌湯。", cefrLevel: "A2" },
      { en: "Before adding the miso, I taste the dashi stock and adjust it so the soup is not too salty.", ja: "味噌を入れる前にだしの味を確かめ、しょっぱくなりすぎないように調整します。", zh: "加入味噌前，我先嚐日式高湯並調整，避免湯太鹹。", cefrLevel: "B1" },
    ],
    relatedWords: ["kombu-powder", "bonito-powder", "miso"],
    ja: "だし",
    jaReading: "だし",
    jaReadingSegments: null,
  },
];

export const MAIN_WORD_EXPANSION_WORDS = EXPANSION_ENTRIES.map(
  ({ ja: _ja, jaReading: _jaReading, jaReadingSegments: _segments, ...word }) => word,
);

export const MAIN_WORD_EXPANSION_CORRECTIONS: MainWordCorrection[] =
  EXPANSION_ENTRIES.map(({ id, definitions, ja, jaReading, jaReadingSegments }) => {
    const seededJaDefinition = definitions.find(({ language }) => language === "ja")!.definition;
    return {
      id,
      // generateCards initially derives a missing Japanese term from the first
      // Japanese definition. Guard that exact seed value when replacing it
      // with the concise headword below.
      oldJa: seededJaDefinition,
      ja,
      oldJaReading: jaReading,
      jaReading,
      jaReadingSegments,
      jaDefinition: { old: seededJaDefinition, value: seededJaDefinition },
    };
  });

export const MAIN_WORD_EXPANSION_EXAMPLE_PAIRS: MainWordExamplePair[] =
  EXPANSION_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));

export const MAIN_WORD_EXPANSION_IDS = EXPANSION_ENTRIES.map(({ id }) => id);
