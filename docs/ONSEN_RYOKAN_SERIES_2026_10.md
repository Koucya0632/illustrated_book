# 溫泉旅館系列：20 詞已正式發布並部署

2026-10-22（日本時間）。分類：onsen-ryokan／溫泉旅館／温泉旅館／Hot Spring Inns。

本批 **20 個新主詞、60 筆釋義、40 句三語例句、80 組英日句子詞塊、20 張詞圖、1 張分類封面與 180 段音檔**，共 201 個正式素材物件。現有浴衣、日式寢具、拖鞋、浴室工具及毛巾保持原樣。自訂與收藏詞不在範圍。

## 詞目

| # | 中文 | English | 日本語 |
| --- | --- | --- | --- |
| 1 | 溫泉旅館 | hot spring inn | 温泉旅館 |
| 2 | 大浴場 | communal bath | 大浴場 |
| 3 | 露天浴池 | open-air bath | 露天風呂 |
| 4 | 包場浴池 | private bath | 貸切風呂 |
| 5 | 室內浴池 | indoor bath | 内湯 |
| 6 | 足湯 | footbath | 足湯 |
| 7 | 浴場更衣區 | bath changing area | 脱衣所 |
| 8 | 浴場洗澡區 | bath washing area | 洗い場 |
| 9 | 更衣籃 | clothes basket | 脱衣かご |
| 10 | 和室 | Japanese-style room | 和室 |
| 11 | 榻榻米 | tatami mat | 畳 |
| 12 | 障子紙拉門 | shoji screen | 障子 |
| 13 | 襖拉門 | fusuma sliding panel | ふすま |
| 14 | 床之間 | tokonoma alcove | 床の間 |
| 15 | 和式矮餐桌 | low dining table | 座卓 |
| 16 | 羽織外罩 | haori jacket | 羽織 |
| 17 | 旅館接待員 | ryokan attendant | 仲居 |
| 18 | 會席料理 | kaiseki meal | 会席料理 |
| 19 | 溫泉饅頭 | hot spring bun | 温泉まんじゅう |
| 20 | 房間鑰匙 | room key | ルームキー |

## 已通過的檢查

- 正式資料庫 SELECT-only 快照與預檢：發布前有 1081 個已發布且未刪除主詞；新 ID、英日詞頭、分類與句子詞塊均無衝突。
- 20 主詞及 40 例句逐筆編輯覆核，60 筆具體理由綁定當前內容及詞塊雜湊。每詞有 A2 簡單句及 B1 複雜句；80 句英日詞塊可精確重組原句，三語語境義及日文讀音完整。這是 Codex 的逐筆判斷，未另呼叫獨立審核模型。
- 全部 21 張選用原圖逐張檢視，最終 WebP 總覽也已檢視。均為 1024×1024 WebP，來源、內容雜湊、ID、路徑一對一。會席料理第一版太像一般定食而淘汰；第二版顯示八件器皿的多道小份料理總覽。
- 使用內建 imagegen；22 次生成的完整提示詞保存在 data/onsen-ryokan-image-prompts-2026-10.json。原圖在 output/onsen-ryokan-2026-10/sources，轉製 WebP 在 images。沒有使用替代 API 圖像生成。
- 主詞音檔 60 段、例句音檔 120 段，分別覆蓋 ja-JP、en-US、en-GB。來源文字、owner/locale、大小、SHA-256、ffprobe 與完整 ffmpeg 解碼均通過；未逐段主觀聽音。發布計畫中的例句 ownerKey 是候選參照；受控發布已解析 40 個正式 example ID 並保存於 apply manifest，正式音檔路徑使用實際 ID。
- 型別檢查、21 項針對性系列測試、全套測試 869 通過／9 項既有跳過／0 失敗、網站建置。
- 一般 seed 同時防護所有新 ID 與分類；無資料庫、資料庫故障備援及同步助手不顯示這批詞。分類查詢需完整 20 詞已發布且未刪除才顯示分類。
- 發布器預設唯讀；SELECT-only dry run 已核對邏輯 DB 與實體 R2 目標，無上傳或資料列變動。
- 本機預覽 20 張詞卡、180 個音訊播放器；全部 201 個素材連結存在且 HTTP 200，瀏覽器畫面已確認。

## 發布計畫與證據

- 最終不可覆寫計畫：output/onsen-ryokan-publish-prep/publish-plan-4f80f08480fa2345bf591520d6d61b7489abcc3a7dcca05657d2ce9266a2a16b.json
- 計畫檔案 SHA-256：4f80f08480fa2345bf591520d6d61b7489abcc3a7dcca05657d2ce9266a2a16b
- 計畫內容摘要：d9ad14b7e52763d55cb716a05851e209b622c6f43c04b81c245d46945f75fecc
- 機器可讀狀態：output/onsen-ryokan-preparation/readiness.json
- 本機預覽：output/onsen-ryokan-preparation/preview.html
- 圖片總覽：output/onsen-ryokan-preparation/contact-sheet.png
- 逐項證據路徑見 readiness.json 的 evidence。
- 前一版 b9aa3547 計畫已由最終版取代：兩個英文借詞的 IPA 經字典核對後修正，舊計畫會因來源雜湊不同而拒絕套用。

## 正式發布與驗證

使用者已明確授權上傳、寫入正式資料庫、提交與部署。2026-10-22 12:42 JST，201 個素材完整遠端驗證後，已在單一交易中發布 20 詞。正式主詞庫由 1081 增為 1101 個已發布且未刪除主詞，未覆寫舊物件。

- Apply manifest：output/onsen-ryokan-publish-prep/apply-manifest-2026-10-22T03-40-43-141Z.json，狀態 applied。
- 正式 DB SELECT-only 逐欄比對：所有主詞、詞頭、讀音、釋義、例句、翻譯、詞塊、gloss、分類、卡片及媒體均與不可變計畫一致。
- 全庫 1101 主詞、2202 例句結構通過。本次 20 主詞／40 例句的個別語意判斷已先核對正式內容與來源快照後沿用；全庫語意未於本次重做。
- 201 個遠端物件重新完整下載：21 WebP 的格式、尺寸、bytes/hash 及 180 MP3 的完整 frames/hash 均通過。主詞 60 列、例句 120 列音檔覆蓋通過；21 張選用圖片的來源及遠端雜湊與逐張判斷一致。
- words 快取標籤已失效；部署前普通與 cache-busting API 兩方向均為 1101 詞，其中本系列 20 詞，payload 與音檔投影一致；40 個詳情回應的例句及詞塊、分類三語與 HTML 路由檢查通過，共 51 個探針。
- 網站使用僅建置的單次部署設定，保留 regions/crons。資料庫結構既有，已由專用發布器完成內容交易；部署不需再跑全庫 migration/backfill。

發布證據保存在 output/onsen-ryokan-release-20261022，包括 database-exact-match.json、content-review.json、visual-review.json、remote-media.json、api-before-deployment.json。正式部署及部署後驗證均已完成。

iOS 解碼線路形狀由 API checker 檢查；未執行實機、全庫語意／全庫媒體重審或逐段主觀聽音。iOS 原有 project.pbxproj、Localizable.xcstrings 及本次期間出現的 CONTEXT.md 修改均保留；未修改 iOS。

## 用語與外觀參考

- [www.mlit.go.jp](https://www.mlit.go.jp/kankocho/ryokan/list_ja-6.html)
- [www.erin.jpf.go.jp](https://www.erin.jpf.go.jp/materials/vocabulary/download/erin_lesson11_vocabulary_list_tw.pdf)
- [www.mlit.go.jp](https://www.mlit.go.jp/tagengo-db/en/R1-01169.html)
- [www.japan.travel](https://www.japan.travel/en/guide/japanese-ryokan/)
- [www.zuien.jp](https://www.zuien.jp/en/manual)
- [nihonryouri.jp](https://nihonryouri.jp/howto.html)
- [www.merriam-webster.com](https://www.merriam-webster.com/dictionary/haori)
- [www.merriam-webster.com](https://www.merriam-webster.com/dictionary/fusuma)

## 正式部署結果

- 正式頁面：[溫泉旅館](https://tuji.nexflow.team/category/onsen-ryokan)，瀏覽器確認 20 詞及圖片正常。
- 內容提交：eb863e3bff474595df685cd60c27e6c07d55b9df；本機提交，未 push GitHub。
- 部署：dpl_ABBNuJRjxDPJzcagan8xC774UG28，狀態 Ready；[部署網址](https://everyday-english-picture-dictionary-q0f0o57pp.vercel.app)。兩個正式網域均已切換，保留原本 regions/crons。
- 部署後兩網域共 102 個 API／HTML 探針通過：兩方向普通與 cache-busting payload、主詞音檔投影、分類三語／封面、80 個詳情回應的目標例句及詞塊，以及分類／詳情 HTML 路由。
- 部署後正式 DB 全欄位比對再次通過；沒有執行例行 migration/backfill。
- 正式動作：201 個新物件（0 覆寫）、40 個正式例句 ID 預留、1 次整批內容發布交易、1 次 words 標籤快取失效、1 次正式部署；內容與發布報告均已提交。
- 最終機器紀錄：output/onsen-ryokan-release-20261022/release.json。發布後 API 證據：api-after-deployment.json 與 api-after-deployment-primary.json。畫面：onsen-ryokan-live.png。
- 全庫 API checker 另列出四個既有詞的平／片假名表示差異：picnic-sheet、superball-scooping、chocolate-banana、ramune；均在本系列範圍外，未改動，不阻斷 Codable 解析。
- 本報告沒有宣稱全庫語意、全庫媒體或 iOS 實機全面通過。
