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
    id: "rice-paddle",
    word: "rice paddle",
    chinese: "飯勺",
    chineseDefinition: "用來翻鬆並盛取米飯，勺面通常寬扁且不易刮傷飯鍋的廚房工具。",
    category: "kitchen",
    partOfSpeech: "noun",
    pronunciation: "/ˈraɪs ˌpæd.əl/",
    definitions: definitions(
      "飯勺",
      "A broad, flat kitchen utensil used to mix and serve cooked rice.",
      "「しゃもじ」とは、炊いたご飯をほぐしたり、よそったりするための平たい道具です。",
    ),
    examples: [
      { en: "Use the rice paddle to serve the rice.", ja: "しゃもじでご飯をよそいます。", zh: "用飯勺盛飯。", cefrLevel: "A2" },
      { en: "Before serving the rice, wet the rice paddle so the grains do not stick to it.", ja: "ご飯をよそう前に、米粒がつきにくいようにしゃもじを水でぬらします。", zh: "盛飯前先把飯勺沾濕，米粒就不容易黏在上面。", cefrLevel: "B1" },
    ],
    relatedWords: ["rice-cooker", "bowl", "spatula"],
    ja: "しゃもじ",
    jaReading: "しゃもじ",
    jaReadingSegments: null,
  },
  {
    id: "colander",
    word: "colander",
    chinese: "瀝水盆",
    chineseDefinition: "帶有許多孔洞的盆狀廚具，用來沖洗食材或把麵和蔬菜的水瀝掉。",
    category: "kitchen",
    partOfSpeech: "noun",
    pronunciation: "/ˈkɑː.lən.dɚ/",
    definitions: definitions(
      "瀝水盆",
      "A perforated bowl used to rinse food or drain water from noodles and vegetables.",
      "「ざる」とは、食材を洗ったり、麺や野菜の水を切ったりする穴の開いた器です。",
    ),
    examples: [
      { en: "Drain the noodles in the colander.", ja: "麺をざるにあげて水を切ります。", zh: "把麵倒進瀝水盆瀝乾。", cefrLevel: "A2" },
      { en: "After washing the vegetables, leave them in the colander until the extra water drains away.", ja: "野菜を洗ったら、余分な水が切れるまでざるに入れておきます。", zh: "蔬菜洗好後，放在瀝水盆裡直到多餘水分瀝掉。", cefrLevel: "B1" },
    ],
    relatedWords: ["strainer", "bowl", "sink"],
    ja: "ざる",
    jaReading: "ざる",
    jaReadingSegments: null,
  },
  {
    id: "kitchen-scale",
    word: "kitchen scale",
    chinese: "廚房秤",
    chineseDefinition: "用來秤量食材重量，方便依照食譜準確取用材料的小型秤具。",
    category: "kitchen",
    partOfSpeech: "noun",
    pronunciation: "/ˈkɪtʃ.ən ˌskeɪl/",
    definitions: definitions(
      "廚房秤",
      "A small scale used to measure the weight of ingredients for cooking or baking.",
      "「キッチンスケール」とは、料理やお菓子作りで材料の重さを量る小型のはかりです。",
    ),
    examples: [
      { en: "Weigh the flour on the kitchen scale.", ja: "キッチンスケールで小麦粉を量ります。", zh: "用廚房秤秤麵粉。", cefrLevel: "A2" },
      { en: "Before baking the cake, I use the kitchen scale to measure every ingredient accurately.", ja: "ケーキを焼く前に、キッチンスケールですべての材料を正確に量ります。", zh: "烤蛋糕前，我會用廚房秤準確秤量每一種材料。", cefrLevel: "B1" },
    ],
    relatedWords: ["measuring-cup", "measuring-spoon", "flour"],
    ja: "キッチンスケール",
    jaReading: "キッチンスケール",
    jaReadingSegments: null,
  },
  {
    id: "bath-ladle",
    word: "bath ladle",
    chinese: "浴室水勺",
    chineseDefinition: "帶有短柄、可從浴缸或水盆舀水沖洗身體的浴室用水勺。",
    category: "bathroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈbæθ ˌleɪ.dəl/",
    definitions: definitions(
      "浴室水勺",
      "A short-handled scoop used to pour bathwater over the body in a Japanese bathroom.",
      "「手おけ」とは、浴室でお湯をくみ、体にかけるための持ち手が付いた小さな容器です。",
    ),
    examples: [
      { en: "Pour warm water over your shoulders with the bath ladle.", ja: "手おけで肩にお湯をかけます。", zh: "用浴室水勺把溫水淋在肩膀上。", cefrLevel: "A2" },
      { en: "Before entering the tub, use the bath ladle to rinse all the soap from your body.", ja: "湯船に入る前に、手おけで体の石けんをきれいに流します。", zh: "進浴缸前，先用浴室水勺把身上的肥皂沖乾淨。", cefrLevel: "B1" },
    ],
    relatedWords: ["bathtub", "bath-stool", "wash-basin"],
    ja: "手おけ",
    jaReading: "ておけ",
    jaReadingSegments: [{ text: "手", ruby: "て" }, { text: "おけ", ruby: null }],
  },
  {
    id: "soap-dish",
    word: "soap dish",
    chinese: "肥皂盒",
    chineseDefinition: "放置肥皂並讓水分排走，使肥皂保持乾燥的小托盤或容器。",
    category: "bathroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈsoʊp ˌdɪʃ/",
    definitions: definitions(
      "肥皂盒",
      "A small tray or holder that stores a bar of soap and lets excess water drain away.",
      "「石けん置き」とは、固形石けんを置き、水を切って乾きやすくする小さな受け皿です。",
    ),
    examples: [
      { en: "Put the bar of soap on the soap dish.", ja: "固形石けんを石けん置きに置きます。", zh: "把肥皂放在肥皂盒上。", cefrLevel: "A2" },
      { en: "After washing my hands, I return the soap to the soap dish so it can drain and dry.", ja: "手を洗ったら、水が切れて乾くように石けんを石けん置きへ戻します。", zh: "洗完手後，我把肥皂放回肥皂盒，讓水分瀝掉並晾乾。", cefrLevel: "B1" },
    ],
    relatedWords: ["soap", "hand-soap", "washbasin"],
    ja: "石けん置き",
    jaReading: "せっけんおき",
    jaReadingSegments: [{ text: "石", ruby: "せっ" }, { text: "けん", ruby: null }, { text: "置き", ruby: "おき" }],
  },
  {
    id: "sanitary-bin",
    word: "sanitary bin",
    chinese: "廁所垃圾桶",
    chineseDefinition: "放在馬桶旁、有蓋且用來丟棄衛生用品的小型垃圾桶。",
    category: "bathroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈsæn.ə.ter.i ˌbɪn/",
    definitions: definitions(
      "廁所垃圾桶",
      "A small covered bin beside a toilet for disposing of sanitary products.",
      "「サニタリーボックス」とは、トイレに置き、使用済みの生理用品などを捨てるふた付きの小さなごみ箱です。",
    ),
    examples: [
      { en: "Put the used sanitary pad in the sanitary bin.", ja: "使用済みの生理用品はサニタリーボックスに捨てます。", zh: "把用過的衛生棉丟進廁所垃圾桶。", cefrLevel: "A2" },
      { en: "When the sanitary bin is full, tie its liner and replace it so the toilet stays clean.", ja: "サニタリーボックスがいっぱいになったら、中の袋の口を縛って交換し、トイレを清潔に保ちます。", zh: "廁所垃圾桶裝滿後，把內袋綁好並換新，保持廁所清潔。", cefrLevel: "B1" },
    ],
    relatedWords: ["sanitary-pad", "toilet", "trash-bag"],
    ja: "サニタリーボックス",
    jaReading: "サニタリーボックス",
    jaReadingSegments: null,
  },
  {
    id: "mattress-pad",
    word: "mattress pad",
    chinese: "床墊保潔墊",
    chineseDefinition: "鋪在床墊上方、以增加舒適度並減少汗水和髒污直接接觸床墊的薄墊。",
    category: "bedroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈmæt.rəs ˌpæd/",
    definitions: definitions(
      "床墊保潔墊",
      "A thin padded layer placed over a mattress for comfort and protection.",
      "「敷きパッド」とは、寝心地を整え、汗や汚れから寝具を守るためにマットレスの上へ敷く薄いパッドです。",
    ),
    examples: [
      { en: "Lay the mattress pad over the mattress.", ja: "マットレスの上に敷きパッドを敷きます。", zh: "把床墊保潔墊鋪在床墊上。", cefrLevel: "A2" },
      { en: "On a sunny day, I wash the mattress pad and dry it completely before making the bed.", ja: "晴れた日に敷きパッドを洗い、完全に乾かしてからベッドを整えます。", zh: "晴天時我會清洗床墊保潔墊，等它完全乾燥後再鋪床。", cefrLevel: "B1" },
    ],
    relatedWords: ["mattress", "fitted-sheet", "bed-sheet"],
    ja: "敷きパッド",
    jaReading: "しきパッド",
    jaReadingSegments: [{ text: "敷き", ruby: "しき" }, { text: "パッド", ruby: null }],
  },
  {
    id: "fitted-sheet",
    word: "fitted sheet",
    chinese: "床包",
    chineseDefinition: "四周帶有鬆緊帶、可套住床墊邊角並固定位置的床單。",
    category: "bedroom",
    partOfSpeech: "noun",
    pronunciation: "/ˈfɪt.ɪd ˌʃiːt/",
    definitions: definitions(
      "床包",
      "A sheet with elastic edges that fits securely around a mattress.",
      "「ボックスシーツ」とは、周囲にゴムが入り、マットレスの角まで包んで固定できるシーツです。",
    ),
    examples: [
      { en: "Pull the fitted sheet over the mattress.", ja: "ボックスシーツをマットレスにかぶせます。", zh: "把床包套在床墊上。", cefrLevel: "A2" },
      { en: "Because the fitted sheet has elastic edges, it stays in place even when I turn over in my sleep.", ja: "ボックスシーツは周囲にゴムがあるので、寝返りを打ってもずれにくいです。", zh: "因為床包四周有鬆緊帶，即使睡覺翻身也不容易移位。", cefrLevel: "B1" },
    ],
    relatedWords: ["mattress", "bed-sheet", "mattress-pad"],
    ja: "ボックスシーツ",
    jaReading: "ボックスシーツ",
    jaReadingSegments: null,
  },
  {
    id: "duvet-cover",
    word: "duvet cover",
    chinese: "被套",
    chineseDefinition: "套在棉被外層、可拆下清洗並防止被芯直接沾染汗水與髒污的布套。",
    category: "bedroom",
    partOfSpeech: "noun",
    pronunciation: "/duːˈveɪ ˌkʌv.ɚ/",
    definitions: definitions(
      "被套",
      "A removable fabric cover that protects a duvet and can be washed separately.",
      "「掛け布団カバー」とは、掛け布団を汚れから守り、取り外して洗える布製のカバーです。",
    ),
    examples: [
      { en: "Put the duvet inside the duvet cover.", ja: "掛け布団を掛け布団カバーに入れます。", zh: "把棉被裝進被套裡。", cefrLevel: "A2" },
      { en: "When changing the duvet cover, I fasten the inner ties first so the duvet does not bunch up.", ja: "掛け布団カバーを替えるときは、布団が片寄らないように内側のひもを先に結びます。", zh: "更換被套時，我會先綁好裡面的固定帶，避免棉被縮成一團。", cefrLevel: "B1" },
    ],
    relatedWords: ["quilt", "bed-sheet", "pillowcase"],
    ja: "掛け布団カバー",
    jaReading: "かけぶとんカバー",
    jaReadingSegments: [{ text: "掛け", ruby: "かけ" }, { text: "布団", ruby: "ぶとん" }, { text: "カバー", ruby: null }],
  },
  {
    id: "floor-chair",
    word: "floor chair",
    chinese: "和式地板椅",
    chineseDefinition: "沒有高椅腳、直接放在地板或榻榻米上使用，並設有靠背的低矮座椅。",
    category: "living-room",
    partOfSpeech: "noun",
    pronunciation: "/ˈflɔːr ˌtʃer/",
    definitions: definitions(
      "和式地板椅",
      "A low chair with a backrest that sits directly on the floor without tall legs.",
      "「座椅子」とは、脚がなく、床や畳の上に直接置いて背もたれに寄りかかれる低いいすです。",
    ),
    examples: [
      { en: "I sit in the floor chair to watch TV.", ja: "座椅子に座ってテレビを見ます。", zh: "我坐在和式地板椅上看電視。", cefrLevel: "A2" },
      { en: "When my back feels tired, I adjust the floor chair so I can lean back comfortably.", ja: "腰が疲れたときは、楽にもたれられるように座椅子の角度を調整します。", zh: "腰累時，我會調整和式地板椅的角度，讓自己能舒服地往後靠。", cefrLevel: "B1" },
    ],
    relatedWords: ["floor-cushion", "kotatsu", "low-table"],
    ja: "座椅子",
    jaReading: "ざいす",
    jaReadingSegments: [{ text: "座椅子", ruby: "ざいす" }],
  },
  {
    id: "air-circulator",
    word: "air circulator",
    chinese: "空氣循環扇",
    chineseDefinition: "把氣流集中送向遠處、用來促進室內空氣循環的小型風扇。",
    category: "living-room",
    partOfSpeech: "noun",
    pronunciation: "/ˈer ˌsɝː.kjə.leɪ.tɚ/",
    definitions: definitions(
      "空氣循環扇",
      "A compact fan designed to move air around a room in a focused stream.",
      "「サーキュレーター」とは、直進する風を送り、部屋の空気を循環させる小型の送風機です。",
    ),
    examples: [
      { en: "Place the air circulator near the air conditioner.", ja: "サーキュレーターをエアコンの近くに置きます。", zh: "把空氣循環扇放在空調旁邊。", cefrLevel: "A2" },
      { en: "When drying laundry indoors, point the air circulator at the clothes so they dry faster.", ja: "部屋干しするときは、早く乾くようにサーキュレーターの風を洗濯物に当てます。", zh: "在室內晾衣時，把空氣循環扇朝向衣物，讓它們更快乾。", cefrLevel: "B1" },
    ],
    relatedWords: ["fan", "air-conditioner", "dehumidifier"],
    ja: "サーキュレーター",
    jaReading: "サーキュレーター",
    jaReadingSegments: null,
  },
  {
    id: "curtain-tieback",
    word: "curtain tieback",
    chinese: "窗簾綁帶",
    chineseDefinition: "把拉開的窗簾束在窗邊，避免布面散開或被風吹動的帶子或繩扣。",
    category: "living-room",
    partOfSpeech: "noun",
    pronunciation: "/ˈkɝː.tən ˌtaɪ.bæk/",
    definitions: definitions(
      "窗簾綁帶",
      "A band or cord used to hold an open curtain neatly at the side of a window.",
      "「カーテンタッセル」とは、開けたカーテンを窓の横でまとめて留める帯やひもです。",
    ),
    examples: [
      { en: "Hold the curtains open with the curtain tiebacks.", ja: "カーテンタッセルでカーテンをまとめます。", zh: "用窗簾綁帶把窗簾束起來。", cefrLevel: "A2" },
      { en: "Before opening the window, I secure the curtains with tiebacks so the wind does not blow them around.", ja: "窓を開ける前に、風でカーテンが暴れないようにタッセルで留めます。", zh: "開窗前，我用綁帶固定窗簾，避免它們被風吹得亂飄。", cefrLevel: "B1" },
    ],
    relatedWords: ["curtain", "window", "blinds"],
    ja: "カーテンタッセル",
    jaReading: "カーテンタッセル",
    jaReadingSegments: null,
  },
  {
    id: "calculator",
    word: "calculator",
    chinese: "計算機",
    chineseDefinition: "以數字鍵和運算鍵快速進行加減乘除等計算的電子工具。",
    category: "office",
    partOfSpeech: "noun",
    pronunciation: "/ˈkæl.kjə.leɪ.tɚ/",
    definitions: definitions(
      "計算機",
      "An electronic device with number and operation keys for performing calculations.",
      "「電卓」とは、数字や計算記号のキーを押して計算する小型の電子機器です。",
    ),
    examples: [
      { en: "Check the total with the calculator.", ja: "電卓で合計を確認します。", zh: "用計算機確認總額。", cefrLevel: "A2" },
      { en: "Before sending the invoice, I use the calculator to check the tax and final amount again.", ja: "請求書を送る前に、電卓で税額と最終金額をもう一度確認します。", zh: "寄出請款單前，我用計算機再次確認稅額和最後金額。", cefrLevel: "B1" },
    ],
    relatedWords: ["invoice", "notepad", "computer"],
    ja: "電卓",
    jaReading: "でんたく",
    jaReadingSegments: [{ text: "電卓", ruby: "でんたく" }],
  },
  {
    id: "clipboard",
    word: "clipboard",
    chinese: "板夾",
    chineseDefinition: "上方裝有夾具、可固定紙張並提供硬質書寫平面的薄板。",
    category: "office",
    partOfSpeech: "noun",
    pronunciation: "/ˈklɪpˌbɔːrd/",
    definitions: definitions(
      "板夾",
      "A rigid board with a clip that holds papers in place while someone writes.",
      "「クリップボード」とは、上部の金具で紙を固定し、そのまま書き込める硬い板です。",
    ),
    examples: [
      { en: "Attach the form to the clipboard.", ja: "用紙をクリップボードに挟みます。", zh: "把表格夾在板夾上。", cefrLevel: "A2" },
      { en: "While checking the shelves, the employee wrote notes on the clipboard without returning to the desk.", ja: "棚を確認しながら、担当者は机に戻らずクリップボードの紙へメモしました。", zh: "檢查架子時，員工直接在板夾上的紙做筆記，不必回到桌邊。", cefrLevel: "B1" },
    ],
    relatedWords: ["paper", "document", "pen"],
    ja: "クリップボード",
    jaReading: "クリップボード",
    jaReadingSegments: null,
  },
  {
    id: "document-tray",
    word: "document tray",
    chinese: "文件盤",
    chineseDefinition: "放在桌上、用來分層收納待處理或已完成 A4 文件的淺盤。",
    category: "office",
    partOfSpeech: "noun",
    pronunciation: "/ˈdɑː.kjə.mənt ˌtreɪ/",
    definitions: definitions(
      "文件盤",
      "A shallow desktop tray used to sort and store papers or documents.",
      "「書類トレー」とは、机の上で未処理や処理済みの書類を分けて置く浅いトレーです。",
    ),
    examples: [
      { en: "Put the completed forms in the document tray.", ja: "記入済みの用紙を書類トレーに入れます。", zh: "把填好的表格放進文件盤。", cefrLevel: "A2" },
      { en: "To avoid missing a deadline, I separate incoming and finished documents into different trays.", ja: "締め切りを見落とさないように、届いた書類と処理済みの書類を別のトレーに分けています。", zh: "為了避免錯過期限，我把收到和處理完的文件分放在不同文件盤。", cefrLevel: "B1" },
    ],
    relatedWords: ["document", "folder", "desk-organizer"],
    ja: "書類トレー",
    jaReading: "しょるいトレー",
    jaReadingSegments: [{ text: "書類", ruby: "しょるい" }, { text: "トレー", ruby: null }],
  },
  {
    id: "convex-traffic-mirror",
    word: "convex traffic mirror",
    chinese: "道路反射鏡",
    chineseDefinition: "設在視線受阻的彎道或路口，以凸面鏡擴大視野並協助查看來車的道路設施。",
    category: "street",
    partOfSpeech: "noun",
    pronunciation: "/ˈkɑːn.veks ˈtræf.ɪk ˌmɪr.ɚ/",
    definitions: definitions(
      "道路反射鏡",
      "A convex roadside mirror that helps people see traffic around a blind corner or intersection.",
      "「カーブミラー」とは、見通しの悪い曲がり角や交差点で、近づく車などを確認するための凸面鏡です。",
    ),
    examples: [
      { en: "Check the convex traffic mirror before turning.", ja: "曲がる前にカーブミラーを確認します。", zh: "轉彎前先查看道路反射鏡。", cefrLevel: "A2" },
      { en: "Because the corner is hard to see around, slow down and use the mirror to check for bicycles.", ja: "見通しの悪い角なので、速度を落とし、カーブミラーで自転車が来ていないか確認します。", zh: "因為這個轉角視線不佳，要放慢速度並利用反射鏡確認有沒有自行車靠近。", cefrLevel: "B1" },
    ],
    relatedWords: ["intersection", "corner", "traffic-sign"],
    ja: "カーブミラー",
    jaReading: "カーブミラー",
    jaReadingSegments: null,
  },
  {
    id: "bollard",
    word: "bollard",
    chinese: "防撞柱",
    chineseDefinition: "設在人行道、道路邊緣或入口處，用來阻止車輛進入並保護行人的短柱。",
    category: "street",
    partOfSpeech: "noun",
    pronunciation: "/ˈbɑː.lɚd/",
    definitions: definitions(
      "防撞柱",
      "A short sturdy post used to block vehicles from entering a pedestrian or restricted area.",
      "「ボラード」とは、車の進入を防ぎ、歩行者空間を守るために道路や入口に設ける短い柱です。",
    ),
    examples: [
      { en: "Short bollards stand along the sidewalk.", ja: "歩道に沿って短いボラードが立っています。", zh: "人行道旁立著一排短防撞柱。", cefrLevel: "A2" },
      { en: "The bollards keep cars out of the pedestrian area while leaving enough space for wheelchairs.", ja: "ボラードは車の進入を防ぎながら、車いすが通れる幅を残しています。", zh: "防撞柱阻止汽車進入行人區，同時保留足夠空間讓輪椅通過。", cefrLevel: "B1" },
    ],
    relatedWords: ["sidewalk", "guardrail", "roadblock"],
    ja: "ボラード",
    jaReading: "ボラード",
    jaReadingSegments: null,
  },
  {
    id: "storm-drain-grate",
    word: "storm drain grate",
    chinese: "排水溝格柵",
    chineseDefinition: "覆蓋路旁排水溝、讓雨水流入並支撐行人或車輛通過的金屬格柵。",
    category: "street",
    partOfSpeech: "noun",
    pronunciation: "/ˈstɔːrm ˌdreɪn ˌɡreɪt/",
    definitions: definitions(
      "排水溝格柵",
      "A metal grid covering a roadside drain that lets rainwater flow through safely.",
      "「グレーチング」とは、雨水を流しながら人や車が通れるように側溝を覆う金属製の格子ふたです。",
    ),
    examples: [
      { en: "Rainwater flows through the storm drain grate.", ja: "雨水はグレーチングを通って側溝へ流れます。", zh: "雨水穿過排水溝格柵流進側溝。", cefrLevel: "A2" },
      { en: "When cycling in the rain, avoid crossing the grate at a shallow angle because the tire may slip.", ja: "雨の日に自転車で走るときは、タイヤが滑らないようにグレーチングを浅い角度で横切らないでください。", zh: "雨天騎自行車時，避免以太小的角度穿越格柵，因為輪胎可能打滑。", cefrLevel: "B1" },
    ],
    relatedWords: ["curb", "sidewalk", "drain"],
    ja: "グレーチング",
    jaReading: "グレーチング",
    jaReadingSegments: null,
  },
  {
    id: "shopping-cart-return",
    word: "shopping cart return",
    chinese: "購物車歸還處",
    chineseDefinition: "設在超市出口或停車場、供顧客把使用完的購物車集中推回的區域或欄架。",
    category: "supermarket",
    partOfSpeech: "noun",
    pronunciation: "/ˈʃɑː.pɪŋ ˌkɑːrt rɪˈtɝːn/",
    definitions: definitions(
      "購物車歸還處",
      "A marked rack or area where shoppers return carts after using them.",
      "「カート置き場」とは、買い物が終わった客が使用済みのカートをまとめて返す場所です。",
    ),
    examples: [
      { en: "Return the cart to the shopping cart return.", ja: "使い終わったカートをカート置き場に戻します。", zh: "把用完的購物車推回購物車歸還處。", cefrLevel: "A2" },
      { en: "After loading the groceries into the car, I nested the cart with the others at the cart return so it would not block the parking lot.", ja: "商品を車に積んだあと、駐車場の邪魔にならないようにカート置き場でほかのカートと重ねて戻しました。", zh: "把商品裝上車後，我在購物車歸還處把車套疊回其他購物車中，避免擋住停車場。", cefrLevel: "B1" },
    ],
    relatedWords: ["shopping-cart", "parking-lot", "supermarket"],
    ja: "カート置き場",
    jaReading: "カートおきば",
    jaReadingSegments: [{ text: "カート", ruby: null }, { text: "置き場", ruby: "おきば" }],
  },
  {
    id: "recycling-box",
    word: "recycling box",
    chinese: "資源回收箱",
    chineseDefinition: "設在超市入口附近，分別回收清洗後食品托盤、寶特瓶或紙盒等資源的容器。",
    category: "supermarket",
    partOfSpeech: "noun",
    pronunciation: "/ˌriːˈsaɪ.klɪŋ ˌbɑːks/",
    definitions: definitions(
      "資源回收箱",
      "A collection box at a store for clean recyclable items such as food trays or bottles.",
      "「リサイクルボックス」とは、店頭で食品トレーやペットボトルなどの資源を分別回収する箱です。",
    ),
    examples: [
      { en: "Put the clean food tray in the recycling box.", ja: "洗った食品トレーをリサイクルボックスに入れます。", zh: "把洗乾淨的食品托盤放進資源回收箱。", cefrLevel: "A2" },
      { en: "Before putting food trays in the supermarket's recycling box, rinse them and let them dry completely.", ja: "食品トレーをスーパーのリサイクルボックスに入れる前に、洗って完全に乾かします。", zh: "把食品托盤放進超市的資源回收箱前，先清洗並讓它們完全乾燥。", cefrLevel: "B1" },
    ],
    relatedWords: ["plastic-bag", "food-container", "supermarket"],
    ja: "リサイクルボックス",
    jaReading: "リサイクルボックス",
    jaReadingSegments: null,
  },
  {
    id: "barcode-scanner",
    word: "barcode scanner",
    chinese: "條碼掃描器",
    chineseDefinition: "在結帳時以光學方式讀取商品條碼，將商品與價格輸入收銀系統的裝置。",
    category: "supermarket",
    partOfSpeech: "noun",
    pronunciation: "/ˈbɑːr.koʊd ˌskæn.ɚ/",
    definitions: definitions(
      "條碼掃描器",
      "An optical device that reads product barcodes and sends the item information to a checkout system.",
      "「バーコードスキャナー」とは、商品のバーコードを読み取り、品名や価格をレジへ送る機器です。",
    ),
    examples: [
      { en: "Hold the barcode over the barcode scanner.", ja: "バーコードをスキャナーにかざします。", zh: "把條碼對準條碼掃描器。", cefrLevel: "A2" },
      { en: "The cashier turned the package slightly because the scanner could not read the wrinkled barcode.", ja: "しわになったバーコードを読み取れなかったので、店員は商品を少し傾けました。", zh: "因為掃描器讀不到起皺的條碼，收銀員把包裝稍微轉了個角度。", cefrLevel: "B1" },
    ],
    relatedWords: ["barcode", "checkout-counter", "self-checkout-machine"],
    ja: "バーコードスキャナー",
    jaReading: "バーコードスキャナー",
    jaReadingSegments: null,
  },
  {
    id: "train-strap",
    word: "train strap",
    chinese: "車廂吊環",
    chineseDefinition: "懸掛在電車或公車車廂內，讓站立乘客抓握以保持平衡的環形把手。",
    category: "transportation",
    partOfSpeech: "noun",
    pronunciation: "/ˈtreɪn ˌstræp/",
    definitions: definitions(
      "車廂吊環",
      "A hanging loop that standing passengers hold for balance on a train or bus.",
      "「つり革」とは、電車やバスで立っている乗客が、体を安定させるためにつかむ輪です。",
    ),
    examples: [
      { en: "Hold the train strap while the train is moving.", ja: "電車が動いている間はつり革につかまります。", zh: "列車行駛時抓好車廂吊環。", cefrLevel: "A2" },
      { en: "Because the train may stop suddenly, keep one hand on the strap until you reach your station.", ja: "電車が急に止まることがあるので、降りる駅まで片手でつり革につかまっていてください。", zh: "因為列車可能突然煞停，到站前請一直用一隻手抓著吊環。", cefrLevel: "B1" },
    ],
    relatedWords: ["train", "subway", "handrail"],
    ja: "つり革",
    jaReading: "つりかわ",
    jaReadingSegments: [{ text: "つり", ruby: null }, { text: "革", ruby: "かわ" }],
  },
  {
    id: "ticket-gate",
    word: "ticket gate",
    chinese: "自動驗票閘門",
    chineseDefinition: "設在車站出入口，讀取車票或交通卡並控制乘客通行的自動閘門。",
    category: "transportation",
    partOfSpeech: "noun",
    pronunciation: "/ˈtɪk.ɪt ˌɡeɪt/",
    definitions: definitions(
      "自動驗票閘門",
      "An automatic station gate that checks a ticket or transit card before allowing passage.",
      "「自動改札機」とは、乗車券や交通系ICカードを読み取り、駅の出入りを管理する機械です。",
    ),
    examples: [
      { en: "Tap your transit card on the ticket gate.", ja: "自動改札機に交通系ICカードをタッチします。", zh: "把交通卡輕觸自動驗票閘門。", cefrLevel: "A2" },
      { en: "When the gate did not open because my balance was low, I recharged the card at the nearby machine.", ja: "残高不足で改札が開かなかったので、近くの機械でカードにチャージしました。", zh: "因為餘額不足閘門沒有開，我在旁邊的機器替卡片加值。", cefrLevel: "B1" },
    ],
    relatedWords: ["station", "access-card", "subway"],
    ja: "自動改札機",
    jaReading: "じどうかいさつき",
    jaReadingSegments: [{ text: "自動改札機", ruby: "じどうかいさつき" }],
  },
  {
    id: "platform-screen-door",
    word: "platform screen door",
    chinese: "月台閘門",
    chineseDefinition: "設在月台邊緣，列車停妥後才開啟，以降低乘客墜落軌道風險的安全門。",
    category: "transportation",
    partOfSpeech: "noun",
    pronunciation: "/ˈplæt.fɔːrm ˈskriːn ˌdɔːr/",
    definitions: definitions(
      "月台閘門",
      "A safety barrier at a station platform that opens only when a train is correctly stopped.",
      "「ホームドア」とは、線路への転落を防ぐためにホームの端へ設置され、列車の到着時に開く扉です。",
    ),
    examples: [
      { en: "Wait behind the platform screen doors.", ja: "ホームドアの手前で電車を待ちます。", zh: "在月台閘門後方等車。", cefrLevel: "A2" },
      { en: "After the train stops in the correct position, the platform doors open together with the train doors.", ja: "電車が正しい位置に止まると、車両のドアと一緒にホームドアが開きます。", zh: "列車停在正確位置後，月台閘門會和車門一起開啟。", cefrLevel: "B1" },
    ],
    relatedWords: ["station", "train", "platform"],
    ja: "ホームドア",
    jaReading: "ホームドア",
    jaReadingSegments: null,
  },
  {
    id: "furikake",
    word: "furikake",
    chinese: "日式香鬆",
    chineseDefinition: "以海苔、芝麻、魚鬆或蛋粒等乾燥材料混合，撒在白飯上食用的日式調味料。",
    category: "seasonings",
    partOfSpeech: "noun",
    pronunciation: "/ˌfʊr.ɪˈkɑː.keɪ/",
    definitions: definitions(
      "日式香鬆",
      "A dry Japanese seasoning mixture sprinkled over cooked rice.",
      "「ふりかけ」とは、のりやごま、魚、卵などを混ぜ、ご飯にかけて食べる乾燥調味料です。",
    ),
    examples: [
      { en: "Sprinkle furikake over the rice.", ja: "ご飯にふりかけをかけます。", zh: "把日式香鬆撒在飯上。", cefrLevel: "A2" },
      { en: "When I pack lunch, I add the furikake just before eating so it stays crisp.", ja: "お弁当を作るときは、食感が残るように食べる直前にふりかけをかけます。", zh: "準備便當時，我會在吃之前才撒上日式香鬆，讓口感保持酥脆。", cefrLevel: "B1" },
    ],
    relatedWords: ["rice", "sesame-seeds", "nori"],
    ja: "ふりかけ",
    jaReading: "ふりかけ",
    jaReadingSegments: null,
  },
  {
    id: "tonkatsu-sauce",
    word: "tonkatsu sauce",
    chinese: "炸豬排醬",
    chineseDefinition: "以蔬果、醋與香辛料調製，質地濃稠且常搭配日式炸豬排或其他炸物的醬汁。",
    category: "seasonings",
    partOfSpeech: "noun",
    pronunciation: "/tɑːnˈkɑːt.suː ˌsɔːs/",
    definitions: definitions(
      "炸豬排醬",
      "A thick, sweet and savory Japanese sauce commonly served with breaded pork cutlets.",
      "「とんかつソース」とは、野菜や果物、酢、香辛料などで作る、とんかつに合う濃厚なソースです。",
    ),
    examples: [
      { en: "Pour tonkatsu sauce over the pork cutlet.", ja: "とんかつにとんかつソースをかけます。", zh: "把炸豬排醬淋在豬排上。", cefrLevel: "A2" },
      { en: "To keep the breading crisp, I serve the tonkatsu sauce in a small dish on the side.", ja: "衣をさくさくのままにするため、とんかつソースは小皿に入れて添えます。", zh: "為了保持外皮酥脆，我把炸豬排醬另外裝在小碟裡。", cefrLevel: "B1" },
    ],
    relatedWords: ["ketchup", "mustard", "worcestershire-sauce"],
    ja: "とんかつソース",
    jaReading: "とんかつソース",
    jaReadingSegments: null,
  },
  {
    id: "yuzu-kosho",
    word: "yuzu kosho",
    chinese: "柚子胡椒",
    chineseDefinition: "把柚子皮、辣椒和鹽磨合而成，帶有柑橘香氣與辛辣味的日式調味醬。",
    category: "seasonings",
    partOfSpeech: "noun",
    pronunciation: "/ˈjuː.zuː ˌkoʊ.ʃoʊ/",
    definitions: definitions(
      "柚子胡椒",
      "A Japanese condiment made from yuzu peel, chili peppers, and salt.",
      "「柚子こしょう」とは、柚子と唐辛子をすりつぶして塩を加えた、香りと辛みのある調味料です。",
    ),
    examples: [
      { en: "Add a little yuzu kosho to the hot pot.", ja: "鍋料理に柚子こしょうを少し加えます。", zh: "在火鍋裡加一點柚子胡椒。", cefrLevel: "A2" },
      { en: "When eating grilled chicken, I mix yuzu kosho into ponzu sauce for a fresh, spicy dip.", ja: "焼き鳥を食べるときは、柚子こしょうをポン酢に混ぜて、香りのよい辛いつけだれにします。", zh: "吃烤雞時，我把柚子胡椒拌進柚子醋醬油，做成清香帶辣的蘸醬。", cefrLevel: "B1" },
    ],
    relatedWords: ["ponzu-sauce", "wasabi", "chili-paste"],
    ja: "柚子こしょう",
    jaReading: "ゆずこしょう",
    jaReadingSegments: [{ text: "柚子", ruby: "ゆず" }, { text: "こしょう", ruby: null }],
  },
];

export const MAIN_WORD_EXPANSION_BATCH_2_WORDS = EXPANSION_ENTRIES.map(
  ({ ja: _ja, jaReading: _jaReading, jaReadingSegments: _segments, ...word }) => word,
);

export const MAIN_WORD_EXPANSION_BATCH_2_CORRECTIONS: MainWordCorrection[] =
  EXPANSION_ENTRIES.map(({ id, definitions, ja, jaReading, jaReadingSegments }) => {
    const seededJaDefinition = definitions.find(({ language }) => language === "ja")!.definition;
    return {
      id,
      oldJa: seededJaDefinition,
      ja,
      oldJaReading: jaReading,
      jaReading,
      jaReadingSegments,
      jaDefinition: { old: seededJaDefinition, value: seededJaDefinition },
    };
  });

export const MAIN_WORD_EXPANSION_BATCH_2_EXAMPLE_PAIRS: MainWordExamplePair[] =
  EXPANSION_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));

export const MAIN_WORD_EXPANSION_BATCH_2_IDS = EXPANSION_ENTRIES.map(({ id }) => id);
