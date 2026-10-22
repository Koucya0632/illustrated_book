# 防災包系列：16 詞正式發布

2026-10-22（日本時間）。分類 `emergency-kit`／防災包／防災バッグ／Emergency Kit。

本批新增 16 詞、48 筆三語釋義、32 句三語例句、64 組英日詞塊、16 張詞圖與 1 張封面、144 段音訊，合計 161 個新物件。發布前 1065 詞，發布後 1081 詞。

使用者已明確授權上傳、正式資料庫寫入、提交及部署。所有物件以 create-only 寫入；完整遠端下載大小及 SHA-256 驗證後，在同一交易中插入全部內容並發布。例句路徑使用已預留的正式 Postgres ID。

## 詞條

| ID | 中文 | English | 日本語 |
|---|---|---|---|
| emergency-go-bag | 防災包 | emergency go bag | 非常用持ち出し袋 |
| flashlight | 手電筒 | flashlight | 懐中電灯 |
| headlamp | 頭燈 | headlamp | ヘッドライト |
| hand-crank-radio | 手搖收音機 | hand-crank radio | 手回しラジオ |
| emergency-whistle | 求救哨 | emergency whistle | ホイッスル |
| emergency-blanket | 緊急保溫毯 | emergency blanket | アルミブランケット |
| disposable-toilet-kit | 攜帶式廁所組 | disposable toilet kit | 携帯トイレ |
| collapsible-water-bag | 折疊儲水袋 | collapsible water bag | 給水バッグ |
| alpha-rice | 即食乾燥米飯 | dehydrated cooked rice | アルファ米 |
| hardtack | 乾糧餅乾 | hardtack | 乾パン |
| cotton-work-gloves | 棉紗工作手套 | cotton work gloves | 軍手 |
| first-aid-kit | 急救包 | first-aid kit | 救急セット |
| aa-battery | 三號電池 | AA battery | 単三電池 |
| power-bank | 行動電源 | power bank | モバイルバッテリー |
| rain-poncho | 斗篷雨衣 | rain poncho | レインポンチョ |
| emergency-contact-card | 緊急聯絡卡 | emergency contact card | 緊急連絡カード |

## 驗證

- 正式資料庫 SELECT-only 交易逐欄比對主詞、讀音、釋義、例句、詞塊、三語 gloss、分類、卡片與 media，與不可變計畫完全一致。
- 本批 16 詞與 32 例句各有獨立具體編輯理由，確認當前來源雜湊相符後沿用；結構與語意覆核均通過。全庫 1081 詞、2162 例句的結構檢查通過，未重做全庫語意覆核。
- 全部 161 個遠端物件另行完整下載，17 張 1024×1024 WebP 與 144 段 MP3 的 bytes／hash／完整 frame sequence 通過；48 筆主詞音檔、96 筆例句音檔覆蓋通過。未逐段人工聽音。
- 17 張選用原圖已逐張檢視，編碼後總覽亦已檢視；提示詞及內建 image_gen 來源保存在 `data/emergency-kit-image-prompts-2026-10.json`。
- 型別檢查、87 項系列／發布防護測試、網站建置通過；全套測試 862 通過、9 項原有跳過、0 失敗。
- 例行 migration 防護所有新 ID 及分類；公開無 DB／DB 錯誤備援與同步助手隱藏本批；分類只在全批 published 且未刪除時可見。實際分類查詢已在唯讀交易驗證。
- API、快取收斂與正式部署：進行中，完成證據見後續段落。
- 沒有修改 iOS。原有專案設定與 Localizable.xcstrings 的未提交變更保留；不涉及自訂及收藏詞。

## 不可變計畫與發布清單

- Plan：output/emergency-kit-publish-prep/publish-plan-4fa8ec95278a93e7fa28bab4d651f3445322c7890435241ed6fae8fc9004a551.json
- Plan content digest：9c6915c8b4f2fe8c28200cac80401f7c5afc1d6e3e5a8bbc67e2650e35317e23
- Apply manifest：output/emergency-kit-publish-prep/apply-manifest-2026-10-22T00-52-42-009Z.json
- 正式逐欄比對：output/emergency-kit-release-20261022/database-exact-match.json
- 個別語意與音訊覆蓋：output/emergency-kit-release-20261022/content-review.json
- 全部遠端 bytes：output/emergency-kit-release-20261022/remote-media.json
- 全庫雙例句結構：output/emergency-kit-release-20261022/catalog-examples-final/audit.json
- 本機預覽：output/emergency-kit-preparation/preview.html
- 素材：output/emergency-kit-2026-10/sources、images；音訊：output/emergency-kit-audio-candidates。

## 部署方式

以此批內容提交進行 Vercel production 部署，使用臨時 local-config 保留現有 regions／crons，buildCommand 僅執行 npm run build。資料庫及新系列已由專用發布器完成並驗證，避免重跑整庫 backfill。Repository vercel.json 維持原狀。

## 日本用語與外觀參考

- [www.city.itabashi.tokyo.jp](https://www.city.itabashi.tokyo.jp/bousai/bousai/sonae/1005662.html)
- [www.bousai.go.jp](https://www.bousai.go.jp/kohou/kouhoubousai/r02/99/pdf/bs99.pdf)
- [www.bousai.metro.tokyo.lg.jp](https://www.bousai.metro.tokyo.lg.jp/content/tb2023/pageindices/index42.html)
- [www.onisifoods.co.jp](https://www.onisifoods.co.jp/about/index.html)
- [www.onisifoods.co.jp](https://www.onisifoods.co.jp/faq/)
