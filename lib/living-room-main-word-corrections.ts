import type { ExampleCorrection, MainWordCorrection } from "./main-word-corrections";

function dailyLivingRoomExample(
  oldEnWord: string,
  oldZhWord: string,
  oldJaWord: string,
  en: string,
  zh: string,
  ja: string,
): ExampleCorrection {
  return {
    sortOrder: 0,
    oldEn: `The ${oldEnWord} is in the living room.`,
    en,
    oldZh: `${oldZhWord}在客廳裡。`,
    zh,
    oldJa: `${oldJaWord}はリビングにあります。`,
    ja,
  };
}

export const LIVING_ROOM_MAIN_WORD_CORRECTIONS: MainWordCorrection[] = [
  {
    id: "armchair",
    examples: [
      dailyLivingRoomExample(
        "armchair",
        "扶手椅",
        "アームチェア",
        "This armchair is comfortable for reading.",
        "這張扶手椅很適合坐著看書。",
        "このアームチェアは読書をするときに座りやすいです。",
      ),
    ],
  },
  {
    id: "back-cushion",
    examples: [
      dailyLivingRoomExample(
        "back cushion",
        "靠墊",
        "背もたれクッション",
        "Put a back cushion behind your lower back.",
        "請把靠墊放在腰後面。",
        "腰の後ろに背もたれクッションを置いてください。",
      ),
    ],
  },
  {
    id: "cabinet",
    examples: [
      dailyLivingRoomExample(
        "cabinet",
        "櫃子",
        "キャビネット",
        "The board games are stored in the cabinet.",
        "桌遊收在櫃子裡。",
        "ボードゲームはキャビネットにしまってあります。",
      ),
    ],
  },
  {
    id: "candle",
    enDefinition: {
      old: "A stick of wax with a wick that gives light when burned.",
      value: "An object made of wax with a wick that gives light when burned.",
    },
    jaDefinition: {
      old: "「ろうそく」は、燃焼時に光を発する芯の付いた蝋の柱です。",
      value: "「ろうそく」とは、芯に火をつけて明かりをともす、ろうでできたものです。",
    },
    chineseDefinition: {
      old: "附燈芯的蠟柱，燃燒時提供光線。",
      value: "由蠟製成並帶有燈芯，點燃後可照明的物品。",
    },
    examples: [
      dailyLivingRoomExample(
        "candle",
        "蠟燭",
        "ろうそく",
        "Light the candle after dinner.",
        "晚餐後點蠟燭。",
        "夕食後にろうそくに火をつけます。",
      ),
    ],
  },
  {
    id: "ceiling-light",
    oldZh: "天花板燈",
    zh: "吸頂燈",
    chineseDefinition: {
      old: "安裝於天花板上的照明燈具。",
      value: "安裝於天花板、貼近天花板表面的照明燈具。",
    },
    examples: [
      dailyLivingRoomExample(
        "ceiling light",
        "天花板燈",
        "シーリングライト",
        "Please turn on the ceiling light.",
        "請打開吸頂燈。",
        "シーリングライトをつけてください。",
      ),
    ],
  },
  {
    id: "charger",
    examples: [
      dailyLivingRoomExample(
        "charger",
        "充電器",
        "充電器",
        "I left my phone charger by the sofa.",
        "我把手機充電器放在沙發旁。",
        "スマートフォンの充電器をソファのそばに置きました。",
      ),
    ],
  },
  {
    id: "cushion",
    jaDefinition: {
      old: "「クッション」はソフトな詰め物素材で座り心地も安心です。",
      value: "「クッション」とは、座ったり寄りかかったりするときに使う、柔らかい詰め物入りのものです。",
    },
    chineseDefinition: {
      old: "柔軟的填充軟物，可坐可靠。",
      value: "柔軟的填充墊，可用來坐、靠或抱著。",
    },
    examples: [
      dailyLivingRoomExample(
        "cushion",
        "抱枕",
        "クッション",
        "Put a cushion on the sofa.",
        "請在沙發上放一個抱枕。",
        "ソファにクッションを置いてください。",
      ),
    ],
  },
  {
    id: "dehumidifier",
    examples: [
      dailyLivingRoomExample(
        "dehumidifier",
        "除濕機",
        "除湿機",
        "I turn on the dehumidifier on humid days.",
        "潮濕的日子我會開除濕機。",
        "湿気の多い日は除湿機をつけます。",
      ),
    ],
  },
  {
    id: "diffuser",
    oldWord: "diffuser",
    word: "reed diffuser",
    oldZh: "香氛擴香",
    zh: "擴香瓶",
    oldJa: "アロマディフューザー",
    ja: "リードディフューザー",
    oldJaReading: "アロマディフューザー",
    jaReading: "リードディフューザー",
    oldPronunciation: "/dɪˈfjuː.zɚ/",
    pronunciation: "/ˈriːd dɪˌfjuː.zɚ/",
    enDefinition: {
      old: "A device that disperses essential oil or fragrance into the air.",
      value: "A bottle filled with scented liquid that releases fragrance through reeds.",
    },
    jaDefinition: {
      old: "「アロマディフューザー」は、エッセンシャルオイルやアロマを空気中に拡散させる芳香装置です。",
      value: "「リードディフューザー」とは、香料の入った瓶にスティックを挿し、香りを広げる芳香用品です。",
    },
    chineseDefinition: {
      old: "將精油或香氣散布到空氣中的香氛裝置。",
      value: "在裝有香氛液的瓶中插入擴香棒，讓香氣散布到空氣中的用品。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "diffuse + -er. Diffuse comes from Latin diffundere (to pour out in all directions): dis- (apart) + fundere (to pour). So a diffuser's core feeling is 'pouring scent out in every direction'.",
        value: "reed + diffuser: a diffuser that uses porous reeds to draw up and release fragrance.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "diffuse + -er。広げるもの。",
        value: "reed（葦・細い棒）+ diffuser（香りを拡散するもの）。",
      },
      {
        field: "note",
        language: "en",
        old: "diffuse + er = the scent spreader",
        value: "reed + diffuser",
      },
      {
        field: "note",
        language: "ja",
        old: "diffuse（拡散する）+ -er = ディフューザー。",
        value: "スティックを使って香りを広げるタイプのディフューザー。",
      },
    ],
    examples: [
      dailyLivingRoomExample(
        "diffuser",
        "香氛擴香",
        "アロマディフューザー",
        "I put a reed diffuser on the shelf.",
        "我把擴香瓶放在架子上。",
        "棚にリードディフューザーを置きました。",
      ),
    ],
  },
  {
    id: "display-cabinet",
    oldJa: "ディスプレイキャビネット",
    ja: "飾り棚",
    oldJaReading: "ディスプレイキャビネット",
    jaReading: "かざりだな",
    jaDefinition: {
      old: "「飾り棚」は、中に商品を展示するためのガラスパネルが付いたキャビネットです。",
      value: "「飾り棚」とは、食器や小物などを飾って見せるための、ガラス扉が付いた棚です。",
    },
    examples: [
      dailyLivingRoomExample(
        "display cabinet",
        "展示櫃",
        "飾り棚",
        "The cups are displayed in the display cabinet.",
        "杯子陳列在展示櫃裡。",
        "飾り棚にカップを並べています。",
      ),
    ],
  },
  {
    id: "doorbell",
    oldWord: "doorbell",
    word: "video doorbell",
    oldZh: "門鈴",
    zh: "視訊門鈴",
    oldJa: "ドアベル",
    ja: "テレビドアホン",
    oldJaReading: "ドアベル",
    jaReading: "テレビドアホン",
    oldPronunciation: "/ˈdɔːr.bel/",
    pronunciation: "/ˈvɪd.i.oʊ ˌdɔːr.bel/",
    enDefinition: {
      old: "A bell or chime at a door that visitors press to announce arrival.",
      value: "A device at an entrance with a camera and call button that lets residents see and speak with visitors.",
    },
    jaDefinition: {
      old: "「ドアベル」とは、ドアの外に設置され、訪問者が家の所有者に到着を知らせるために押すベルまたは音響装置です。",
      value: "「テレビドアホン」とは、玄関のカメラと呼び出しボタンを使い、室内から訪問者を確認して通話できる装置です。",
    },
    chineseDefinition: {
      old: "設於門外的鈴或音效裝置，由訪客按下以通知屋主到訪。",
      value: "設於玄關並附有攝影機與呼叫按鈕，讓住戶查看訪客並通話的裝置。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "door + bell. Door comes from Old English duru; bell from Old English belle. Plainly: the bell on the door.",
        value: "video + doorbell: a doorbell with a camera that sends the visitor's image indoors.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "複合語 door + bell。",
        value: "テレビ（映像）+ ドアホン（玄関用の通話装置）。",
      },
      {
        field: "note",
        language: "en",
        old: "door + bell",
        value: "video + doorbell",
      },
      {
        field: "note",
        language: "ja",
        old: "door（ドア）+ bell（鈴）。",
        value: "映像で訪問者を確認できる玄関用インターホン。",
      },
    ],
    examples: [
      dailyLivingRoomExample(
        "doorbell",
        "門鈴",
        "ドアベル",
        "The video doorbell rang, so I checked the monitor.",
        "視訊門鈴響了，所以我查看螢幕。",
        "テレビドアホンが鳴ったので、モニターを確認しました。",
      ),
    ],
  },
  {
    id: "doormat",
    jaDefinition: {
      old: "「玄関マット」とは、玄関に玄関に置いて、玄関に敷いて靴裏を拭くためのマットのことです。",
      value: "「玄関マット」とは、玄関に敷き、家に入る前に靴の裏を拭くためのマットです。",
    },
    examples: [
      dailyLivingRoomExample(
        "doormat",
        "玄關墊",
        "玄関マット",
        "Wipe your shoes on the doormat before coming in.",
        "進門前請在玄關墊上擦鞋底。",
        "入る前に玄関マットで靴の裏を拭いてください。",
      ),
    ],
  },
  {
    id: "extension-cord",
    jaDefinition: {
      old: "「延長コード」は、ソケットの電力供給範囲を延長するために使用される柔軟な電源延長コードです。",
      value: "「延長コード」とは、壁のコンセントから離れた場所で電気製品を使うために、電源コードを延ばす器具です。",
    },
    chineseDefinition: {
      old: "具彈性的電源延長線，用來把插座的供電範圍延長。",
      value: "連接牆面插座、讓電器可在較遠處使用的電源線。",
    },
    examples: [
      dailyLivingRoomExample(
        "extension cord",
        "延長線",
        "延長コード",
        "The cord does not reach, so use this extension cord.",
        "電線不夠長，請用這條延長線。",
        "コードが届かないので、この延長コードを使ってください。",
      ),
    ],
  },
  {
    id: "floor-lamp",
    jaDefinition: {
      old: "「フロアランプ」とは、地面に立って設置する背の高いランプのことです。",
      value: "「フロアランプ」とは、床に置いて使う背の高いランプです。",
    },
    examples: [
      dailyLivingRoomExample(
        "floor lamp",
        "落地燈",
        "フロアランプ",
        "I turn on the floor lamp when I read.",
        "看書時我會打開落地燈。",
        "本を読むときはフロアランプをつけます。",
      ),
    ],
  },
  {
    id: "footstool",
    oldJa: "フットスツール",
    ja: "足置き",
    oldJaReading: "フットスツール",
    jaReading: "あしおき",
    examples: [
      dailyLivingRoomExample(
        "footstool",
        "腳凳",
        "足置き",
        "Rest your feet on the footstool.",
        "請把腳放在腳凳上。",
        "足置きに足を乗せてください。",
      ),
    ],
  },
  {
    id: "game-console",
    jaDefinition: {
      old: "「ゲーム機」は、ビデオ ゲームをプレイするためにテレビまたはスクリーンに接続された電子機器です。",
      value: "「ゲーム機」とは、テレビやモニターにつないでビデオゲームを遊ぶための機器です。",
    },
    examples: [
      dailyLivingRoomExample(
        "game console",
        "遊戲機",
        "ゲーム機",
        "I connected the game console to the TV.",
        "我把遊戲機接到電視上。",
        "ゲーム機をテレビにつなぎました。",
      ),
    ],
  },
  {
    id: "magazine",
    examples: [
      dailyLivingRoomExample(
        "magazine",
        "雜誌",
        "雑誌",
        "I read this magazine on the sofa.",
        "我在沙發上看這本雜誌。",
        "ソファでこの雑誌を読みました。",
      ),
    ],
  },
  {
    id: "newspaper",
    examples: [
      dailyLivingRoomExample(
        "newspaper",
        "報紙",
        "新聞",
        "My father reads the newspaper every morning.",
        "爸爸每天早上看報紙。",
        "父は毎朝、新聞を読みます。",
      ),
    ],
  },
  {
    id: "potted-plant",
    enDefinition: {
      old: "A plant grown in a container, kept indoors or as decoration.",
      value: "A plant grown in a flowerpot or other container.",
    },
    jaDefinition: {
      old: "「鉢植え」とは、屋内での展示や観賞用に鉢植えで栽培される植物のことです。",
      value: "「鉢植え」とは、植物を鉢などの容器に植えて育てたものです。",
    },
    chineseDefinition: {
      old: "種植於盆器中、用於室內擺設或裝飾的植物。",
      value: "種植在花盆或其他容器中的植物。",
    },
    examples: [
      dailyLivingRoomExample(
        "potted plant",
        "盆栽",
        "鉢植え",
        "Water the potted plant by the window.",
        "請幫窗邊的盆栽澆水。",
        "窓辺の鉢植えに水をやってください。",
      ),
    ],
  },
  {
    id: "power-outlet",
    jaDefinition: {
      old: "「コンセント」とは、電気製品に電力を供給するために壁に設置されたコンセントのことです。",
      value: "「コンセント」とは、電気製品のプラグを差し込み、電気を供給するための壁の差込口です。",
    },
    examples: [
      dailyLivingRoomExample(
        "power outlet",
        "插座",
        "コンセント",
        "Plug the lamp into this power outlet.",
        "請把燈的插頭插進這個插座。",
        "このコンセントにランプのプラグを差してください。",
      ),
    ],
  },
  {
    id: "projector",
    jaDefinition: {
      old: "「プロジェクター」とは、画像や映像をカーテンや壁に投影する装置です。",
      value: "「プロジェクター」とは、画像や映像をスクリーンや壁に投影する装置です。",
    },
    examples: [
      dailyLivingRoomExample(
        "projector",
        "投影機",
        "プロジェクター",
        "We project movies onto the screen.",
        "我們用投影機把電影投在布幕上。",
        "プロジェクターで映画をスクリーンに映します。",
      ),
    ],
  },
  {
    id: "projector-screen",
    examples: [
      dailyLivingRoomExample(
        "projector screen",
        "投影幕",
        "プロジェクタースクリーン",
        "Pull down the projector screen before the movie.",
        "看電影前先把投影幕拉下來。",
        "映画を見る前にプロジェクタースクリーンを下ろします。",
      ),
    ],
  },
  {
    id: "recliner",
    examples: [
      dailyLivingRoomExample(
        "recliner",
        "躺椅",
        "リクライニングチェア",
        "Lean back in the recliner and relax.",
        "把躺椅椅背往後放，休息一下。",
        "リクライニングチェアの背もたれを倒して休みます。",
      ),
    ],
  },
  {
    id: "remote-control-holder",
    examples: [
      dailyLivingRoomExample(
        "remote control holder",
        "遙控器收納盒",
        "リモコンホルダー",
        "Put the remote back in the remote control holder.",
        "請把遙控器放回收納盒。",
        "リモコンをリモコンホルダーに戻してください。",
      ),
    ],
  },
  {
    id: "robot-vacuum",
    jaDefinition: {
      old: "「ロボット掃除機」は自律的に地面を掃除できるスマート掃除機です。",
      value: "「ロボット掃除機」とは、床を自動で掃除する掃除機です。",
    },
    examples: [
      dailyLivingRoomExample(
        "robot vacuum",
        "掃地機器人",
        "ロボット掃除機",
        "The robot vacuum cleans while I am out.",
        "我外出時，掃地機器人會清掃地板。",
        "外出中にロボット掃除機が床を掃除します。",
      ),
    ],
  },
  {
    id: "router",
    jaDefinition: {
      old: "「ルーター」は、異なるネットワーク間でデータを転送するデバイスで、ホーム ネットワークでよく使用されます。",
      value: "「ルーター」とは、家庭内ネットワークで通信を振り分け、機器をインターネットにつなぐための装置です。",
    },
    examples: [
      dailyLivingRoomExample(
        "router",
        "路由器",
        "ルーター",
        "Restart the router if the internet stops working.",
        "網路連不上時，請重新啟動路由器。",
        "インターネットにつながらないときは、ルーターを再起動してください。",
      ),
    ],
  },
  {
    id: "rug",
    oldZh: "地毯（小）",
    zh: "小地毯",
    jaDefinition: {
      old: "「ラグ」は、厚手の生地で作られた小さな床材です。",
      value: "「ラグ」とは、厚手の織物などで作られ、床の一部に敷く敷物です。",
    },
  },
  {
    id: "set-top-box",
    examples: [
      dailyLivingRoomExample(
        "set-top box",
        "電視盒",
        "セットトップボックス",
        "Connect the set-top box to the TV with an HDMI cable.",
        "用 HDMI 線把電視盒接到電視。",
        "セットトップボックスをHDMIケーブルでテレビにつなぎます。",
      ),
    ],
  },
  {
    id: "side-table",
    examples: [
      dailyLivingRoomExample(
        "side table",
        "邊桌",
        "サイドテーブル",
        "Put your drink on the side table.",
        "飲料請放在邊桌上。",
        "飲み物はサイドテーブルに置いてください。",
      ),
    ],
  },
  {
    id: "smoke-detector",
    oldZh: "煙霧偵測器",
    zh: "煙霧警報器",
    oldJa: "煙感知器",
    ja: "煙式火災警報器",
    oldJaReading: "けむりかんちき",
    jaReading: "けむりしきかさいけいほうき",
    jaDefinition: {
      old: "「煙感知器」は煙を感知すると警報を発する装置です。",
      value: "「煙式火災警報器」とは、煙を感知すると警報音を鳴らして火災を知らせる住宅用の機器です。",
    },
    chineseDefinition: {
      old: "偵測到煙霧時會發出警報的裝置。",
      value: "偵測到煙霧時會發出警報聲，提醒住戶可能發生火災的裝置。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "ja",
        old: "複合語 smoke + detect + -or。",
        value: "煙 + 式 + 火災警報器。煙を感知して警報する方式を表す。",
      },
      {
        field: "note",
        language: "ja",
        old: "smoke（煙）+ detector（感知器）。",
        value: "煙を感知して警報音を鳴らす住宅用の機器。",
      },
    ],
    examples: [
      dailyLivingRoomExample(
        "smoke detector",
        "煙霧偵測器",
        "煙感知器",
        "Test the smoke detector once a month.",
        "每月確認一次煙霧警報器是否會響。",
        "月に一度、煙式火災警報器が鳴るか確認します。",
      ),
    ],
  },
  {
    id: "speaker",
    oldZh: "音響",
    zh: "喇叭",
    examples: [
      dailyLivingRoomExample(
        "speaker",
        "音響",
        "スピーカー",
        "Connect your phone to the speaker.",
        "請把手機連接到喇叭。",
        "スマートフォンをスピーカーに接続してください。",
      ),
    ],
  },
  {
    id: "table-lamp",
    jaDefinition: {
      old: "「テーブルランプ」とは、机の上に置くように設計された小型のランプです。",
      value: "「テーブルランプ」とは、テーブルや台の上に置いて使う小型のランプです。",
    },
    examples: [
      dailyLivingRoomExample(
        "table lamp",
        "檯燈",
        "テーブルランプ",
        "Turn off the table lamp before going to bed.",
        "睡前請關掉檯燈。",
        "寝る前にテーブルランプを消してください。",
      ),
    ],
  },
  {
    id: "telephone",
    examples: [
      dailyLivingRoomExample(
        "telephone",
        "電話",
        "電話",
        "The telephone is ringing.",
        "電話在響。",
        "電話が鳴っています。",
      ),
    ],
  },
  {
    id: "tv",
    jaDefinition: {
      old: "「テレビ」とは、放送やストリーミングビデオを受信して​​表示する電子機器です。",
      value: "「テレビ」とは、放送や配信の映像と音声を受信して再生する電子機器です。",
    },
  },
  {
    id: "tv-stand",
    jaDefinition: {
      old: "「テレビ台」は、テレビを収納するために特別に設計された家具です。",
      value: "「テレビ台」とは、テレビを置いたり、周辺機器を収納したりするための家具です。",
    },
    chineseDefinition: {
      old: "專為承載電視機而設計的家具。",
      value: "用來放置電視，也可收納影音設備等周邊物品的家具。",
    },
    examples: [
      dailyLivingRoomExample(
        "TV stand",
        "電視櫃",
        "テレビ台",
        "The game console is on the shelf in the TV stand.",
        "遊戲機放在電視櫃的層架上。",
        "ゲーム機はテレビ台の棚に置いてあります。",
      ),
    ],
  },
  {
    id: "vase",
    jaDefinition: {
      old: "「花瓶」とは、花を入れたり、装飾品として使用する装飾的な容器です。",
      value: "「花瓶」とは、花を生けたり飾ったりするための容器です。",
    },
    examples: [
      dailyLivingRoomExample(
        "vase",
        "花瓶",
        "花瓶",
        "Put these flowers in the vase.",
        "請把這些花插進花瓶裡。",
        "この花を花瓶に生けてください。",
      ),
    ],
  },
  {
    id: "wall-art",
    oldZh: "壁畫",
    zh: "牆面藝術",
    oldJa: "壁面アート",
    ja: "壁飾り",
    oldJaReading: "へきめんアート",
    jaReading: "かべかざり",
    examples: [
      dailyLivingRoomExample(
        "wall art",
        "壁畫",
        "壁飾り",
        "We hung new wall art above the sofa.",
        "我們在沙發上方掛了新的牆面藝術。",
        "ソファの上に新しい壁飾りを掛けました。",
      ),
    ],
  },
];
