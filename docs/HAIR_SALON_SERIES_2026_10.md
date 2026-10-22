# 理髮／美容院系列：已正式發布

2026-10-22（日本時間）。分類 hair-salon／理髮／美容院／理容室・美容室／Barbershop & Hair Salon。

本批新增 30 個主詞、90 筆釋義、60 句三語例句、120 組英日句子詞塊、30 張詞圖、1 張分類封面與 270 段音檔，共 301 個正式素材物件。使用者已明確授權上傳、寫入正式資料庫及提交 main；沒有要求部署或 push。

正式頁面：[理髮／美容院](https://tuji.nexflow.team/category/hair-salon)。

## 詞目

| 繁中 | English | 日本語 |
| --- | --- | --- |
| 理髮店 | barbershop | 理容室 |
| 美容院 | hair salon | 美容室 |
| 理髮店三色燈 | barber pole | サインポール |
| 理髮椅 | barber chair | 理容椅子 |
| 洗髮盆 | shampoo basin | シャンプーボウル |
| 剪髮圍布 | haircut cape | カットクロス |
| 電推剪 | hair clippers | バリカン |
| 打薄剪 | thinning scissors | すきばさみ |
| 剪髮剪刀 | hair-cutting scissors | カットばさみ |
| 圓筒髮梳 | round hairbrush | ロールブラシ |
| 分區髮夾 | sectioning clip | ダッカール |
| 噴霧水瓶 | mist spray bottle | 霧吹き |
| 染髮刷 | hair color brush | カラー用ハケ |
| 燙髮捲 | perm rod | パーマロッド |
| 離子夾 | hair straightener | ストレートアイロン |
| 電捲棒 | curling iron | カールアイロン |
| 手持鏡 | hand mirror | 手鏡 |
| 剪髮 | haircut | カット |
| 碎髮刷 | neck duster | ネックブラシ |
| 刮鬍刷 | shaving brush | シェービングブラシ |
| 折疊剃刀 | straight razor | シェービングレザー |
| 染髮調色碗 | hair color bowl | カラーカップ |
| 美髮工具推車 | salon trolley | サロンワゴン |
| 罩式烘髮機 | hooded hair dryer | フードドライヤー |
| 髮蠟 | hair wax | ヘアワックス |
| 造型髮膠 | styling gel | スタイリングジェル |
| 瀏海 | bangs | 前髪 |
| 鬢角 | sideburns | もみあげ |
| 鮑伯頭 | bob cut | ボブ |
| 寸頭 | buzz cut | 坊主頭 |

## 正式發布與驗證

301 個新物件以 create-only 方式上傳，0 個覆寫。全部遠端 MIME、大小與 SHA-256 兩輪比對通過後，以單一交易發布完整 30 詞；正式已發布、未刪除主詞由 1113 增為 1143。60 個正式例句 ID 在上傳前預留並記入恢復 manifest。

- 不可變計畫：output/hair-salon-publish-prep/publish-plan-38161b8315adf93d1fe8ba68a0731d8c6643882979fd082a27d2eb64b3ad3252.json。
- 計畫 SHA-256：38161b8315adf93d1fe8ba68a0731d8c6643882979fd082a27d2eb64b3ad3252。
- 計畫內容 digest：ca7c910ec21a3c0ed686fbad93a01ac1e4be0ebdd6cd2d3ed333a053be23b918。
- Apply manifest：output/hair-salon-publish-prep/apply-manifest-2026-10-22T13-16-55-006Z.json，狀態 applied，發布時間 2026-10-22T13:20:55.074Z。
- SELECT-only 交易逐欄比對全部主詞、詞頭、讀音、釋義、例句、翻譯、詞塊、gloss、分類、卡片及媒體，與原計畫完全相同。
- 全庫 1143 主詞基本檢查及 2286 例句結構通過。本批 30 詞／60 例句的逐筆語意判定，在精確來源 snapshot 及正式資料一致後沿用；沒有重新審閱整庫語意。
- 全部 301 個遠端物件再次獨立完整下載：31 張 WebP 格式／1024×1024 尺寸／hash 與 270 段 MP3 完整 frames／hash 通過。詞頭 90 列、例句 180 列音檔覆蓋正確。
- 31 張圖逐張檢視，理由與原圖 hash 記於 data/hair-salon-visual-review-2026-10.json；與正式 WebP hash 綁定的證據在發布目錄 visual-review.json。
- words 快取標籤失效後，兩個正式網域共 148 個 API／HTML 探針通過：英日雙方向、一般與 cache-busting、完整發布 ID 集合、詞頭音檔、分類三語／封面、120 個詞條詳情回應的例句／詞塊，以及分類與詳情路由。
- iOS CardWord 欄位形狀通過既有 checker；瀏覽器確認正式分類顯示 30 詞及正常圖片。
- 隔離的 main 工作區：型別、Next build、全套 881 passed／11 skipped／0 failed 通過；476 詞／952 例句的 frozen eval 機械檢查 100%，與 baseline 相同。11 項依測試的既有環境條件略過，包含隔離 PostgreSQL 與缺少相鄰 iOS checkout 的檢查；正式 DB 另有上述唯讀比對。
- 一般 seed 同時防護全部 30 個 ID 與新分類；公開備援資料不暴露本批內容；分類讀取要求所有 30 詞皆已發布且未刪除。

證據目錄：output/hair-salon-release-20261022。最終紀錄：release.json；精確 DB 比對 database-exact-match.json；語意與音檔 content-review.json；媒體 remote-media.json；雙網域 api-production.json、api-secondary.json；畫面 hair-salon-live.png。

## 範圍與未執行項目

全庫 API checker 另記錄 picnic-sheet、superball-scooping、chocolate-banana、ramune 四個既有詞的平／片假名表示差異；本批 30 詞沒有這些問題。全庫語意檢查的 review template 仍為 pending，本次只完成新系列的逐筆覆核；未重做全庫媒體檢視、逐段主觀聽音或 iOS 實機測試。

正式動作：301 個新物件、60 個正式例句 ID 預留、1 次完整發布交易、1 次 words 標籤快取失效。沒有部署、push、rollback，未修改自訂或收藏詞。

提交在獨立 main 工作區完成；原工作區同時進行的 feat/atlas-public-search 修改及 iOS 修改均保留。
