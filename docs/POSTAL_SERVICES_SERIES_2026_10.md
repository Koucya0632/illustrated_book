# 郵局系列：正式發布與驗證

日本時間 2026-10-23。使用者已授權上傳、正式資料庫寫入、提交及推送 main。

已新增 16 詞、48 筆釋義、32 句三語例句、64 組英日詞塊、16 張詞圖、1 張分類封面與 144 段音檔。正式主詞由 1,155 增為 1,171。所有內容已發布並經正式一般 URL 驗證可見。

## 詞條

| ID | English | 日本語 | 繁中 |
| --- | --- | --- | --- |
| postage-stamp | postage stamp | 切手 | 郵票 |
| postcard | postcard | はがき | 明信片 |
| letter | letter | 手紙 | 信件 |
| parcel | parcel | 小包 | 包裹 |
| postal-counter | postal counter | 郵便窓口 | 郵務櫃檯 |
| shipping-label | shipping label | 送り状 | 寄件標籤 |
| delivery-notice | delivery notice | 不在票 | 不在通知單 |
| postal-scale | postal scale | 郵便はかり | 郵資秤 |
| cardboard-box | cardboard box | 段ボール箱 | 紙箱 |
| packing-tape | packing tape | 梱包テープ | 封箱膠帶 |
| bubble-wrap | bubble wrap | 気泡緩衝材 | 氣泡布 |
| padded-envelope | padded envelope | クッション封筒 | 氣泡信封 |
| registered-mail | registered mail | 書留 | 掛號郵件 |
| express-mail | express mail | 速達 | 快捷郵件 |
| postmark | postmark | 消印 | 郵戳 |
| household-mailbox | household mailbox | 郵便受け | 住家信箱 |

既有郵局建築、公共郵筒、一般信封及郵務人員保留；沒有搬移詞條或修改自訂／收藏詞。

## 正式操作

- 161 個全新物件 create-only 上傳、0 覆寫；每個物件上傳後及 DB 發布前均完整下載比對大小與 SHA-256。
- 預留 32 個正式例句 ID 並先存入恢復 manifest，之後才建立例句音檔路徑。
- 單一資料庫交易寫入完整相依資料並發布 16 詞；沒有提交可公開讀取的半套草稿子資料。
- 發布後在 READ ONLY 交易重新逐欄比對全部主詞、釋義、日文詞頭及讀音、例句、翻譯、詞塊、gloss、分類、卡片及媒體，與不可變計畫完全一致。
- 1 次 words 快取標籤失效；沒有手動部署、rollback 或刪除舊物件。推送 main 後的既有 Git 自動流程由平台處理。

## 檢查結果與限制

| 層級 | 結果 |
| --- | --- |
| 全庫 DB 基本一致性 | 1,171 詞通過。 |
| 全庫例句結構 | 2,342 句及其英日詞塊機械檢查通過；整庫語意仍未重新審閱。 |
| 本批逐筆語意 | 16 詞／32 句有個別具體理由及精確來源 hash；生產來源確認一致後沿用已完成的判定。 |
| 遠端圖片 | 全部 17 張有效 WebP、1024×1024、MIME、大小及 hash 通過；與每張已審閱素材完全相同。 |
| 發音 | 詞頭 48 段與例句 96 段分開；owner、locale、source text、MP3 完整 frames、MIME、大小及 hash 通過。未宣稱全段主觀聽審。 |
| 正式 API／iOS 形狀 | 英日主詞及音檔投影、全部 64 個一般／避快取詞條詳情 API、6 個分類語系探針通過。必要與可選 Codable 欄位形狀正確；未做 iOS 實機測試。 |
| 網頁與快取 | 34 個一般／避快取分類與詞條網頁探針通過；完整主詞普通／避快取回應 ID 集合皆為 1,171，已收斂。 |
| main 整合 | 以 origin/main 的獨立工作目錄只納入郵局變更；型別、Next build、902 項測試通過、11 項依既有環境條件略過、0 失敗；476 詞／952 句 frozen eval 機械檢查 100%，與 baseline 相同。已整合最新 SEO 更新，重新執行型別、全套測試及建置均通過；另外 169 項隔離 PostgreSQL 整合測試全部通過。 |
| 一般部署防護 | 所有新 ID 和新分類受 seed 防護；公開備援和同步 helpers 排除；分類只有全部計畫詞條均已發布才顯示。 |

全庫日文 API 另有 picnic-sheet、superball-scooping、chocolate-banana、ramune 四筆既有純假名書寫差異。本批詞條沒有這些問題；沒有將整庫語意或圖片宣稱為全量健康。

## 計畫與恢復證據

- 不可變發布計畫：publish-plan-765e4f0446aa6fb44ad71c052d94545b9bad12542c30a7b3a0496d96f1118619.json
- 檔案 SHA-256：765e4f0446aa6fb44ad71c052d94545b9bad12542c30a7b3a0496d96f1118619
- Plan digest：d3cf9ece4082b6f21edee39448e4cdcf4f1682ac531609189967bfa06ee77814
- Apply manifest：apply-manifest-2026-10-22T15-35-03-094Z.json，狀態 applied，SHA-256 56a115082d3f8917a0ba72e9c93719c3db0f561f0f6accde88d90514eb3f0d7b
- 最後提示詞檔的文字紀錄在前次計畫後補齊，所以發布前重新封存計畫；詞條、例句和 161 個媒體檔案皆未變。舊計畫保留，未覆寫。
- 可攜式恢復資料與物件清單：[release evidence](releases/postal-services-series-2026-10.json)。中斷須從原 manifest 恢復，不建立第二次 uncontrolled apply。
- 詳細本地證據：output/postal-services-post-release（exact DB comparator、全庫例句快照、本批逐筆語意、遠端媒體、108 個 HTTP 探針及快取紀錄）。

正式分類：[郵局](https://tuji.nexflow.team/category/postal-services)。

用語參考：[日本郵便書留](https://www.post.japanpost.jp/service/send/domestic/option/kakitome/)、[日本郵便速達](https://www.post.japanpost.jp/service/send/domestic/option/sokutatsu/)、[包裹寄送](https://www.post.japanpost.jp/service/send/domestic/delivery/yu-pack/)。
