import type { CEFRLevel, Definition } from "@/types";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type FruitExample = { en: string; ja: string; zh: string; cefrLevel: CEFRLevel };
type FruitEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "fruits";
  partOfSpeech: "noun";
  pronunciation: string;
  definitions: Definition[];
  examples: [FruitExample, FruitExample];
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

const FRUIT_ENTRIES: FruitEntry[] = [
  {
    id: "apple", word: "apple", chinese: "蘋果", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈæp.əl/",
    chineseDefinition: "果皮常為紅色、綠色或黃色，果肉清脆，可直接食用或用來做甜點的圓形水果。",
    definitions: definitions("蘋果", "A round, crisp fruit with red, green, or yellow skin, eaten fresh or used in cooking.", "「りんご」とは、赤や緑、黄色の皮と歯ごたえのある果肉を持ち、生でも料理でも食べる丸い果物です。"),
    examples: [
      { en: "I slice an apple for breakfast.", ja: "朝ごはんにりんごを切ります。", zh: "我切一顆蘋果當早餐。", cefrLevel: "A2" },
      { en: "If the apples are still firm, I keep them in the refrigerator so they stay fresh longer.", ja: "りんごがまだ硬ければ、長く新鮮に保てるように冷蔵庫に入れておきます。", zh: "如果蘋果還很硬，我會放進冰箱，讓它們保鮮久一點。", cefrLevel: "B1" },
    ],
    relatedWords: ["pear", "peach", "japanese-pear"], ja: "りんご", jaReading: "りんご", jaReadingSegments: null,
  },
  {
    id: "banana", word: "banana", chinese: "香蕉", category: "fruits", partOfSpeech: "noun", pronunciation: "/bəˈnæn.ə/",
    chineseDefinition: "外皮成熟後通常呈黃色、果肉柔軟香甜，剝皮後即可食用的細長水果。",
    definitions: definitions("香蕉", "A long fruit with soft, sweet flesh and a peel that usually turns yellow when ripe.", "「バナナ」とは、熟すと黄色くなる皮と柔らかく甘い果肉を持ち、皮をむいて食べる細長い果物です。"),
    examples: [
      { en: "I put a banana in my lunch bag.", ja: "ランチバッグにバナナを一本入れます。", zh: "我在午餐袋裡放一根香蕉。", cefrLevel: "A2" },
      { en: "Because the bananas were getting soft, I used them to make a smoothie.", ja: "バナナが柔らかくなってきたので、スムージーにして飲みました。", zh: "因為香蕉開始變軟，我就拿來打成果昔。", cefrLevel: "B1" },
    ],
    relatedWords: ["mango", "pineapple", "papaya"], ja: "バナナ", jaReading: "バナナ", jaReadingSegments: null,
  },
  {
    id: "mandarin-orange", word: "mandarin orange", chinese: "橘子", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈmæn.dɚ.ɪn ˌɔːr.ɪndʒ/",
    chineseDefinition: "體型較小、外皮容易剝開，果肉分成多瓣的甜味柑橘，日本冬季常見。",
    definitions: definitions("橘子", "A small, sweet citrus fruit with loose skin that is easy to peel and flesh divided into segments.", "「みかん」とは、小さくて皮がむきやすく、房に分かれた甘い果肉を持つ、日本の冬によく見かけるかんきつ類です。"),
    examples: [
      { en: "I peel a mandarin orange after dinner.", ja: "夕食の後にみかんの皮をむきます。", zh: "我晚餐後會剝一顆橘子。", cefrLevel: "A2" },
      { en: "When mandarins are in season, I buy a bag because everyone at home eats them.", ja: "みかんが旬になると、家族みんなが食べるので袋で買います。", zh: "橘子當季時，因為全家都會吃，我會買一整袋。", cefrLevel: "B1" },
    ],
    relatedWords: ["orange", "grapefruit", "kumquat"], ja: "みかん", jaReading: "みかん", jaReadingSegments: null,
  },
  {
    id: "orange", word: "orange", chinese: "柳橙", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈɔːr.ɪndʒ/",
    chineseDefinition: "果皮較緊實、圓形多汁的柑橘類水果，常直接食用或榨成果汁。",
    definitions: definitions("柳橙", "A round, juicy citrus fruit with firm orange skin, eaten fresh or squeezed for juice.", "「オレンジ」とは、張りのある橙色の皮と果汁の多い果肉を持ち、生で食べたりジュースにしたりする丸いかんきつ類です。"),
    examples: [
      { en: "I squeeze an orange for fresh juice.", ja: "オレンジを搾って生ジュースを作ります。", zh: "我榨一顆柳橙做新鮮果汁。", cefrLevel: "A2" },
      { en: "Before putting the orange segments in the lunch box, I remove the seeds.", ja: "オレンジの房をお弁当箱に入れる前に、種を取り除きます。", zh: "把柳橙瓣放進便當盒前，我會先去掉籽。", cefrLevel: "B1" },
    ],
    relatedWords: ["mandarin-orange", "grapefruit", "lemon"], ja: "オレンジ", jaReading: "オレンジ", jaReadingSegments: null,
  },
  {
    id: "grape", word: "grape", chinese: "葡萄", category: "fruits", partOfSpeech: "noun", pronunciation: "/ɡreɪp/",
    chineseDefinition: "一顆顆圓形或橢圓形果實聚成串，常見紫色、綠色或紅色，可連皮或去皮食用。",
    definitions: definitions("葡萄", "A small round or oval fruit that grows in bunches and may be purple, green, or red.", "「ぶどう」とは、小さな丸い実が房になって育つ果物で、紫、緑、赤などの色があります。"),
    examples: [
      { en: "I wash the grapes before eating them.", ja: "ぶどうを食べる前に洗います。", zh: "我吃葡萄前會先洗乾淨。", cefrLevel: "A2" },
      { en: "Since these grapes have no seeds, I can put them straight into the children's snack box.", ja: "このぶどうは種がないので、子どものおやつ箱にそのまま入れられます。", zh: "因為這些葡萄沒有籽，我可以直接放進孩子的點心盒。", cefrLevel: "B1" },
    ],
    relatedWords: ["blueberry", "cherry", "strawberry"], ja: "ぶどう", jaReading: "ぶどう", jaReadingSegments: null,
  },
  {
    id: "strawberry", word: "strawberry", chinese: "草莓", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈstrɔːˌber.i/",
    chineseDefinition: "表面有細小種子、頂端有綠葉，成熟時呈紅色並帶酸甜味的莓果。",
    definitions: definitions("草莓", "A red, sweet-tart berry with tiny seeds on its surface and green leaves at the top.", "「いちご」とは、表面に小さな種があり、上に緑のへたが付いた、赤くて甘酸っぱい果物です。"),
    examples: [
      { en: "I add strawberries to my yogurt.", ja: "ヨーグルトにいちごを入れます。", zh: "我在優格裡加草莓。", cefrLevel: "A2" },
      { en: "After washing the strawberries, I remove the green tops and cut the large ones in half.", ja: "いちごを洗った後、へたを取って、大きいものは半分に切ります。", zh: "洗好草莓後，我會去掉蒂頭，大顆的再切成兩半。", cefrLevel: "B1" },
    ],
    relatedWords: ["blueberry", "raspberry", "cherry"], ja: "いちご", jaReading: "いちご", jaReadingSegments: null,
  },
  {
    id: "peach", word: "peach", chinese: "桃子", category: "fruits", partOfSpeech: "noun", pronunciation: "/piːtʃ/",
    chineseDefinition: "果皮帶細毛、果肉柔軟多汁，中央有一顆大果核的圓形水果。",
    definitions: definitions("桃子", "A round, juicy fruit with soft flesh, slightly fuzzy skin, and one large stone in the center.", "「桃」とは、うぶ毛のある皮と柔らかく果汁の多い果肉を持ち、中央に大きな種が一つある丸い果物です。"),
    examples: [
      { en: "This peach is soft and ready to eat.", ja: "この桃は柔らかくて食べ頃です。", zh: "這顆桃子已經變軟，可以吃了。", cefrLevel: "A2" },
      { en: "Because the peach bruises easily, I carry it home in a separate bag.", ja: "桃は傷みやすいので、ほかの荷物と分けて持ち帰ります。", zh: "因為桃子很容易碰傷，我會另外裝一袋帶回家。", cefrLevel: "B1" },
    ],
    relatedWords: ["apricot", "plum", "apple"], ja: "桃", jaReading: "もも", jaReadingSegments: [{ text: "桃", ruby: "もも" }],
  },
  {
    id: "japanese-pear", word: "Japanese pear", chinese: "日本梨", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˌdʒæp.əˈniːz ˈper/",
    chineseDefinition: "外形接近圓形、果皮多為黃褐色，果肉清脆且水分豐富的梨。",
    definitions: definitions("日本梨", "A round, crisp, very juicy pear with yellow-brown skin, commonly grown and eaten in Japan.", "「梨」とは、丸い形と黄褐色の皮を持ち、しゃきしゃきして果汁が多い、日本でよく食べられる果物です。"),
    examples: [
      { en: "I chill the Japanese pear before serving it.", ja: "梨を食べる前に冷やします。", zh: "我會先把日本梨冰過再上桌。", cefrLevel: "A2" },
      { en: "The Japanese pear was so juicy that I cut it over a plate to catch the juice.", ja: "梨はとてもみずみずしかったので、果汁がこぼれないように皿の上で切りました。", zh: "日本梨水分很多，所以我在盤子上切，免得果汁滴出來。", cefrLevel: "B1" },
    ],
    relatedWords: ["pear", "apple", "persimmon"], ja: "梨", jaReading: "なし", jaReadingSegments: [{ text: "梨", ruby: "なし" }],
  },
  {
    id: "pear", word: "pear", chinese: "西洋梨", category: "fruits", partOfSpeech: "noun", pronunciation: "/per/",
    chineseDefinition: "上窄下圓、果肉成熟後柔軟香甜的梨，外形與圓形的日本梨不同。",
    definitions: definitions("西洋梨", "A sweet pear with a narrow neck and rounded base whose flesh softens as it ripens.", "「洋梨」とは、上が細く下が丸い形をしており、熟すと果肉が柔らかく甘くなる果物です。"),
    examples: [
      { en: "The pear needs two more days to ripen.", ja: "この洋梨は食べ頃まであと二日です。", zh: "這顆西洋梨還要兩天才會熟。", cefrLevel: "A2" },
      { en: "When the pear gives slightly near the stem, I know it is ready to eat.", ja: "洋梨の軸の近くを押して少し柔らかければ、食べ頃だと分かります。", zh: "輕按西洋梨的果梗附近，如果有點軟，我就知道可以吃了。", cefrLevel: "B1" },
    ],
    relatedWords: ["japanese-pear", "apple", "fig"], ja: "洋梨", jaReading: "ようなし", jaReadingSegments: [{ text: "洋梨", ruby: "ようなし" }],
  },
  {
    id: "persimmon", word: "persimmon", chinese: "柿子", category: "fruits", partOfSpeech: "noun", pronunciation: "/pɚˈsɪm.ən/",
    chineseDefinition: "成熟時呈橙色、頂部有大片綠色果萼，果肉可爽脆也可柔軟的秋季水果。",
    definitions: definitions("柿子", "An orange autumn fruit with a broad green calyx, eaten while crisp or after it becomes soft.", "「柿」とは、大きな緑のへたが付いた橙色の秋の果物で、硬いままでも柔らかく熟してからでも食べられます。"),
    examples: [
      { en: "I peel the persimmon and cut it into wedges.", ja: "柿の皮をむいて、くし形に切ります。", zh: "我把柿子削皮後切成瓣。", cefrLevel: "A2" },
      { en: "If the persimmon is too firm, I leave it at room temperature until it becomes sweeter.", ja: "柿が硬すぎるときは、甘くなるまで常温に置いておきます。", zh: "如果柿子太硬，我會放在室溫下，等它變甜。", cefrLevel: "B1" },
    ],
    relatedWords: ["apple", "japanese-pear", "mandarin-orange"], ja: "柿", jaReading: "かき", jaReadingSegments: [{ text: "柿", ruby: "かき" }],
  },
  {
    id: "watermelon", word: "watermelon", chinese: "西瓜", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈwɑː.t̬ɚˌmel.ən/",
    chineseDefinition: "外皮綠色帶條紋，果肉通常為紅色且水分多，常在夏天冰涼食用的大型水果。",
    definitions: definitions("西瓜", "A large fruit with a striped green rind and juicy, usually red flesh, often eaten chilled in summer.", "「すいか」とは、しま模様の緑の皮と水分の多い赤い果肉を持ち、夏に冷やしてよく食べる大きな果物です。"),
    examples: [
      { en: "We eat cold watermelon on hot days.", ja: "暑い日は冷たいすいかを食べます。", zh: "天氣熱時我們會吃冰涼的西瓜。", cefrLevel: "A2" },
      { en: "Since the watermelon was too large for the refrigerator, I cut it before storing it there.", ja: "すいかは冷蔵庫に入らないほど大きかったので、切ってから保存しました。", zh: "因為西瓜大到放不進冰箱，我先切開再冷藏。", cefrLevel: "B1" },
    ],
    relatedWords: ["melon", "pineapple", "dragon-fruit"], ja: "すいか", jaReading: "すいか", jaReadingSegments: null,
  },
  {
    id: "melon", word: "melon", chinese: "甜瓜", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈmel.ən/",
    chineseDefinition: "外皮可能帶網紋，果肉柔軟香甜，常切片或作為甜點食用的圓形水果。",
    definitions: definitions("甜瓜", "A round, fragrant fruit with sweet soft flesh and sometimes a netted rind.", "「メロン」とは、網目のある皮を持つものもあり、香りがよくて柔らかく甘い果肉を切って食べる丸い果物です。"),
    examples: [
      { en: "I cut the melon into six slices.", ja: "メロンを六つに切り分けます。", zh: "我把甜瓜切成六片。", cefrLevel: "A2" },
      { en: "Although the melon smelled sweet, I waited another day before cutting it.", ja: "メロンは甘い香りがしましたが、切る前にもう一日待ちました。", zh: "雖然甜瓜聞起來很香甜，我還是多等一天才切。", cefrLevel: "B1" },
    ],
    relatedWords: ["watermelon", "papaya", "mango"], ja: "メロン", jaReading: "メロン", jaReadingSegments: null,
  },
  {
    id: "pineapple", word: "pineapple", chinese: "鳳梨", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈpaɪnˌæp.əl/",
    chineseDefinition: "外皮粗糙有菱形紋、頂端長有尖葉，果肉黃色並帶酸甜味的熱帶水果。",
    definitions: definitions("鳳梨", "A tropical fruit with rough patterned skin, a spiky crown, and sweet-tart yellow flesh.", "「パイナップル」とは、模様のある硬い皮と先の尖った葉を持ち、黄色い果肉が甘酸っぱい熱帯の果物です。"),
    examples: [
      { en: "I remove the pineapple skin with a knife.", ja: "包丁でパイナップルの皮をむきます。", zh: "我用刀削掉鳳梨皮。", cefrLevel: "A2" },
      { en: "After cutting the pineapple into bite-sized pieces, I store them in a covered container.", ja: "パイナップルを一口大に切った後、ふた付きの容器に入れて保存します。", zh: "把鳳梨切成一口大小後，我會放進有蓋容器保存。", cefrLevel: "B1" },
    ],
    relatedWords: ["mango", "papaya", "banana"], ja: "パイナップル", jaReading: "パイナップル", jaReadingSegments: null,
  },
  {
    id: "kiwi-fruit", word: "kiwi fruit", chinese: "奇異果", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈkiː.wi ˌfruːt/",
    chineseDefinition: "外皮褐色帶細毛，果肉多為綠色或黃色，中央周圍排列許多小黑籽的水果。",
    definitions: definitions("奇異果", "A fruit with fuzzy brown skin, green or yellow flesh, and many tiny black seeds around a pale center.", "「キウイフルーツ」とは、茶色いうぶ毛のある皮と緑や黄色の果肉を持ち、中心の周りに小さな黒い種が並ぶ果物です。"),
    examples: [
      { en: "I eat the kiwi fruit with a spoon.", ja: "キウイフルーツをスプーンで食べます。", zh: "我用湯匙吃奇異果。", cefrLevel: "A2" },
      { en: "If the kiwi fruit is still hard, I leave it beside an apple to help it ripen.", ja: "キウイフルーツがまだ硬ければ、熟しやすくするためにりんごのそばに置きます。", zh: "如果奇異果還很硬，我會放在蘋果旁邊幫助它熟成。", cefrLevel: "B1" },
    ],
    relatedWords: ["strawberry", "passion-fruit", "dragon-fruit"], ja: "キウイフルーツ", jaReading: "キウイフルーツ", jaReadingSegments: null,
  },
  {
    id: "lemon", word: "lemon", chinese: "檸檬", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈlem.ən/",
    chineseDefinition: "果皮鮮黃、兩端略尖，果汁酸味強烈，常用來調味或加入飲料的柑橘類水果。",
    definitions: definitions("檸檬", "A bright yellow citrus fruit with very sour juice, commonly used to flavor food and drinks.", "「レモン」とは、明るい黄色の皮と強い酸味の果汁を持ち、料理や飲み物の風味付けに使うかんきつ類です。"),
    examples: [
      { en: "I add a slice of lemon to my tea.", ja: "紅茶にレモンを一切れ入れます。", zh: "我在紅茶裡放一片檸檬。", cefrLevel: "A2" },
      { en: "After squeezing the lemon over the fish, I put the unused half in the refrigerator.", ja: "魚にレモンを搾った後、残った半分を冷蔵庫に入れます。", zh: "把檸檬汁擠在魚上後，我會把剩下的一半放進冰箱。", cefrLevel: "B1" },
    ],
    relatedWords: ["yuzu", "orange", "grapefruit"], ja: "レモン", jaReading: "レモン", jaReadingSegments: null,
  },
  {
    id: "grapefruit", word: "grapefruit", chinese: "葡萄柚", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈɡreɪpˌfruːt/",
    chineseDefinition: "體型較大的柑橘類水果，果皮多為黃色，果肉有白色或粉紅色並帶苦酸味。",
    definitions: definitions("葡萄柚", "A large yellow-skinned citrus fruit with white or pink flesh and a bitter, tart taste.", "「グレープフルーツ」とは、黄色い皮と白やピンクの果肉を持ち、苦みと酸味がある大きなかんきつ類です。"),
    examples: [
      { en: "I scoop out the grapefruit with a spoon.", ja: "グレープフルーツをスプーンですくって食べます。", zh: "我用湯匙挖葡萄柚來吃。", cefrLevel: "A2" },
      { en: "Because grapefruit can affect some medicines, I checked the label before eating it.", ja: "グレープフルーツは薬に影響することがあるので、食べる前に注意書きを確認しました。", zh: "因為葡萄柚可能影響某些藥物，我吃之前先看了注意事項。", cefrLevel: "B1" },
    ],
    relatedWords: ["orange", "lemon", "mandarin-orange"], ja: "グレープフルーツ", jaReading: "グレープフルーツ", jaReadingSegments: null,
  },
  {
    id: "cherry", word: "cherry", chinese: "櫻桃", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈtʃer.i/",
    chineseDefinition: "體型小、成熟時多呈紅色，有細長果梗且中央有硬核的水果。",
    definitions: definitions("櫻桃", "A small, usually red fruit with a long stem and a hard stone in the center.", "「さくらんぼ」とは、細長い軸が付き、中央に硬い種が一つある、小さくて赤い果物です。"),
    examples: [
      { en: "I remove the cherry pits before baking.", ja: "お菓子を焼く前にさくらんぼの種を取ります。", zh: "烘焙前我會先去掉櫻桃核。", cefrLevel: "A2" },
      { en: "When cherries are in season, I buy a small pack and eat them the same day.", ja: "さくらんぼが旬の時期は、小さいパックを買ってその日のうちに食べます。", zh: "櫻桃當季時，我會買一小盒並在當天吃完。", cefrLevel: "B1" },
    ],
    relatedWords: ["grape", "strawberry", "plum"], ja: "さくらんぼ", jaReading: "さくらんぼ", jaReadingSegments: null,
  },
  {
    id: "japanese-plum", word: "Japanese plum", chinese: "青梅", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˌdʒæp.əˈniːz ˈplʌm/",
    chineseDefinition: "成熟前呈綠色、味道很酸，常用來製作梅酒、梅乾或糖漿的日本梅果。",
    definitions: definitions("青梅", "A small, very tart Japanese fruit, often green when harvested and used for plum wine, pickles, or syrup.", "「梅」とは、収穫時には緑色で酸味が強く、梅酒や梅干し、シロップ作りに使われる小さな果物です。"),
    examples: [
      { en: "I wash the Japanese plums for syrup.", ja: "シロップ用の梅を洗います。", zh: "我把做糖漿用的青梅洗乾淨。", cefrLevel: "A2" },
      { en: "Before putting the Japanese plums in the jar, I remove each stem with a toothpick.", ja: "梅を瓶に入れる前に、つまようじで一つずつへたを取ります。", zh: "把青梅放進瓶子前，我會用牙籤逐顆去蒂。", cefrLevel: "B1" },
    ],
    relatedWords: ["plum", "apricot", "yuzu"], ja: "梅", jaReading: "うめ", jaReadingSegments: [{ text: "梅", ruby: "うめ" }],
  },
  {
    id: "plum", word: "plum", chinese: "李子", category: "fruits", partOfSpeech: "noun", pronunciation: "/plʌm/",
    chineseDefinition: "果皮光滑、常為紫紅或紅色，果肉多汁且中央有一顆硬核的圓形水果。",
    definitions: definitions("李子", "A round, juicy fruit with smooth red or purple skin and one hard stone in the center.", "「すもも」とは、赤や紫の滑らかな皮と果汁の多い果肉を持ち、中央に硬い種が一つある丸い果物です。"),
    examples: [
      { en: "This plum tastes sweet and a little sour.", ja: "このすももは甘くて少し酸っぱいです。", zh: "這顆李子甜中帶一點酸。", cefrLevel: "A2" },
      { en: "Since the plums were very ripe, I cooked them into jam instead of carrying them to work.", ja: "すももがよく熟していたので、職場に持って行かずジャムにしました。", zh: "因為李子很熟了，我沒有帶去上班，而是煮成果醬。", cefrLevel: "B1" },
    ],
    relatedWords: ["japanese-plum", "peach", "apricot"], ja: "すもも", jaReading: "すもも", jaReadingSegments: null,
  },
  {
    id: "loquat", word: "loquat", chinese: "枇杷", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈloʊ.kwɑːt/",
    chineseDefinition: "外形小而橢圓、果皮橙黃，果肉柔軟且含有數顆大籽的春末水果。",
    definitions: definitions("枇杷", "A small oval orange fruit with soft flesh and several large seeds, available around late spring.", "「びわ」とは、小さな楕円形で橙色の皮を持ち、柔らかい果肉の中に大きな種がいくつかある春の終わり頃の果物です。"),
    examples: [
      { en: "I peel the loquat with my fingers.", ja: "びわの皮を指でむきます。", zh: "我用手指剝枇杷皮。", cefrLevel: "A2" },
      { en: "After removing the large seeds from the loquat, I cut the flesh into small pieces for the children.", ja: "びわの大きな種を取った後、子ども用に果肉を小さく切ります。", zh: "去掉枇杷的大籽後，我會把果肉切小塊給孩子吃。", cefrLevel: "B1" },
    ],
    relatedWords: ["apricot", "pear", "fig"], ja: "びわ", jaReading: "びわ", jaReadingSegments: null,
  },
  {
    id: "fig", word: "fig", chinese: "無花果", category: "fruits", partOfSpeech: "noun", pronunciation: "/fɪɡ/",
    chineseDefinition: "外皮常呈紫色或綠色，切開後可見柔軟的紅色果肉與許多細小種子的水果。",
    definitions: definitions("無花果", "A soft fruit with purple or green skin and a red, finely seeded interior.", "「いちじく」とは、紫や緑の皮を持ち、切ると柔らかい赤い果肉と細かな種が見える果物です。"),
    examples: [
      { en: "I cut the fig in half for dessert.", ja: "デザートにいちじくを半分に切ります。", zh: "我把無花果切半當甜點。", cefrLevel: "A2" },
      { en: "Because the fig was very soft, I carried it in a container so it would not be crushed.", ja: "いちじくがとても柔らかかったので、つぶれないように容器に入れて運びました。", zh: "因為無花果很軟，我把它裝在容器裡帶走，免得壓壞。", cefrLevel: "B1" },
    ],
    relatedWords: ["pomegranate", "pear", "loquat"], ja: "いちじく", jaReading: "いちじく", jaReadingSegments: null,
  },
  {
    id: "mango", word: "mango", chinese: "芒果", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈmæŋ.ɡoʊ/",
    chineseDefinition: "果皮成熟後常帶黃色或紅色，果肉金黃香甜，中央有一顆扁平大核的熱帶水果。",
    definitions: definitions("芒果", "A tropical fruit with fragrant golden flesh, colorful skin, and one large flat stone.", "「マンゴー」とは、香りのよい黄色い果肉と色づいた皮を持ち、中央に平たい大きな種が一つある熱帯の果物です。"),
    examples: [
      { en: "I cut the mango around the stone.", ja: "マンゴーの種を避けて切ります。", zh: "我沿著果核切開芒果。", cefrLevel: "A2" },
      { en: "When the mango started to smell sweet, I chilled it before serving it for dessert.", ja: "マンゴーから甘い香りがしてきたので、デザートに出す前に冷やしました。", zh: "芒果開始散發甜香後，我先冰過再當甜點上桌。", cefrLevel: "B1" },
    ],
    relatedWords: ["papaya", "pineapple", "banana"], ja: "マンゴー", jaReading: "マンゴー", jaReadingSegments: null,
  },
  {
    id: "papaya", word: "papaya", chinese: "木瓜", category: "fruits", partOfSpeech: "noun", pronunciation: "/pəˈpaɪ.ə/",
    chineseDefinition: "成熟時果皮黃綠、果肉橙紅，中央有大量黑色圓籽的熱帶水果。",
    definitions: definitions("木瓜", "A tropical fruit with orange-red flesh and a central cavity filled with many round black seeds.", "「パパイヤ」とは、橙色から赤色の果肉を持ち、中央の空洞に丸い黒い種がたくさん入っている熱帯の果物です。"),
    examples: [
      { en: "I scoop the seeds out of the papaya.", ja: "パパイヤの種をスプーンで取り出します。", zh: "我用湯匙挖出木瓜籽。", cefrLevel: "A2" },
      { en: "After cutting the papaya, I added lime juice because the flavor was mild.", ja: "パパイヤを切った後、味があっさりしていたのでライム果汁をかけました。", zh: "切開木瓜後，因為味道比較淡，我淋了一點萊姆汁。", cefrLevel: "B1" },
    ],
    relatedWords: ["mango", "dragon-fruit", "passion-fruit"], ja: "パパイヤ", jaReading: "パパイヤ", jaReadingSegments: null,
  },
  {
    id: "avocado", word: "avocado", chinese: "酪梨", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˌæv.əˈkɑː.doʊ/",
    chineseDefinition: "外皮多為綠色或深色，果肉柔滑呈淡綠色，中央有一顆大圓籽的水果。",
    definitions: definitions("酪梨", "A fruit with creamy pale-green flesh, green or dark skin, and one large round seed.", "「アボカド」とは、緑や黒っぽい皮と薄緑色のなめらかな果肉を持ち、中央に大きな丸い種が一つある果物です。"),
    examples: [
      { en: "I put avocado on my toast.", ja: "トーストにアボカドをのせます。", zh: "我把酪梨放在吐司上。", cefrLevel: "A2" },
      { en: "If the avocado is still hard, I leave it on the counter instead of cutting it.", ja: "アボカドがまだ硬ければ、切らずに調理台の上で追熟させます。", zh: "如果酪梨還很硬，我不會切開，而是放在流理台上讓它熟成。", cefrLevel: "B1" },
    ],
    relatedWords: ["kiwi-fruit", "coconut", "mango"], ja: "アボカド", jaReading: "アボカド", jaReadingSegments: null,
  },
  {
    id: "blueberry", word: "blueberry", chinese: "藍莓", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈbluːˌber.i/",
    chineseDefinition: "體型小、成熟時呈深藍紫色，表面常有薄薄果粉並帶酸甜味的莓果。",
    definitions: definitions("藍莓", "A small sweet-tart berry with deep blue-purple skin and a light powdery bloom.", "「ブルーベリー」とは、濃い青紫色の皮に白い粉が付くことがあり、甘酸っぱい味の小さな果物です。"),
    examples: [
      { en: "I sprinkle blueberries over my cereal.", ja: "シリアルにブルーベリーをのせます。", zh: "我把藍莓撒在早餐穀片上。", cefrLevel: "A2" },
      { en: "Since fresh blueberries were expensive, I bought a bag of frozen blueberries for smoothies.", ja: "生のブルーベリーが高かったので、スムージー用に冷凍ブルーベリーを一袋買いました。", zh: "因為新鮮藍莓很貴，我買了一袋冷凍藍莓來打果昔。", cefrLevel: "B1" },
    ],
    relatedWords: ["raspberry", "strawberry", "grape"], ja: "ブルーベリー", jaReading: "ブルーベリー", jaReadingSegments: null,
  },
  {
    id: "raspberry", word: "raspberry", chinese: "覆盆子", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈræzˌber.i/",
    chineseDefinition: "由許多小果粒聚合成、成熟時多呈紅色，果肉柔軟且帶酸甜味的莓果。",
    definitions: definitions("覆盆子", "A soft red berry made of many tiny joined segments, with a sweet-tart flavor.", "「ラズベリー」とは、小さな粒が集まった形をしており、柔らかく甘酸っぱい赤い果物です。"),
    examples: [
      { en: "I decorate the cake with raspberries.", ja: "ケーキをラズベリーで飾ります。", zh: "我用覆盆子裝飾蛋糕。", cefrLevel: "A2" },
      { en: "Because raspberries crush easily, I rinse them gently just before eating them.", ja: "ラズベリーはつぶれやすいので、食べる直前に優しく洗います。", zh: "因為覆盆子很容易壓壞，我會在要吃之前輕輕清洗。", cefrLevel: "B1" },
    ],
    relatedWords: ["blueberry", "strawberry", "cherry"], ja: "ラズベリー", jaReading: "ラズベリー", jaReadingSegments: null,
  },
  {
    id: "pomegranate", word: "pomegranate", chinese: "石榴", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈpɑː.məˌɡræn.ɪt/",
    chineseDefinition: "外皮厚而紅，頂端像冠狀，果實內部分隔成許多包著紅色多汁假種皮的果粒。",
    definitions: definitions("石榴", "A thick-skinned red fruit with a crown-like top and many juicy ruby seeds inside.", "「ざくろ」とは、冠のような先端と厚い赤い皮を持ち、中に果汁の多い赤い粒がたくさん入った果物です。"),
    examples: [
      { en: "I add pomegranate seeds to the salad.", ja: "サラダにざくろの粒を加えます。", zh: "我在沙拉裡加入石榴籽。", cefrLevel: "A2" },
      { en: "To keep the juice from splashing, I opened the pomegranate in a bowl of water.", ja: "果汁が飛び散らないように、水を張ったボウルの中でざくろを開きました。", zh: "為了避免果汁四濺，我在一碗水裡剝開石榴。", cefrLevel: "B1" },
    ],
    relatedWords: ["fig", "passion-fruit", "grape"], ja: "ざくろ", jaReading: "ざくろ", jaReadingSegments: null,
  },
  {
    id: "dragon-fruit", word: "dragon fruit", chinese: "火龍果", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈdræɡ.ən ˌfruːt/",
    chineseDefinition: "外皮鮮紅或粉紅並有綠色鱗片狀突起，果肉布滿細小黑籽的熱帶水果。",
    definitions: definitions("火龍果", "A tropical fruit with bright pink skin, green-tipped scales, and white or red flesh dotted with tiny black seeds.", "「ドラゴンフルーツ」とは、緑の突起がある鮮やかなピンクの皮と、小さな黒い種が散った白や赤の果肉を持つ熱帯の果物です。"),
    examples: [
      { en: "I scoop the dragon fruit out of its skin.", ja: "ドラゴンフルーツの果肉を皮からすくい取ります。", zh: "我把火龍果果肉從皮裡挖出來。", cefrLevel: "A2" },
      { en: "After chilling the dragon fruit, I cut it into cubes and shared it with my family.", ja: "ドラゴンフルーツを冷やした後、角切りにして家族と分けました。", zh: "把火龍果冰過後，我切成小塊和家人一起吃。", cefrLevel: "B1" },
    ],
    relatedWords: ["passion-fruit", "kiwi-fruit", "papaya"], ja: "ドラゴンフルーツ", jaReading: "ドラゴンフルーツ", jaReadingSegments: null,
  },
  {
    id: "passion-fruit", word: "passion fruit", chinese: "百香果", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈpæʃ.ən ˌfruːt/",
    chineseDefinition: "外皮成熟後常呈紫色或黃色，內部有酸甜芳香的膠狀果肉與許多黑籽。",
    definitions: definitions("百香果", "A fragrant tropical fruit with purple or yellow skin and tart jelly-like pulp full of dark seeds.", "「パッションフルーツ」とは、紫や黄色の皮を持ち、香りの強い甘酸っぱいゼリー状の果肉に黒い種が多く入った熱帯の果物です。"),
    examples: [
      { en: "I spoon the passion fruit pulp over yogurt.", ja: "パッションフルーツの果肉をスプーンですくってヨーグルトにかけます。", zh: "我用湯匙把百香果果肉舀到優格上。", cefrLevel: "A2" },
      { en: "When the passion fruit skin becomes wrinkled, the pulp inside is usually sweeter.", ja: "パッションフルーツの皮にしわが出ると、中の果肉はたいてい甘くなっています。", zh: "百香果外皮變皺時，裡面的果肉通常會比較甜。", cefrLevel: "B1" },
    ],
    relatedWords: ["dragon-fruit", "pomegranate", "kiwi-fruit"], ja: "パッションフルーツ", jaReading: "パッションフルーツ", jaReadingSegments: null,
  },
  {
    id: "lychee", word: "lychee", chinese: "荔枝", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈliː.tʃi/",
    chineseDefinition: "外殼粗糙呈紅色，剝開後是半透明白色果肉，中央有一顆深色種子的水果。",
    definitions: definitions("荔枝", "A small fruit with a rough red shell, translucent white flesh, and one dark seed.", "「ライチ」とは、ざらざらした赤い殻をむくと半透明の白い果肉が現れ、中央に黒っぽい種が一つある果物です。"),
    examples: [
      { en: "I peel the lychee and remove the seed.", ja: "ライチの皮をむいて種を取ります。", zh: "我剝開荔枝並去掉籽。", cefrLevel: "A2" },
      { en: "Because fresh lychees do not keep long, I ate them soon after buying them.", ja: "生のライチは日持ちしないので、買ってから早めに食べました。", zh: "因為新鮮荔枝不耐放，我買回來後很快就吃掉了。", cefrLevel: "B1" },
    ],
    relatedWords: ["mango", "grape", "coconut"], ja: "ライチ", jaReading: "ライチ", jaReadingSegments: null,
  },
  {
    id: "kumquat", word: "kumquat", chinese: "金柑", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈkʌm.kwɑːt/",
    chineseDefinition: "體型小而橢圓、果皮呈橙色，可連皮食用或做成蜜餞與果醬的柑橘類水果。",
    definitions: definitions("金柑", "A tiny oval orange citrus fruit that can be eaten with its peel or cooked into preserves.", "「金柑」とは、小さな楕円形の橙色のかんきつ類で、皮ごと食べたり甘露煮やジャムにしたりする果物です。"),
    examples: [
      { en: "I eat the kumquat with its peel.", ja: "金柑を皮ごと食べます。", zh: "我連皮吃金柑。", cefrLevel: "A2" },
      { en: "When my neighbor gave me many kumquats, I simmered them with sugar.", ja: "近所の人に金柑をたくさんもらったので、砂糖で甘く煮ました。", zh: "鄰居送我很多金柑，所以我加糖煮成蜜餞。", cefrLevel: "B1" },
    ],
    relatedWords: ["mandarin-orange", "orange", "yuzu"], ja: "金柑", jaReading: "きんかん", jaReadingSegments: [{ text: "金柑", ruby: "きんかん" }],
  },
  {
    id: "yuzu", word: "yuzu", chinese: "日本柚子", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈjuː.zuː/",
    chineseDefinition: "果皮黃色且凹凸明顯、香氣強烈，果汁酸，常在日本料理與冬季泡澡中使用的柑橘。",
    definitions: definitions("日本柚子", "An aromatic Japanese citrus fruit with bumpy yellow skin and tart juice, used in food and winter baths.", "「柚子」とは、凹凸のある黄色い皮と強い香り、酸味のある果汁を持ち、料理や冬の風呂に使われるかんきつ類です。"),
    examples: [
      { en: "I grate a little yuzu peel over the soup.", ja: "汁物に柚子の皮を少しすりおろします。", zh: "我在湯品上磨一點柚子皮。", cefrLevel: "A2" },
      { en: "When the winter solstice arrives, we put yuzu in the bath and enjoy its fragrance.", ja: "冬至の日になると、風呂に柚子を浮かべて香りを楽しみます。", zh: "到了冬至，我們會把日本柚子放進浴缸裡享受香氣。", cefrLevel: "B1" },
    ],
    relatedWords: ["lemon", "kumquat", "mandarin-orange"], ja: "柚子", jaReading: "ゆず", jaReadingSegments: [{ text: "柚子", ruby: "ゆず" }],
  },
  {
    id: "coconut", word: "coconut", chinese: "椰子", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈkoʊ.kəˌnʌt/",
    chineseDefinition: "外殼堅硬且有纖維，內側有厚白色果肉，果實中央含有椰子水的熱帶水果。",
    definitions: definitions("椰子", "A tropical fruit with a hard fibrous shell, thick white flesh, and liquid in the center.", "「ココナッツ」とは、繊維質の硬い殻と厚い白い果肉を持ち、中央に液体が入っている熱帯の果物です。"),
    examples: [
      { en: "I grate coconut flesh for the curry.", ja: "カレー用にココナッツの果肉をすりおろします。", zh: "我把椰肉磨碎來煮咖哩。", cefrLevel: "A2" },
      { en: "Since opening a whole coconut is difficult, I bought ready-cut pieces at the supermarket.", ja: "丸ごとのココナッツは開けるのが難しいので、スーパーでカット済みのものを買いました。", zh: "因為整顆椰子很難打開，我在超市買了切好的椰肉。", cefrLevel: "B1" },
    ],
    relatedWords: ["mango", "papaya", "pineapple"], ja: "ココナッツ", jaReading: "ココナッツ", jaReadingSegments: null,
  },
  {
    id: "apricot", word: "apricot", chinese: "杏桃", category: "fruits", partOfSpeech: "noun", pronunciation: "/ˈeɪ.prɪ.kɑːt/",
    chineseDefinition: "體型比桃子小，果皮橙黃並帶細毛，果肉酸甜且中央有一顆硬核的水果。",
    definitions: definitions("杏桃", "A small orange-gold fruit with velvety skin, sweet-tart flesh, and one stone.", "「あんず」とは、桃より小さく、うぶ毛のある橙色の皮と甘酸っぱい果肉を持ち、中央に硬い種が一つある果物です。"),
    examples: [
      { en: "I cut the apricot and remove the stone.", ja: "あんずを切って種を取ります。", zh: "我切開杏桃並去掉果核。", cefrLevel: "A2" },
      { en: "Because fresh apricots were not available, I used dried ones in the bread.", ja: "生のあんずが売っていなかったので、パンには乾燥したものを使いました。", zh: "因為買不到新鮮杏桃，我在麵包裡用了杏桃乾。", cefrLevel: "B1" },
    ],
    relatedWords: ["peach", "plum", "loquat"], ja: "あんず", jaReading: "あんず", jaReadingSegments: null,
  },
];

export const MAIN_WORD_FRUITS_WORDS = FRUIT_ENTRIES.map(
  ({ ja: _ja, jaReading: _jaReading, jaReadingSegments: _segments, ...word }) => word,
);

export const MAIN_WORD_FRUITS_CORRECTIONS: MainWordCorrection[] =
  FRUIT_ENTRIES.map(({ id, definitions: localizedDefinitions, ja, jaReading, jaReadingSegments }) => {
    const seededJaDefinition = localizedDefinitions.find(({ language }) => language === "ja")!.definition;
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

export const MAIN_WORD_FRUITS_EXAMPLE_PAIRS: MainWordExamplePair[] =
  FRUIT_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));

export const MAIN_WORD_FRUITS_IDS = FRUIT_ENTRIES.map(({ id }) => id);
