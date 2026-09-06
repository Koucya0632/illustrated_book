import type { CEFRLevel, Definition } from "@/types";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type ExpansionExample = { en: string; ja: string; zh: string; cefrLevel: CEFRLevel };
type ExpansionEntry = {
  id: string; word: string; chinese: string; chineseDefinition: string;
  category: string; partOfSpeech: "noun"; pronunciation: string;
  definitions: Definition[]; examples: [ExpansionExample, ExpansionExample];
  relatedWords: string[]; ja: string; jaReading: string;
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
    id: "sink-strainer", word: "sink strainer", chinese: "水槽濾渣籃",
    chineseDefinition: "放在水槽排水口內，用孔洞或細網攔住食物殘渣，讓水流出的可拆式小籃子。",
    category: "kitchen", partOfSpeech: "noun", pronunciation: "/ˈsɪŋk ˌstreɪ.nɚ/",
    definitions: definitions("水槽濾渣籃", "A removable basket in a kitchen sink drain that catches food scraps while letting water through.", "「排水口のゴミ受け」とは、台所の排水口で食べ物のくずを受け止め、水を通す小さなかごです。"),
    examples: [
      { en: "I empty the sink strainer every evening.", ja: "毎晩、排水口のゴミ受けを空にします。", zh: "我每晚都會清空水槽濾渣籃。", cefrLevel: "A2" },
      { en: "After washing the dishes, I remove the sink strainer and rinse off the food scraps.", ja: "食器を洗った後、排水口のゴミ受けを外して、食べ物のくずを洗い流します。", zh: "洗完碗盤後，我會取出水槽濾渣籃，把食物殘渣沖掉。", cefrLevel: "B1" },
    ],
    relatedWords: ["sink", "drain", "colander"], ja: "排水口のゴミ受け", jaReading: "はいすいこうのゴミうけ",
    jaReadingSegments: [{ text: "排水口", ruby: "はいすいこう" }, { text: "のゴミ", ruby: null }, { text: "受", ruby: "う" }, { text: "け", ruby: null }],
  },
  {
    id: "splatter-screen", word: "splatter screen", chinese: "防油噴網",
    chineseDefinition: "蓋在平底鍋上方的平面細網，可減少熱油噴出，同時讓蒸氣散去。",
    category: "kitchen", partOfSpeech: "noun", pronunciation: "/ˈsplæt.ɚ ˌskriːn/",
    definitions: definitions("防油噴網", "A flat mesh cover placed over a frying pan to reduce oil splashes while allowing steam to escape.", "「油はね防止網」とは、フライパンにかぶせて、蒸気を逃がしながら油の飛び散りを抑える網です。"),
    examples: [
      { en: "I cover the frying pan with a splatter screen.", ja: "フライパンに油はね防止網をかぶせます。", zh: "我把防油噴網蓋在平底鍋上。", cefrLevel: "A2" },
      { en: "When frying fish, I use a splatter screen to keep oil off the stove.", ja: "魚を焼くときは、コンロに油が飛ばないように油はね防止網を使います。", zh: "煎魚時，我會用防油噴網，避免油噴到爐台上。", cefrLevel: "B1" },
    ],
    relatedWords: ["pan", "lid", "strainer"], ja: "油はね防止網", jaReading: "あぶらはねぼうしあみ",
    jaReadingSegments: [{ text: "油", ruby: "あぶら" }, { text: "はね", ruby: null }, { text: "防止網", ruby: "ぼうしあみ" }],
  },
  {
    id: "trivet", word: "trivet", chinese: "鍋墊",
    chineseDefinition: "墊在熱鍋或熱水壺下方，避免桌面直接接觸高溫的耐熱墊。",
    category: "kitchen", partOfSpeech: "noun", pronunciation: "/ˈtrɪv.ɪt/",
    definitions: definitions("鍋墊", "A heat-resistant pad or stand placed under a hot pot to protect a table.", "「鍋敷き」とは、熱い鍋ややかんの下に敷いて、テーブルを熱から守る道具です。"),
    examples: [
      { en: "I put the hot pot on a trivet.", ja: "熱い鍋を鍋敷きの上に置きます。", zh: "我把熱鍋放在鍋墊上。", cefrLevel: "A2" },
      { en: "Before bringing the soup to the table, I set out a trivet for the pot.", ja: "スープをテーブルに運ぶ前に、鍋を置くための鍋敷きを用意します。", zh: "把湯端到桌上前，我會先準備好放鍋子的鍋墊。", cefrLevel: "B1" },
    ],
    relatedWords: ["pot", "kettle", "oven-mitt"], ja: "鍋敷き", jaReading: "なべしき",
    jaReadingSegments: [{ text: "鍋", ruby: "なべ" }, { text: "敷", ruby: "し" }, { text: "き", ruby: null }],
  },
  {
    id: "shower-caddy", word: "shower caddy", chinese: "淋浴置物架",
    chineseDefinition: "設在淋浴區內，用來收納洗髮精、沐浴乳等用品並方便瀝水的小架子。",
    category: "bathroom", partOfSpeech: "noun", pronunciation: "/ˈʃaʊ.ɚ ˌkæd.i/",
    definitions: definitions("淋浴置物架", "A small rack in a shower for holding shampoo and other bathing products.", "「シャワーラック」とは、シャワーを浴びる場所でシャンプーなどを置くための小さな棚です。"),
    examples: [
      { en: "I put the shampoo in the shower caddy.", ja: "シャワーラックにシャンプーを置きます。", zh: "我把洗髮精放在淋浴置物架上。", cefrLevel: "A2" },
      { en: "The bottles no longer sit on the floor because I keep them in a shower caddy.", ja: "ボトルをシャワーラックに置くようにしたので、床に置かずに済むようになりました。", zh: "因為我改把瓶罐放在淋浴置物架上，所以不用再放在地板上了。", cefrLevel: "B1" },
    ],
    relatedWords: ["shampoo", "body-wash", "shower"], ja: "シャワーラック", jaReading: "シャワーラック", jaReadingSegments: null,
  },
  {
    id: "laundry-net", word: "laundry net", chinese: "洗衣網袋",
    chineseDefinition: "把衣物裝入後再放進洗衣機的拉鍊網袋，用來減少纏繞和摩擦。",
    category: "bathroom", partOfSpeech: "noun", pronunciation: "/ˈlɑːn.dri ˌnet/",
    definitions: definitions("洗衣網袋", "A zippered mesh bag that protects clothing from tangling and rubbing in a washing machine.", "「洗濯ネット」とは、洗濯機で衣類が絡んだり傷んだりするのを抑えるための網状の袋です。"),
    examples: [
      { en: "I put my shirt in a laundry net.", ja: "シャツを洗濯ネットに入れます。", zh: "我把襯衫放進洗衣網袋。", cefrLevel: "A2" },
      { en: "Before starting the wash, I check that the laundry net is zipped shut.", ja: "洗濯を始める前に、洗濯ネットのファスナーが閉まっているか確認します。", zh: "開始洗衣前，我會確認洗衣網袋的拉鍊已經拉好。", cefrLevel: "B1" },
    ],
    relatedWords: ["laundry-basket", "clothes", "hanger"], ja: "洗濯ネット", jaReading: "せんたくネット",
    jaReadingSegments: [{ text: "洗濯", ruby: "せんたく" }, { text: "ネット", ruby: null }],
  },
  {
    id: "shower-hose", word: "shower hose", chinese: "淋浴軟管",
    chineseDefinition: "連接水龍頭與手持蓮蓬頭、可以彎曲的供水管。",
    category: "bathroom", partOfSpeech: "noun", pronunciation: "/ˈʃaʊ.ɚ ˌhoʊz/",
    definitions: definitions("淋浴軟管", "A flexible tube carrying water from a tap to a handheld shower head.", "「シャワーホース」とは、水栓と手持ちのシャワーヘッドをつなぐ、曲げられる管です。"),
    examples: [
      { en: "The shower hose is twisted.", ja: "シャワーホースがねじれています。", zh: "淋浴軟管扭在一起了。", cefrLevel: "A2" },
      { en: "When replacing the shower hose, I first turn off the water at the tap.", ja: "シャワーホースを交換するときは、まず蛇口を閉めて水を止めます。", zh: "更換淋浴軟管時，我會先關上水龍頭，把水止住。", cefrLevel: "B1" },
    ],
    relatedWords: ["shower-head", "faucet", "shower"], ja: "シャワーホース", jaReading: "シャワーホース", jaReadingSegments: null,
  },
  {
    id: "eye-mask", word: "eye mask", chinese: "睡眠眼罩",
    chineseDefinition: "休息時遮住雙眼以阻擋光線的柔軟罩子，通常有固定在頭上的帶子。",
    category: "bedroom", partOfSpeech: "noun", pronunciation: "/ˈaɪ ˌmæsk/",
    definitions: definitions("睡眠眼罩", "A soft covering worn over the eyes to block light while resting or sleeping.", "「アイマスク」とは、休むときや眠るときに目を覆って光を遮る、柔らかい布などの道具です。"),
    examples: [
      { en: "I wear an eye mask when I sleep.", ja: "寝るときはアイマスクをつけます。", zh: "我睡覺時會戴睡眠眼罩。", cefrLevel: "A2" },
      { en: "The room is still bright, so I put on an eye mask before my nap.", ja: "部屋がまだ明るいので、昼寝の前にアイマスクをつけます。", zh: "因為房間還很亮，我會在午睡前戴上睡眠眼罩。", cefrLevel: "B1" },
    ],
    relatedWords: ["pillow", "curtain", "pajamas"], ja: "アイマスク", jaReading: "アイマスク", jaReadingSegments: null,
  },
  {
    id: "hot-water-bottle", word: "hot-water bottle", chinese: "熱水暖袋",
    chineseDefinition: "裝入熱水後用來保暖的密封容器，日本常見款有硬殼與旋蓋，通常搭配布套使用。",
    category: "bedroom", partOfSpeech: "noun", pronunciation: "/ˌhɑːt ˈwɑː.t̬ɚ ˌbɑː.t̬əl/",
    definitions: definitions("熱水暖袋", "A sealed container filled with hot water and used to provide warmth, often with a fabric cover.", "「湯たんぽ」とは、お湯を入れて暖を取るための容器で、通常はカバーを付けて使うものです。"),
    examples: [
      { en: "I put a cover on the hot-water bottle.", ja: "湯たんぽにカバーをつけます。", zh: "我把布套套在熱水暖袋外面。", cefrLevel: "A2" },
      { en: "After warming the bedding with a hot-water bottle, I take it out before going to sleep.", ja: "湯たんぽで布団を温めた後、寝る前に湯たんぽを布団から出します。", zh: "用熱水暖袋暖好被窩後，我會在睡前把它拿出來。", cefrLevel: "B1" },
    ],
    relatedWords: ["futon", "blanket", "heater"], ja: "湯たんぽ", jaReading: "ゆたんぽ",
    jaReadingSegments: [{ text: "湯", ruby: "ゆ" }, { text: "たんぽ", ruby: null }],
  },
  {
    id: "futon-clip", word: "futon clip", chinese: "棉被夾",
    chineseDefinition: "晾曬厚被時，用來把棉被固定在陽台欄杆上的大型弧形彈簧夾。",
    category: "bedroom", partOfSpeech: "noun", pronunciation: "/ˈfuː.tɑːn ˌklɪp/",
    definitions: definitions("棉被夾", "A large spring clip that holds thick bedding on a balcony railing while it airs.", "「布団ばさみ」とは、干した布団をベランダの手すりなどに固定するための大きなばさみです。"),
    examples: [
      { en: "I secure the futon with a futon clip.", ja: "布団ばさみで布団を留めます。", zh: "我用棉被夾固定棉被。", cefrLevel: "A2" },
      { en: "After airing the futon, I bring the futon clips inside with it.", ja: "布団を干した後は、布団ばさみも一緒に部屋に取り込みます。", zh: "曬完棉被後，我也會把棉被夾一起收進房間。", cefrLevel: "B1" },
    ],
    relatedWords: ["futon", "quilt", "hanger"], ja: "布団ばさみ", jaReading: "ふとんばさみ",
    jaReadingSegments: [{ text: "布団", ruby: "ふとん" }, { text: "ばさみ", ruby: null }],
  },
  {
    id: "coaster", word: "coaster", chinese: "杯墊",
    chineseDefinition: "放在杯子底下的小墊子，用來接住水滴並保護桌面。",
    category: "living-room", partOfSpeech: "noun", pronunciation: "/ˈkoʊ.stɚ/",
    definitions: definitions("杯墊", "A small mat placed under a cup or glass to protect the surface beneath it.", "「コースター」とは、コップの下に敷いて、水滴などからテーブルを守る小さな敷物です。"),
    examples: [
      { en: "I put a coaster under my glass.", ja: "グラスの下にコースターを敷きます。", zh: "我在玻璃杯底下墊上杯墊。", cefrLevel: "A2" },
      { en: "I use a coaster for iced tea so the water drops do not leave a ring on the table.", ja: "アイスティーにはコースターを使って、水滴でテーブルに跡がつかないようにします。", zh: "喝冰茶時，我會用杯墊，避免水滴在桌上留下水痕。", cefrLevel: "B1" },
    ],
    relatedWords: ["glass", "mug", "coffee-table"], ja: "コースター", jaReading: "コースター", jaReadingSegments: null,
  },
  {
    id: "lint-roller", word: "lint roller", chinese: "黏毛滾輪",
    chineseDefinition: "帶有手柄和可替換黏性紙卷，用來黏起衣物或布面上毛髮與棉絮的清潔工具。",
    category: "living-room", partOfSpeech: "noun", pronunciation: "/ˈlɪnt ˌroʊ.lɚ/",
    definitions: definitions("黏毛滾輪", "A handheld roller with sticky sheets that pick up hair and lint from fabric.", "「粘着クリーナー」とは、粘着テープを巻いたローラーで、布などについた毛やほこりを取る掃除道具です。"),
    examples: [
      { en: "I clean the sofa with a lint roller.", ja: "粘着クリーナーでソファを掃除します。", zh: "我用黏毛滾輪清理沙發。", cefrLevel: "A2" },
      { en: "When the lint roller stops picking up hair, I peel off the used sheet.", ja: "粘着クリーナーで毛が取れなくなったら、使ったテープを一枚はがします。", zh: "黏毛滾輪黏不起毛髮時，我會撕掉用過的那一層黏紙。", cefrLevel: "B1" },
    ],
    relatedWords: ["sofa", "rug", "clothes"], ja: "粘着クリーナー", jaReading: "ねんちゃくクリーナー",
    jaReadingSegments: [{ text: "粘着", ruby: "ねんちゃく" }, { text: "クリーナー", ruby: null }],
  },
  {
    id: "cable-management-box", word: "cable management box", chinese: "電線收納盒",
    chineseDefinition: "有出線孔的收納盒，用來集中放置延長插座和電線，減少地面雜亂。",
    category: "living-room", partOfSpeech: "noun", pronunciation: "/ˈkeɪ.bəl ˈmæn.ɪdʒ.mənt ˌbɑːks/",
    definitions: definitions("電線收納盒", "A box with cable openings used to organize a power strip and loose electrical cords.", "「ケーブルボックス」とは、電源タップやコードをまとめて収納する、コードを通す穴がある箱です。"),
    examples: [
      { en: "I put the power strip in a cable management box.", ja: "電源タップをケーブルボックスに入れます。", zh: "我把延長插座放進電線收納盒。", cefrLevel: "A2" },
      { en: "Since I put the loose cords in a cable management box, the floor beside the TV looks tidier.", ja: "余ったコードをケーブルボックスにまとめたので、テレビの横の床がすっきりしました。", zh: "因為我把多餘的電線收進電線收納盒，電視旁的地板看起來整齊多了。", cefrLevel: "B1" },
    ],
    relatedWords: ["extension-cord", "charger", "tv-stand"], ja: "ケーブルボックス", jaReading: "ケーブルボックス", jaReadingSegments: null,
  },
  {
    id: "rubber-stamp", word: "rubber stamp", chinese: "橡皮印章",
    chineseDefinition: "底部有橡膠印面的印章，沾印台後可把固定的字樣或圖案蓋在紙上。",
    category: "office", partOfSpeech: "noun", pronunciation: "/ˈrʌb.ɚ ˌstæmp/",
    definitions: definitions("橡皮印章", "A stamp with a rubber printing surface used with an ink pad to mark paper.", "「ゴム印」とは、ゴム製の印面にインクを付けて、紙に文字や模様を押す道具です。"),
    examples: [
      { en: "I mark the envelope with a rubber stamp.", ja: "封筒にゴム印を押します。", zh: "我在信封上蓋橡皮印章。", cefrLevel: "A2" },
      { en: "To save time, I use an address rubber stamp instead of writing each envelope by hand.", ja: "時間を節約するため、封筒に一枚ずつ手書きせず、住所のゴム印を使います。", zh: "為了節省時間，我用地址橡皮印章，不再逐一手寫信封。", cefrLevel: "B1" },
    ],
    relatedWords: ["stamp-pad", "envelope", "document"], ja: "ゴム印", jaReading: "ゴムいん",
    jaReadingSegments: [{ text: "ゴム", ruby: null }, { text: "印", ruby: "いん" }],
  },
  {
    id: "stamp-pad", word: "stamp pad", chinese: "印台",
    chineseDefinition: "盒內裝有吸附印墨的軟墊，讓橡皮印章在蓋印前均勻沾墨。",
    category: "office", partOfSpeech: "noun", pronunciation: "/ˈstæmp ˌpæd/",
    definitions: definitions("印台", "A shallow case containing an inked pad used to apply ink to a rubber stamp.", "「スタンプ台」とは、ゴム印にインクを付けるための、インクを含んだパッドが入った容器です。"),
    examples: [
      { en: "I lightly press the rubber stamp onto the stamp pad.", ja: "スタンプ台にゴム印を軽く押し当てます。", zh: "我把橡皮印章輕壓在印台上。", cefrLevel: "A2" },
      { en: "After stamping the documents, I close the stamp pad so the ink does not dry out.", ja: "書類に印を押した後は、インクが乾かないようにスタンプ台のふたを閉めます。", zh: "文件蓋完章後，我會把印台的蓋子關上，避免印墨乾掉。", cefrLevel: "B1" },
    ],
    relatedWords: ["rubber-stamp", "document", "desk-organizer"], ja: "スタンプ台", jaReading: "スタンプだい",
    jaReadingSegments: [{ text: "スタンプ", ruby: null }, { text: "台", ruby: "だい" }],
  },
  {
    id: "bookend", word: "bookend", chinese: "書擋",
    chineseDefinition: "放在一排書的端部，支撐書本直立並避免傾倒的擋板。",
    category: "office", partOfSpeech: "noun", pronunciation: "/ˈbʊk.end/",
    definitions: definitions("書擋", "A support placed at the end of a row of books to keep them upright.", "「ブックエンド」とは、並べた本の端に置いて、本が倒れないように支える道具です。"),
    examples: [
      { en: "I keep the books upright with a bookend.", ja: "ブックエンドで本を立てておきます。", zh: "我用書擋讓書本保持直立。", cefrLevel: "A2" },
      { en: "When I take out a thick file, I move the bookend so the other files do not fall over.", ja: "厚いファイルを抜いたら、ほかのファイルが倒れないようにブックエンドを動かします。", zh: "抽出厚資料夾後，我會移動書擋，避免其他資料夾倒下。", cefrLevel: "B1" },
    ],
    relatedWords: ["bookshelf", "file-folder", "desk"], ja: "ブックエンド", jaReading: "ブックエンド", jaReadingSegments: null,
  },
  {
    id: "bicycle-parking-rack", word: "bicycle parking rack", chinese: "自行車停車架",
    chineseDefinition: "設在停車區，用溝槽或金屬框固定自行車車輪，協助整齊停放的設施。",
    category: "street", partOfSpeech: "noun", pronunciation: "/ˈbaɪ.sɪ.kəl ˈpɑːr.kɪŋ ˌræk/",
    definitions: definitions("自行車停車架", "A rack with wheel slots or supports that holds bicycles in an orderly parking area.", "「駐輪ラック」とは、自転車の車輪を溝や枠に入れて、整列して停められる設備です。"),
    examples: [
      { en: "I put the front wheel in the bicycle parking rack.", ja: "駐輪ラックに前輪を入れます。", zh: "我把前輪放進自行車停車架。", cefrLevel: "A2" },
      { en: "Because the bicycle parking rack near the entrance is full, I use the one at the back.", ja: "入口の近くの駐輪ラックが埋まっているので、奥のラックを使います。", zh: "因為入口附近的自行車停車架已滿，我改用裡面的架子。", cefrLevel: "B1" },
    ],
    relatedWords: ["bicycle", "parking-lot", "bike-lane"], ja: "駐輪ラック", jaReading: "ちゅうりんラック",
    jaReadingSegments: [{ text: "駐輪", ruby: "ちゅうりん" }, { text: "ラック", ruby: null }],
  },
  {
    id: "wheel-stop", word: "wheel stop", chinese: "停車輪擋",
    chineseDefinition: "固定在停車格地面、攔住輪胎的低矮長條塊，避免車輛停得太後面。",
    category: "street", partOfSpeech: "noun", pronunciation: "/ˈwiːl ˌstɑːp/",
    definitions: definitions("停車輪擋", "A low block fixed to a parking space that stops a vehicle's wheels from rolling too far.", "「輪止め」とは、駐車場の地面に固定し、車のタイヤを受け止めて行き過ぎを防ぐ低いブロックです。"),
    examples: [
      { en: "I step over the wheel stop.", ja: "輪止めをまたぎます。", zh: "我跨過停車輪擋。", cefrLevel: "A2" },
      { en: "When walking through the parking lot at night, I watch out for the low wheel stops.", ja: "夜に駐車場を歩くときは、低い輪止めにつまずかないように気をつけます。", zh: "晚上走過停車場時，我會小心，避免被低矮的停車輪擋絆倒。", cefrLevel: "B1" },
    ],
    relatedWords: ["parking-space", "parking-lot", "bollard"], ja: "輪止め", jaReading: "わどめ",
    jaReadingSegments: [{ text: "輪", ruby: "わ" }, { text: "止", ruby: "ど" }, { text: "め", ruby: null }],
  },
  {
    id: "bus-stop-shelter", word: "bus stop shelter", chinese: "公車候車亭",
    chineseDefinition: "設在公車站牌旁的有頂棚設施，供等車的人遮雨或遮陽。",
    category: "street", partOfSpeech: "noun", pronunciation: "/ˈbʌs stɑːp ˌʃel.tɚ/",
    definitions: definitions("公車候車亭", "A roofed structure at a bus stop that shelters waiting passengers from rain and sun.", "「バス停の上屋」とは、バスを待つ人が雨や日差しを避けられるように設けられた屋根のある設備です。"),
    examples: [
      { en: "I wait under the bus stop shelter.", ja: "バス停の上屋の下で待ちます。", zh: "我在公車候車亭下等車。", cefrLevel: "A2" },
      { en: "It started raining while I was waiting, so I moved under the bus stop shelter.", ja: "待っている間に雨が降り出したので、バス停の上屋の下に移動しました。", zh: "等車時開始下雨，所以我移到公車候車亭下。", cefrLevel: "B1" },
    ],
    relatedWords: ["bus-stop", "bench", "bus"], ja: "バス停の上屋", jaReading: "バスていのうわや",
    jaReadingSegments: [{ text: "バス", ruby: null }, { text: "停", ruby: "てい" }, { text: "の", ruby: null }, { text: "上屋", ruby: "うわや" }],
  },
  {
    id: "produce-bag-roll", word: "produce bag roll", chinese: "蔬果連捲袋",
    chineseDefinition: "超市供顧客撕取使用的薄塑膠袋卷，常用來分裝散裝蔬果。",
    category: "supermarket", partOfSpeech: "noun", pronunciation: "/ˈproʊ.duːs bæɡ ˌroʊl/",
    definitions: definitions("蔬果連捲袋", "A roll of thin tear-off plastic bags provided for loose fruit and vegetables in a supermarket.", "「ポリ袋ロール」とは、スーパーで野菜などを入れるために、一枚ずつ切り離して使う薄い袋の巻物です。"),
    examples: [
      { en: "I tear a bag off the produce bag roll.", ja: "ポリ袋ロールから袋を一枚切り取ります。", zh: "我從蔬果連捲袋撕下一個袋子。", cefrLevel: "A2" },
      { en: "Before choosing loose carrots, I take one bag from the produce bag roll.", ja: "ばら売りのにんじんを選ぶ前に、ポリ袋ロールから袋を一枚取ります。", zh: "挑選散裝胡蘿蔔前，我會先從蔬果連捲袋取一個袋子。", cefrLevel: "B1" },
    ],
    relatedWords: ["plastic-bag", "produce-section", "bagging-counter"], ja: "ポリ袋ロール", jaReading: "ポリぶくろロール",
    jaReadingSegments: [{ text: "ポリ", ruby: null }, { text: "袋", ruby: "ぶくろ" }, { text: "ロール", ruby: null }],
  },
  {
    id: "food-tray", word: "food tray", chinese: "食品托盤",
    chineseDefinition: "超市盛裝生鮮肉類、魚或其他食物的輕薄淺盤，常搭配保鮮膜包裝。",
    category: "supermarket", partOfSpeech: "noun", pronunciation: "/ˈfuːd ˌtreɪ/",
    definitions: definitions("食品托盤", "A lightweight shallow tray used to package meat, fish, and other food for sale.", "「食品トレー」とは、肉や魚などを載せて包装するための、軽くて浅い容器です。"),
    examples: [
      { en: "I rinse the empty food tray.", ja: "空になった食品トレーをすすぎます。", zh: "我把空的食品托盤沖洗乾淨。", cefrLevel: "A2" },
      { en: "Before taking the food trays to the collection box, I wash and dry them.", ja: "食品トレーを回収ボックスに持っていく前に、洗って乾かします。", zh: "把食品托盤拿到回收箱前，我會先洗淨並晾乾。", cefrLevel: "B1" },
    ],
    relatedWords: ["plastic-wrap", "meat-section", "recycling-box"], ja: "食品トレー", jaReading: "しょくひんトレー",
    jaReadingSegments: [{ text: "食品", ruby: "しょくひん" }, { text: "トレー", ruby: null }],
  },
  {
    id: "egg-carton", word: "egg carton", chinese: "雞蛋盒",
    chineseDefinition: "有獨立凹槽固定每顆雞蛋的包裝盒，日本超市常見透明塑膠款。",
    category: "supermarket", partOfSpeech: "noun", pronunciation: "/ˈeɡ ˌkɑːr.tən/",
    definitions: definitions("雞蛋盒", "A container with separate spaces that hold and protect individual eggs.", "「卵パック」とは、一個ずつのくぼみに卵を入れ、割れにくくするための包装容器です。"),
    examples: [
      { en: "I open the egg carton.", ja: "卵パックを開けます。", zh: "我打開雞蛋盒。", cefrLevel: "A2" },
      { en: "When packing my shopping bag, I put the egg carton on top so the eggs do not break.", ja: "買い物袋に詰めるときは、卵が割れないように卵パックを上に載せます。", zh: "把東西裝進購物袋時，我會把雞蛋盒放在上面，避免雞蛋破掉。", cefrLevel: "B1" },
    ],
    relatedWords: ["shopping-basket", "reusable-bag", "fridge"], ja: "卵パック", jaReading: "たまごパック",
    jaReadingSegments: [{ text: "卵", ruby: "たまご" }, { text: "パック", ruby: null }],
  },
  {
    id: "bicycle-helmet", word: "bicycle helmet", chinese: "自行車安全帽",
    chineseDefinition: "騎自行車時戴在頭上的防護帽，通常有通風孔、內襯和下巴扣帶。",
    category: "transportation", partOfSpeech: "noun", pronunciation: "/ˈbaɪ.sɪ.kəl ˌhel.mət/",
    definitions: definitions("自行車安全帽", "A protective helmet worn when cycling, usually with vents and a chin strap.", "「自転車用ヘルメット」とは、自転車に乗るときに頭を守るためにかぶる、あごひもの付いた帽子状の保護具です。"),
    examples: [
      { en: "I fasten my bicycle helmet's chin strap.", ja: "自転車用ヘルメットのあごひもを締めます。", zh: "我扣緊自行車安全帽的下巴帶。", cefrLevel: "A2" },
      { en: "Before cycling to the station, I check that my bicycle helmet fits snugly.", ja: "自転車で駅に向かう前に、自転車用ヘルメットがしっかり合っているか確認します。", zh: "騎車前往車站前，我會確認自行車安全帽戴得穩固合身。", cefrLevel: "B1" },
    ],
    relatedWords: ["bicycle", "bicycle-parking-rack", "bike-lane"], ja: "自転車用ヘルメット", jaReading: "じてんしゃようヘルメット",
    jaReadingSegments: [{ text: "自転車用", ruby: "じてんしゃよう" }, { text: "ヘルメット", ruby: null }],
  },
  {
    id: "ticket-machine", word: "ticket machine", chinese: "自動售票機",
    chineseDefinition: "在車站讓乘客自行選擇票種、付款並取得車票的機器。",
    category: "transportation", partOfSpeech: "noun", pronunciation: "/ˈtɪk.ɪt məˌʃiːn/",
    definitions: definitions("自動售票機", "A machine at a station where passengers select, pay for, and receive tickets.", "「券売機」とは、駅で乗車券などを選び、代金を支払って購入するための機械です。"),
    examples: [
      { en: "I buy a ticket from the ticket machine.", ja: "券売機で切符を買います。", zh: "我用自動售票機買車票。", cefrLevel: "A2" },
      { en: "Since there is a queue at the ticket machine, I arrive at the station a little early.", ja: "券売機に列ができるので、少し早めに駅に着くようにします。", zh: "因為自動售票機前會排隊，我會提早一點到車站。", cefrLevel: "B1" },
    ],
    relatedWords: ["ticket-gate", "station", "train"], ja: "券売機", jaReading: "けんばいき",
    jaReadingSegments: [{ text: "券売機", ruby: "けんばいき" }],
  },
  {
    id: "bus-stop-button", word: "bus stop button", chinese: "公車下車鈴",
    chineseDefinition: "公車內供乘客按下、通知駕駛要在下一站下車的按鈕。",
    category: "transportation", partOfSpeech: "noun", pronunciation: "/ˈbʌs stɑːp ˌbʌt.ən/",
    definitions: definitions("公車下車鈴", "A button inside a bus that passengers press to request a stop at the next bus stop.", "「降車ボタン」とは、次の停留所で降りたいことを運転手に知らせるために、バスの車内で押すボタンです。"),
    examples: [
      { en: "I press the bus stop button.", ja: "降車ボタンを押します。", zh: "我按下公車下車鈴。", cefrLevel: "A2" },
      { en: "When my stop is announced, I press the bus stop button near my seat.", ja: "降りる停留所が案内されたら、席の近くの降車ボタンを押します。", zh: "廣播到我要下車的站名時，我會按座位附近的公車下車鈴。", cefrLevel: "B1" },
    ],
    relatedWords: ["bus", "bus-stop", "pedestrian-button"], ja: "降車ボタン", jaReading: "こうしゃボタン",
    jaReadingSegments: [{ text: "降車", ruby: "こうしゃ" }, { text: "ボタン", ruby: null }],
  },
  {
    id: "roasted-sesame-seeds", word: "roasted sesame seeds", chinese: "炒芝麻",
    chineseDefinition: "把芝麻乾炒或烘烤出香氣後製成的整粒調味配料，可撒在飯菜上。",
    category: "seasonings", partOfSpeech: "noun", pronunciation: "/ˈroʊ.stɪd ˈses.ə.mi ˌsiːdz/",
    definitions: definitions("炒芝麻", "Whole sesame seeds toasted to bring out their aroma and used as a topping or seasoning.", "「いりごま」とは、ごまを煎って香りを引き出したもので、料理に振りかけたり混ぜたりして使います。"),
    examples: [
      { en: "I sprinkle roasted sesame seeds over the rice.", ja: "ご飯にいりごまを振りかけます。", zh: "我把炒芝麻撒在飯上。", cefrLevel: "A2" },
      { en: "Just before serving the spinach, I mix in roasted sesame seeds for extra aroma.", ja: "ほうれん草を出す直前に、香りをよくするためにいりごまを混ぜます。", zh: "菠菜上桌前，我會拌入炒芝麻來增加香氣。", cefrLevel: "B1" },
    ],
    relatedWords: ["sesame-oil", "sesame-paste", "furikake"], ja: "いりごま", jaReading: "いりごま", jaReadingSegments: null,
  },
  {
    id: "bonito-flakes", word: "bonito flakes", chinese: "柴魚片",
    chineseDefinition: "把乾燥加工的鰹魚削成薄片，可作為料理配料或用來煮高湯。",
    category: "seasonings", partOfSpeech: "noun", pronunciation: "/bəˈniː.toʊ ˌfleɪks/",
    definitions: definitions("柴魚片", "Thin shavings of dried, processed bonito used as a topping or to make soup stock.", "「かつお節」とは、加工して乾燥させたかつおを薄く削ったもので、料理に載せたり、だしを取ったりするのに使います。"),
    examples: [
      { en: "I put bonito flakes on the tofu.", ja: "豆腐にかつお節を載せます。", zh: "我把柴魚片放在豆腐上。", cefrLevel: "A2" },
      { en: "After opening the bag of bonito flakes, I seal it tightly to keep the aroma in.", ja: "かつお節の袋を開けた後は、香りが逃げないようにしっかり閉じます。", zh: "柴魚片拆封後，我會把袋口封緊，避免香氣散失。", cefrLevel: "B1" },
    ],
    relatedWords: ["bonito-powder", "dashi-stock", "soy-sauce"], ja: "かつお節", jaReading: "かつおぶし",
    jaReadingSegments: [{ text: "かつお", ruby: null }, { text: "節", ruby: "ぶし" }],
  },
  {
    id: "aonori", word: "aonori", chinese: "青海苔粉",
    chineseDefinition: "將青海苔乾燥並細碎製成的綠色調味配料，常撒在炒麵或大阪燒上增添香氣。",
    category: "seasonings", partOfSpeech: "noun", pronunciation: "/ˌaʊ.noʊˈriː/",
    definitions: definitions("青海苔粉", "Dried, finely flaked green seaweed used as an aromatic topping on Japanese dishes.", "「青のり」とは、緑色の海藻を乾燥させて細かくしたもので、焼きそばやお好み焼きなどに振りかけて使います。"),
    examples: [
      { en: "I sprinkle aonori over the fried noodles.", ja: "焼きそばに青のりを振りかけます。", zh: "我把青海苔粉撒在炒麵上。", cefrLevel: "A2" },
      { en: "After adding the sauce to the okonomiyaki, I finish it with a little aonori.", ja: "お好み焼きにソースを塗った後、仕上げに青のりを少し振りかけます。", zh: "在大阪燒上塗好醬汁後，我會撒一點青海苔粉做最後調味。", cefrLevel: "B1" },
    ],
    relatedWords: ["bonito-flakes", "tonkatsu-sauce", "furikake"], ja: "青のり", jaReading: "あおのり",
    jaReadingSegments: [{ text: "青", ruby: "あお" }, { text: "のり", ruby: null }],
  },
];

export const MAIN_WORD_EXPANSION_BATCH_3_WORDS = EXPANSION_ENTRIES.map(
  ({ ja: _ja, jaReading: _jaReading, jaReadingSegments: _segments, ...word }) => word,
);

export const MAIN_WORD_EXPANSION_BATCH_3_CORRECTIONS: MainWordCorrection[] =
  EXPANSION_ENTRIES.map(({ id, definitions, ja, jaReading, jaReadingSegments }) => {
    const seededJaDefinition = definitions.find(({ language }) => language === "ja")!.definition;
    return {
      id, oldJa: seededJaDefinition, ja, oldJaReading: jaReading, jaReading, jaReadingSegments,
      jaDefinition: { old: seededJaDefinition, value: seededJaDefinition },
    };
  });

export const MAIN_WORD_EXPANSION_BATCH_3_EXAMPLE_PAIRS: MainWordExamplePair[] =
  EXPANSION_ENTRIES.map(({ id, examples }) => ({
    id, examples: [{ ...examples[0], sortOrder: 0 }, { ...examples[1], sortOrder: 1 }],
  }));

export const MAIN_WORD_EXPANSION_BATCH_3_IDS = EXPANSION_ENTRIES.map(({ id }) => id);
