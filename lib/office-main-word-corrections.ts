import type { ExampleCorrection, MainWordCorrection } from "./main-word-corrections";

function dailyOfficeExample(
  oldEnWord: string,
  oldZhWord: string,
  oldJaWord: string,
  en: string,
  zh: string,
  ja: string,
): ExampleCorrection {
  return {
    sortOrder: 0,
    oldEn: `I need the ${oldEnWord} at the office.`,
    en,
    oldZh: `我在辦公室需要${oldZhWord}。`,
    zh,
    oldJa: `オフィスで${oldJaWord}が必要です。`,
    ja,
  };
}

export const OFFICE_MAIN_WORD_CORRECTIONS: MainWordCorrection[] = [
  {
    id: "access-card",
    oldJa: "アクセスカード",
    ja: "入館カード",
    oldJaReading: "アクセスカード",
    jaReading: "にゅうかんカード",
    jaDefinition: {
      old: "「アクセスカード」とは、建物や管理区域に入る際に使用する身分証明書です。",
      value: "「入館カード」は、建物や管理区域の扉を開けるために使うカードです。",
    },
    chineseDefinition: {
      old: "用於進入建築或管制區域的識別卡。",
      value: "用來開啟建築物或管制區域出入口的門禁卡。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "ja",
        old: "複合語 access + card。",
        value: "入館（建物に入ること）+ カード。",
      },
      {
        field: "note",
        language: "ja",
        old: "access（入退室）+ card（カード）。",
        value: "建物に入るためのカード。",
      },
    ],
    examples: [
      dailyOfficeExample(
        "access card",
        "門禁卡",
        "アクセスカード",
        "I forgot my access card, so I borrowed a temporary one at reception.",
        "我忘了帶門禁卡，所以在櫃檯借了臨時卡。",
        "入館カードを忘れたので、受付で仮カードを借りました。",
      ),
    ],
  },
  {
    id: "ballpoint-pen",
    examples: [
      dailyOfficeExample(
        "ballpoint pen",
        "原子筆",
        "ボールペン",
        "Please fill out this form with a black ballpoint pen.",
        "請用黑色原子筆填寫這張表格。",
        "この用紙は黒いボールペンで記入してください。",
      ),
    ],
  },
  {
    id: "binder-clip",
    examples: [
      dailyOfficeExample(
        "binder clip",
        "長尾夾",
        "ダブルクリップ",
        "Use a binder clip to hold these documents together.",
        "用長尾夾把這些文件夾在一起。",
        "この書類はダブルクリップでまとめてください。",
      ),
    ],
  },
  {
    id: "business-card",
    examples: [
      dailyOfficeExample(
        "business card",
        "名片",
        "名刺",
        "I exchanged business cards with the client.",
        "我和客戶交換了名片。",
        "取引先の方と名刺を交換しました。",
      ),
    ],
  },
  {
    id: "calendar",
    oldZh: "行事曆",
    zh: "日曆",
    jaDefinition: {
      old: "「カレンダー」とは、1 年の日、週、月を示すグラフです。",
      value: "「カレンダー」は、日付や曜日を月ごとに確認できる表です。",
    },
    chineseDefinition: {
      old: "顯示一年中日、週、月份的圖表。",
      value: "按月份排列日期與星期、用來確認日期的表。",
    },
    examples: [
      dailyOfficeExample(
        "calendar",
        "行事曆",
        "カレンダー",
        "The meeting is marked on the calendar.",
        "會議日期標在日曆上。",
        "会議の日程はカレンダーに書いてあります。",
      ),
    ],
  },
  {
    id: "coffee-machine",
    examples: [
      dailyOfficeExample(
        "coffee machine",
        "咖啡機",
        "コーヒーマシン",
        "The coffee machine is out of beans.",
        "咖啡機沒有咖啡豆了。",
        "コーヒーマシンの豆が切れています。",
      ),
    ],
  },
  {
    id: "conference-table",
    examples: [
      dailyOfficeExample(
        "conference table",
        "會議桌",
        "会議テーブル",
        "The handouts are on the conference table.",
        "資料放在會議桌上。",
        "資料は会議テーブルの上にあります。",
      ),
    ],
  },
  {
    id: "desk",
    oldZh: "書桌 / 工作桌",
    zh: "辦公桌",
    jaDefinition: {
      old: "「デスク」は仕事や書き物をするために使用される平らなデスクトップを持つ家具です。",
      value: "「デスク」は、仕事や書き物をするための平らな天板がある机です。",
    },
    chineseDefinition: {
      old: "桌面平整、用以工作或書寫的家具。",
      value: "具有平整桌面、供辦公或書寫使用的桌子。",
    },
    examples: [
      {
        sortOrder: 0,
        oldEn: "I put my laptop on the desk.",
        en: "I put my laptop on the desk.",
        oldZh: "我把筆電放在書桌上。",
        zh: "我把筆電放在辦公桌上。",
        oldJa: "ノートパソコンをデスクに置きます。",
        ja: "ノートパソコンをデスクに置きます。",
      },
    ],
  },
  {
    id: "document",
    examples: [
      dailyOfficeExample(
        "document",
        "文件",
        "書類",
        "Please send me the document by email.",
        "請用電子郵件把文件寄給我。",
        "書類をメールで送ってください。",
      ),
    ],
  },
  {
    id: "employee-id-card",
    examples: [
      dailyOfficeExample(
        "employee ID card",
        "員工證",
        "社員証",
        "Please wear your employee ID card where it can be seen.",
        "請把員工證佩戴在明顯的位置。",
        "社員証は見える位置につけてください。",
      ),
    ],
  },
  {
    id: "envelope",
    examples: [
      dailyOfficeExample(
        "envelope",
        "信封",
        "封筒",
        "Put the contract in this envelope.",
        "請把合約放進這個信封。",
        "契約書をこの封筒に入れてください。",
      ),
    ],
  },
  {
    id: "file-folder",
    oldJa: "ファイルフォルダー",
    ja: "個別フォルダー",
    oldJaReading: "ファイルフォルダー",
    jaReading: "こべつフォルダー",
    jaDefinition: {
      old: "「ファイルフォルダー」は、ページのない文書を保管および整理するために使用される折りたたみフォルダーです。",
      value: "「個別フォルダー」は、書類を分類して保管するための、見出し付きの紙製フォルダーです。",
    },
    chineseDefinition: {
      old: "用來收存與整理散頁文件的對折夾。",
      value: "附有分類標籤、用來整理及保存散頁文件的紙製檔案夾。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "ja",
        old: "複合語 file + folder。",
        value: "個別（項目ごと）+ フォルダー。",
      },
      {
        field: "note",
        language: "ja",
        old: "file（書類）+ folder（折りたたみ）。",
        value: "書類を項目ごとに分ける見出し付きフォルダー。",
      },
    ],
    examples: [
      dailyOfficeExample(
        "file folder",
        "檔案夾",
        "ファイルフォルダー",
        "I sorted the invoices into separate file folders.",
        "我把請款單分別放進檔案夾。",
        "請求書を個別フォルダーに分けて入れました。",
      ),
    ],
  },
  {
    id: "filing-cabinet",
    oldJa: "書類棚",
    ja: "ファイリングキャビネット",
    oldJaReading: "しょるいだな",
    jaReading: "ファイリングキャビネット",
    jaDefinition: {
      old: "「書類棚」とは、書類を保管・整理するための引き出し付きキャビネットのことです。",
      value: "「ファイリングキャビネット」は、書類を分類して保管するための引き出し式の収納家具です。",
    },
    localizedTexts: [
      {
        field: "note",
        language: "ja",
        old: "filing（書類整理）+ cabinet（棚）。",
        value: "filing（書類整理）+ cabinet（引き出し式の収納）。",
      },
    ],
    examples: [
      dailyOfficeExample(
        "filing cabinet",
        "文件櫃",
        "書類棚",
        "The old contracts are in the filing cabinet.",
        "舊合約放在文件櫃裡。",
        "古い契約書はファイリングキャビネットに入っています。",
      ),
    ],
  },
  {
    id: "folder",
    oldWord: "folder",
    word: "clear file folder",
    oldZh: "資料夾",
    zh: "透明資料夾",
    oldJa: "フォルダー",
    ja: "クリアファイル",
    oldJaReading: "フォルダー",
    jaReading: "クリアファイル",
    oldPronunciation: "/ˈfoʊl.dɚ/",
    pronunciation: "/ˌklɪr ˈfaɪl ˌfoʊl.dɚ/",
    enDefinition: {
      old: "A cover or holder used to keep loose papers together.",
      value: "A transparent plastic sleeve used to protect and carry documents.",
    },
    jaDefinition: {
      old: "「フォルダー」は、ばらけた紙を保持するために使用される封筒またはクリップです。",
      value: "「クリアファイル」は、書類を保護して持ち運ぶための透明なプラスチック製ファイルです。",
    },
    chineseDefinition: {
      old: "用來夾住散頁紙張的封套或夾子。",
      value: "透明塑膠製的文件套，用來保護並攜帶紙本資料。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "The verb fold + -er. Fold comes from Old English fealdan (to fold). The core feeling couldn't be more direct: 'a folded thing that wraps around paper'.",
        value: "clear + file folder: a transparent folder that keeps documents visible and protected.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "fold + -er。折りたたむもの。",
        value: "clear（透明な）+ file（書類を入れるもの）から。",
      },
      {
        field: "note",
        language: "en",
        old: "fold + er = the folder",
        value: "clear + file folder",
      },
      {
        field: "note",
        language: "ja",
        old: "fold（折る）+ -er = フォルダー。",
        value: "書類を入れる透明なファイル。",
      },
    ],
    examples: [
      dailyOfficeExample(
        "folder",
        "資料夾",
        "フォルダー",
        "Keep the handout in this clear file folder.",
        "請把講義放進這個透明資料夾。",
        "配布資料はこのクリアファイルに入れてください。",
      ),
    ],
  },
  {
    id: "glue",
    examples: [
      dailyOfficeExample(
        "glue",
        "膠水",
        "のり",
        "Can I borrow the glue?",
        "可以借我膠水嗎？",
        "のりを貸してもらえますか？",
      ),
    ],
  },
  {
    id: "headphones",
    enDefinition: {
      old: "A pair of small speakers worn over or in the ears.",
      value: "A pair of speakers worn over the ears with a band around the head.",
    },
    jaDefinition: {
      old: "「ヘッドホン」は、頭に装着したり、耳に挿入して音を聞くための小さなスピーカーのペアです。",
      value: "「ヘッドホン」は、頭に装着し、耳を覆うようにして音を聞くための機器です。",
    },
    chineseDefinition: {
      old: "成對的小型喇叭，戴在頭上或塞入耳中聆聽聲音。",
      value: "以頭帶固定並覆蓋耳朵、用來聆聽聲音的成對裝置。",
    },
    examples: [
      dailyOfficeExample(
        "headphones",
        "耳機",
        "ヘッドホン",
        "I wear headphones during online meetings.",
        "我開線上會議時會戴頭戴式耳機。",
        "オンライン会議ではヘッドホンを使います。",
      ),
    ],
  },
  {
    id: "highlighter",
    examples: [
      dailyOfficeExample(
        "highlighter",
        "螢光筆",
        "蛍光ペン",
        "Highlight the important parts in yellow.",
        "請用黃色螢光筆標出重點。",
        "大事なところに黄色い蛍光ペンで線を引いてください。",
      ),
    ],
  },
  {
    id: "keyboard",
    enDefinition: {
      old: "A set of keys used for typing on a computer or playing a musical instrument.",
      value: "A set of keys used to type text and enter commands on a computer.",
    },
    jaDefinition: {
      old: "「キーボード」とは、コンピュータで文字を入力したり鍵盤楽器を演奏したりするために使用される、キーを並べて構成されたデバイスです。",
      value: "「キーボード」は、コンピューターに文字や命令を入力するための、キーが並んだ装置です。",
    },
    chineseDefinition: {
      old: "由一排按鍵組成的設備，用於在電腦上輸入文字或彈奏鍵盤樂器。",
      value: "由多個按鍵組成、用來向電腦輸入文字與指令的裝置。",
    },
  },
  {
    id: "marker",
    oldWord: "marker",
    word: "permanent marker",
    oldZh: "馬克筆",
    zh: "油性筆",
    oldJa: "マーカー",
    ja: "油性マーカー",
    oldJaReading: "マーカー",
    jaReading: "ゆせいマーカー",
    oldPronunciation: "/ˈmɑːr.kɚ/",
    pronunciation: "/ˌpɝː.mə.nənt ˈmɑːr.kɚ/",
    enDefinition: {
      old: "A pen with a felt tip used for writing on whiteboards or surfaces.",
      value: "A felt-tip pen with water-resistant ink used to write on paper, cardboard, and other surfaces.",
    },
    jaDefinition: {
      old: "「マーカー」は、ホワイトボードや表面に書き込むために使用される、先端がフェルトのペンです。",
      value: "「油性マーカー」は、紙や段ボールなどに消えにくいインクで書くためのフェルトペンです。",
    },
    chineseDefinition: {
      old: "筆尖為氈芯的筆，用以在白板或物品表面書寫。",
      value: "使用不易脫落的油性墨水、可在紙張或紙箱等表面書寫的氈芯筆。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "mark + -er. Mark comes from Old English mearc (boundary, sign). So a marker is literally 'a tool for making marks' — a very direct core feeling.",
        value: "permanent + marker: a marker whose ink is designed not to wipe off easily.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "mark + -er。印を付けるもの。",
        value: "油性（油性インク）+ マーカー。",
      },
      {
        field: "note",
        language: "en",
        old: "mark + er = the marker pen",
        value: "permanent + marker",
      },
      {
        field: "note",
        language: "ja",
        old: "mark（印を付ける）+ -er = マーカー。",
        value: "消えにくい油性インクのマーカー。",
      },
    ],
    examples: [
      dailyOfficeExample(
        "marker",
        "馬克筆",
        "マーカー",
        "Write the address on the box with a permanent marker.",
        "請用油性筆在箱子上寫地址。",
        "箱に油性マーカーで宛名を書いてください。",
      ),
    ],
  },
  {
    id: "meeting-room",
    examples: [
      dailyOfficeExample(
        "meeting room",
        "會議室",
        "会議室",
        "The meeting room is reserved until three.",
        "會議室預約到三點。",
        "会議室は3時まで予約されています。",
      ),
    ],
  },
  {
    id: "microphone",
    examples: [
      dailyOfficeExample(
        "microphone",
        "麥克風",
        "マイク",
        "Please speak closer to the microphone.",
        "請靠近麥克風說話。",
        "もう少しマイクに近づいて話してください。",
      ),
    ],
  },
  {
    id: "mobile-phone",
    oldWord: "mobile phone",
    word: "smartphone",
    oldJa: "携帯電話",
    ja: "スマートフォン",
    oldJaReading: "けいたいでんわ",
    jaReading: "スマートフォン",
    oldPronunciation: "/ˈmoʊ.bəl foʊn/",
    pronunciation: "/ˈsmɑːrt.foʊn/",
    enDefinition: {
      old: "A portable phone that uses wireless signals to make calls.",
      value: "A mobile phone with a touchscreen and apps for communication, internet access, and other tasks.",
    },
    jaDefinition: {
      old: "「携帯電話」は、無線信号を使用して通話を行う携帯電話です。",
      value: "「スマートフォン」は、通話やインターネット、アプリの利用ができる携帯型の端末です。",
    },
    chineseDefinition: {
      old: "利用無線訊號通話、可隨身攜帶的電話。",
      value: "具有觸控螢幕，可用來通話、上網及使用應用程式的手機。",
    },
    localizedTexts: [
      {
        field: "etymology",
        language: "en",
        old: "mobile + phone. Mobile comes from Latin mobilis, from movere (to move); phone is short for telephone. Together: a phone that can move — as opposed to the fixed-line landline.",
        value: "smart + phone: a mobile phone with computer-like functions and apps.",
      },
      {
        field: "etymology",
        language: "ja",
        old: "複合語 mobile + phone。",
        value: "smart（高機能な）+ phone（電話）から。",
      },
      {
        field: "note",
        language: "en",
        old: "mobile + phone",
        value: "smart + phone",
      },
      {
        field: "note",
        language: "ja",
        old: "mobile（移動できる）+ phone（電話）。",
        value: "日常会話では「スマホ」とも言います。",
      },
    ],
    examples: [
      dailyOfficeExample(
        "mobile phone",
        "手機",
        "携帯電話",
        "Please put your smartphone on silent mode.",
        "請把手機調成靜音模式。",
        "スマートフォンをマナーモードにしてください。",
      ),
    ],
  },
  {
    id: "mouse-pad",
    examples: [
      dailyOfficeExample(
        "mouse pad",
        "滑鼠墊",
        "マウスパッド",
        "My mouse moves better on this mouse pad.",
        "滑鼠放在這張滑鼠墊上比較順。",
        "このマウスパッドだと、マウスがスムーズに動きます。",
      ),
    ],
  },
  {
    id: "notepad",
    oldZh: "便條紙",
    zh: "便條本",
    jaDefinition: {
      old: "「メモ帳」は、短いメモを書くために使用される小さな紙です。",
      value: "「メモ帳」は、短い内容を書き留めるための小さな紙の束です。",
    },
    chineseDefinition: {
      old: "小型紙本，用以寫下簡短筆記。",
      value: "由多張紙裝訂成的小型便條本，用來記錄簡短內容。",
    },
    examples: [
      dailyOfficeExample(
        "notepad",
        "便條紙",
        "メモ帳",
        "I wrote down the phone number in my notepad.",
        "我把電話號碼記在便條本上。",
        "電話番号をメモ帳に書きました。",
      ),
    ],
  },
  {
    id: "office-chair",
    examples: [
      dailyOfficeExample(
        "office chair",
        "辦公椅",
        "オフィスチェア",
        "This office chair is height-adjustable.",
        "這張辦公椅可以調整高度。",
        "このオフィスチェアは高さを調節できます。",
      ),
    ],
  },
  {
    id: "office-supplies",
    examples: [
      dailyOfficeExample(
        "office supplies",
        "辦公用品",
        "事務用品",
        "We're running low on office supplies.",
        "辦公用品快用完了。",
        "事務用品の在庫が少なくなっています。",
      ),
    ],
  },
  {
    id: "paper",
    examples: [
      dailyOfficeExample(
        "paper",
        "紙",
        "紙",
        "Please load more paper into the printer.",
        "請幫印表機補充紙張。",
        "プリンターに紙を補充してください。",
      ),
    ],
  },
  {
    id: "paper-shredder",
    examples: [
      dailyOfficeExample(
        "paper shredder",
        "碎紙機",
        "シュレッダー",
        "Please shred this confidential document.",
        "請把這份機密文件放進碎紙機。",
        "この機密書類はシュレッダーにかけてください。",
      ),
    ],
  },
  {
    id: "pen",
    oldZh: "原子筆",
    zh: "筆",
  },
  {
    id: "photocopier",
    examples: [
      dailyOfficeExample(
        "photocopier",
        "影印機",
        "コピー機",
        "The photocopier is jammed.",
        "影印機卡紙了。",
        "コピー機で紙が詰まりました。",
      ),
    ],
  },
  {
    id: "ruler",
    examples: [
      dailyOfficeExample(
        "ruler",
        "尺",
        "定規",
        "Draw a straight line with a ruler.",
        "用尺畫一條直線。",
        "定規でまっすぐな線を引いてください。",
      ),
    ],
  },
  {
    id: "scanner",
    examples: [
      dailyOfficeExample(
        "scanner",
        "掃描器",
        "スキャナー",
        "Scan both sides of the document.",
        "請掃描文件的正反兩面。",
        "書類の両面をスキャンしてください。",
      ),
    ],
  },
  {
    id: "staples",
    examples: [
      dailyOfficeExample(
        "staples",
        "訂書針",
        "ホチキスの針",
        "We're out of staples.",
        "訂書針用完了。",
        "ホチキスの針がなくなりました。",
      ),
    ],
  },
  {
    id: "sticky-notes",
    examples: [
      dailyOfficeExample(
        "sticky notes",
        "便利貼",
        "付箋",
        "Leave a sticky note on my monitor.",
        "請在我的螢幕上貼一張便利貼。",
        "モニターに付箋を貼っておいてください。",
      ),
    ],
  },
  {
    id: "tape",
    examples: [
      dailyOfficeExample(
        "tape",
        "膠帶",
        "セロテープ",
        "I repaired the torn paper with tape.",
        "我用透明膠帶把破掉的紙黏好。",
        "破れた紙をセロテープで直しました。",
      ),
    ],
  },
  {
    id: "utility-knife",
    jaDefinition: {
      old: "「カッターナイフ」とは、日常の切断に使用される格納式の刃を備えたポケットナイフです。",
      value: "「カッターナイフ」は、刃をスライドさせて出し入れし、紙や段ボールを切るための道具です。",
    },
    chineseDefinition: {
      old: "刀刃可伸縮的小刀，供日常裁切使用。",
      value: "刀刃可滑動伸縮、用來裁切紙張或紙箱的工具。",
    },
    examples: [
      dailyOfficeExample(
        "utility knife",
        "美工刀",
        "カッターナイフ",
        "Cut the cardboard with a utility knife.",
        "用美工刀裁開紙箱。",
        "カッターナイフで段ボールを切ります。",
      ),
    ],
  },
  {
    id: "water-dispenser",
    examples: [
      dailyOfficeExample(
        "water dispenser",
        "飲水機",
        "ウォーターサーバー",
        "I filled my bottle at the water dispenser.",
        "我在飲水機裝滿水壺。",
        "ウォーターサーバーで水筒に水を入れました。",
      ),
    ],
  },
  {
    id: "webcam",
    examples: [
      dailyOfficeExample(
        "webcam",
        "網路攝影機",
        "ウェブカメラ",
        "The webcam isn't working.",
        "網路攝影機沒有反應。",
        "ウェブカメラが映りません。",
      ),
    ],
  },
  {
    id: "whiteboard",
    jaDefinition: {
      old: "「ホワイトボード」とは、教室やオフィスでよく見かける、マジックペンで書き込むことができる滑らかな表面を持つ白い板のことです。",
      value: "「ホワイトボード」は、専用のマーカーで書いたり消したりできる、表面が滑らかな白い板です。",
    },
    chineseDefinition: {
      old: "表面光滑的白色板，用麥克筆書寫，常見於教室或辦公室。",
      value: "表面光滑、可用白板筆反覆書寫及擦除的白色板。",
    },
    examples: [
      dailyOfficeExample(
        "whiteboard",
        "白板",
        "ホワイトボード",
        "The schedule is written on the whiteboard.",
        "行程寫在白板上。",
        "予定はホワイトボードに書いてあります。",
      ),
    ],
  },
  {
    id: "whiteboard-marker",
    examples: [
      dailyOfficeExample(
        "whiteboard marker",
        "白板筆",
        "ホワイトボードマーカー",
        "This whiteboard marker is running dry.",
        "這支白板筆快沒水了。",
        "このホワイトボードマーカーはインクが薄くなっています。",
      ),
    ],
  },
];
