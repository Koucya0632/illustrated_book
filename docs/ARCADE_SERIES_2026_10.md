# 遊戲中心系列：已正式發布並部署

2026-10-22（日本時間）。分類：arcade／遊戲中心／ゲームセンター／Game Center。

本批新增 12 個主詞、36 筆釋義、24 句三語例句、48 組英日句子詞塊、12 張詞圖、1 張分類封面與 108 段音檔，共 121 個正式素材物件。使用者已確認「收藏型娛樂」既有 9 個相關詞維持原分類；不修改自訂或收藏詞。

## 詞目

| 繁中 | English | 日本語 |
| --- | --- | --- |
| 街機機台 | arcade cabinet | アーケード筐体 |
| 音樂遊戲機 | rhythm game machine | 音楽ゲーム機 |
| 賽車遊戲機 | racing game machine | レースゲーム機 |
| 射擊遊戲機 | shooting game machine | シューティングゲーム機 |
| 投籃遊戲機 | basketball arcade machine | バスケットボールゲーム機 |
| 跳舞遊戲機 | dance game machine | ダンスゲーム機 |
| 推幣機 | medal pusher | メダルプッシャー |
| 拍貼機 | photo sticker booth | プリントシール機 |
| 氣墊曲棍球桌 | air hockey table | エアホッケー台 |
| 街機遊戲資料卡 | amusement IC card | アミューズメントICカード |
| 代幣杯 | medal cup | メダルカップ |
| 代幣租借機 | medal dispenser | メダル貸出機 |

## 正式發布

使用者已明確授權上傳、寫入正式資料庫、提交與部署。121 個新物件以 create-only 方式上傳，0 個覆寫；全量重新下載比對 MIME、大小與 SHA-256 後，在單一資料庫交易中發布 12 詞。正式已發布、未刪除主詞數由 1101 增為 1113。

- 不可變計畫：output/arcade-publish-prep/publish-plan-fcaeac26258ed5ff51bba0365da27ba5018bb181773409a0c403e9c7468d7949.json。
- 計畫內容 digest：a867f3df76a0c7d14d259deb19ee45bb183862db6776b9a679b16c9ca95f5651。
- Apply manifest：output/arcade-publish-prep/apply-manifest-2026-10-22T08-13-36-102Z.json，狀態 applied，記錄 24 個正式例句 ID 與 121 個物件的恢復資訊。
- 所有主詞、詞頭、讀音、釋義、例句、翻譯、詞塊、gloss、分類、卡片與媒體列在 SELECT-only 交易內逐欄比對，與原計畫相同。
- 1113 主詞基本稽核及 2226 例句結構通過。本批 12 詞／24 例句的個別語意判定先核對精確來源與正式資料，再沿用；本次沒有重新審閱整個詞庫的語意。
- 121 個遠端物件重新完整下載：13 WebP 的尺寸／格式／hash 與 108 MP3 的完整 frames／hash 通過。主詞 36 列、例句 72 列音檔覆蓋通過；沒有逐段主觀聽音。
- 13 張選用圖逐張檢視；拍貼機與 IC 卡各退回一版，完整提示詞、逐圖理由與來源 hash 在 data/arcade-image-prompts-2026-10.json 與 data/arcade-visual-review-2026-10.json。
- 型別、Next build、全套 876 passed／9 skipped／0 failed 通過；最終媒體綁定後 7 項新系列目標測試再通過。
- 一般 seed 防護所有新 ID 與分類，備援資料不暴露未發布系列，分類讀取要求全部 12 詞已發布且未刪除。
- words 標籤快取失效後，部署前 35 個 API／HTML 探針通過：雙方向一般與 cache-busting、主詞音檔投影、分類三語、24 個詞條詳情回應的例句與詞塊、分類與詳情路由。

證據目錄：output/arcade-release-20261022。iOS 欄位形狀經 API checker 檢查；未執行 iOS 實機測試或全庫媒體重審。

## 部署

正式頁面：[遊戲中心](https://tuji.nexflow.team/category/arcade)。部署使用單次 npm run build 設定並保留既有 regions/crons；沒有執行一般 migration/backfill。

- 內容提交：0189454（本機提交，未 push GitHub）。
- 部署：dpl_EKRVJoMNUQBQmqo1shrif42bhZWi，狀態 Ready；https://everyday-english-picture-dictionary-4hecy9km2.vercel.app。兩個正式網域已切換。
- 部署後兩網域共 70 個 API／HTML 探針通過：兩方向一般與 cache-busting payload、主詞音檔投影、分類三語／封面、48 個詳情回應的例句與詞塊、分類與詳情 HTML 路由。
- 部署後 SELECT-only 正式 DB 逐欄比對再次通過；既有 9 個相關詞的詞頭、原分類與發布狀態均未改動。
- 瀏覽器確認分類標示 12 個單字、詞圖正常；畫面為 output/arcade-release-20261022/arcade-live.png。
- 全庫 API checker 另記錄 picnic-sheet、superball-scooping、chocolate-banana、ramune 四個既有詞的平／片假名表示差異；本批 12 詞沒有這類問題。未改動這些範圍外詞條，不把它們隱藏為全庫健康。
- 正式動作：121 個新物件（0 覆寫）、24 個正式例句 ID 預留、1 次完整內容發布交易、1 次 words 標籤快取失效、1 次正式部署。沒有 rollback，也未修改自訂或收藏詞。
- 最終紀錄：output/arcade-release-20261022/release.json；部署後證據為 api-after-deployment.json、api-after-deployment-primary.json 與 database-after-deployment.log。

本次沒有重做全庫語意／媒體覆核或 iOS 實機測試，也沒有逐段主觀聽音。

## 參考

- https://bandainamco-am.co.jp/game_center/game/index.html
- https://gamecenter-guide.sega.com/ja/etiquette/
- https://www.taito.co.jp/how-to/
