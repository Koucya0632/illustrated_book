# 演唱會與粉絲應援系列（2026-10-19）

狀態：正式資料庫及媒體已發布，主圖鑑由 885 增至 901 詞；正式部署與下游快取驗證結果記錄於下方 release-ledger.json。使用者已確認範圍為演唱會與粉絲應援用品。

已備妥 16 個新詞、32 句英日繁中例句、64 個英文／日文句子版本（500 個完整詞塊）、16 張詞圖與 1 張分類封面，以及 144 段音檔；正式素材合計 161 個。例句每詞兩句，簡單 A2、複雜 B1；詞頭另有 CEFR。

[圖片總覽](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/contact-sheet.png) · [機器可讀檢查報告](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/readiness-report.json) · [不可變發布計畫](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-publish-prep/publish-plan-0817785fced16892a962d28de8f8e9948d589dbef431106f5ebe14b647873620.json)

## 新增詞彙

| 繁中 | English | 日本語 | 讀音 |
| --- | --- | --- | --- |
| 演唱會門票 | concert ticket | コンサートチケット | コンサートチケット |
| 應援手燈 | light stick | ペンライト | ペンライト |
| 應援扇 | cheering fan | 応援うちわ | おうえんうちわ |
| 應援扇保護套 | uchiwa fan cover | うちわカバー | うちわカバー |
| 入場手環 | admission wristband | 入場用リストバンド | にゅうじょうようリストバンド |
| 雙筒望遠鏡 | binoculars | 双眼鏡 | そうがんきょう |
| 演唱會耳塞 | concert earplugs | ライブ用耳栓 | ライブようみみせん |
| 壓克力立牌 | acrylic stand | アクリルスタンド | アクリルスタンド |
| 徽章 | pin badge | 缶バッジ | かんバッジ |
| 演唱會銀帶 | concert streamer | 銀テープ | ぎんテープ |
| 銀帶收納吊飾 | concert streamer holder | 銀テープホルダー | ぎんテープホルダー |
| 痛包 | fan display bag | 痛バッグ | いたバッグ |
| 票券收納套 | ticket holder | チケットホルダー | チケットホルダー |
| 周邊販售攤位 | merchandise booth | 物販ブース | ぶっぱんブース |
| 麥克風架 | microphone stand | マイクスタンド | マイクスタンド |
| 演唱會舞台 | concert stage | コンサートステージ | コンサートステージ |

## 已通過

- 正式資料庫 SELECT-only 預檢：目前 885 個已發布主詞；新 ID、英日詞頭、分類與句子均無碰撞。實際例句 ID 2995–3026 已由發布清單記錄。
- 16 個概念與 32 句例句逐項語意覆核，共 48 筆有具體理由並綁定來源雜湊的紀錄。全部英日詞塊逐字重組、三語語境義與日文完整讀音通過；不是獨立母語者覆核。
- 17 張原始圖片逐張檢視，WebP 總覽再次全量覆核。全部 1024×1024、有效 WebP、唯一 ID／物件路徑，來源 PNG 與正式 WebP 分開保存。
- 48 段詞頭與 96 段例句音檔，涵蓋 en-US、en-GB、ja-JP；逐檔驗證來源文字、擁有者、locale、大小、SHA-256 與完整 MP3 解碼。未執行逐檔聽審。
- 一般 migration 在 ID 與分類兩層阻擋未發布系列；共用 seed 寫入邊界也拒絕所有受保護系列。分類僅在完整 16 詞已發布時顯示。
- 無資料庫、資料庫錯誤、空查詢及同步查找的備援測試通過。本機正式建置連接現有資料庫的雙向 API（一般與 cache-busting）不含新詞；分類與詞條頁均為 404。
- TypeScript、正式建置通過。全套測試 815 通過、9 略過、0 失敗。修正一項以舊分類陣列文字作判斷的測試，改為直接驗證實際備援內容。

## 發布計畫

內容 digest：`f4fb3f8ee310c4b983ff39e2f9d95a045d717b3de62a052d4f9be48d31b24fb1`。不可變計畫檔案 SHA-256：`0817785fced16892a962d28de8f8e9948d589dbef431106f5ebe14b647873620`。

發布器預設為唯讀，已在正式邏輯資料庫及 R2 tuji-assets 目標做 dry run。正式寫入需要另行授權與兩個目標指紋確認。流程會保留／記錄真實例句 ID、以 create-only 寫入不可變素材、重新下載全部素材驗證完整 bytes 與雜湊，然後在單一資料庫交易中插入並發布整批。未完成的 journal 必須使用原 manifest 恢復；不會另起第二次發布。回復刪除是另外的破壞性操作，且保留可能被共用的 Storage 素材。

## 正式發布與後續驗證

使用者於 2026-10-19 明確授權上傳、寫入正式資料庫、提交及部署。已以一筆交易發布 16 詞、32 例句、500 詞塊、32 學習卡及相依資料；create-only 上傳 161 個不可變素材，全部遠端 bytes／SHA-256 與 MP3 frame 檢查通過。圖片透過內建 imagegen 產生，音檔使用 Google Chirp 3 HD。

正式資料庫與計畫的逐欄比較、所有遠端素材，以及本系列語意／例句檢查已通過。唯讀全庫資料檢查也通過 901 詞、1802 例句的結構檢查；其餘既有詞的完整語意與視覺覆核未在本次重做，不宣稱全庫健康。英日 API、iOS 現行模型解碼、分類／詞條路由、部署及快取收斂的最終結果，以 release-ledger.json 與 RELEASE_REPORT.md 為準；實體裝置未檢查。

既有本機 API 的英語方向目前回傳 885 詞，日語方向 857 詞；這是發布前基線，本次沒有擴張成全庫修正。

## 正式紀錄

- [發布與恢復清單](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-publish-prep/apply-manifest-2026-10-19T09-14-24-086Z.json)
- [正式內容與素材檢查](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/published-content-audit.json)
- [本系列例句與語意檢查](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/series-example-audit/audit.json)
- [分層發布紀錄](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/release-ledger.json)
- [最終發布報告](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/RELEASE_REPORT.md)

## 檔案與資料保留

- [candidate](/Users/rex/Desktop/tuji/tuji-web/data/concert-fan-support-series-2026-10.json)
- [spans](/Users/rex/Desktop/tuji/tuji-web/data/example-spans-concert-fan-support-2026-10.json)
- [semantic](/Users/rex/Desktop/tuji/tuji-web/data/concert-fan-support-semantic-review-2026-10.json)
- [visual](/Users/rex/Desktop/tuji/tuji-web/data/concert-fan-support-visual-review-2026-10.json)
- [images](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-publish-prep/image-manifest.json)
- [audio](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-audio-candidates/verification-report.json)
- [prompts](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/image-sources.json)
- [overview](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/contact-sheet.png)
- [tests](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/full-tests.log)
- [typecheck](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/typecheck.log)
- [build](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/build.log)
- [preflight](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/publisher-preflight.log)
- [privacy](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/local-api-privacy.json)
- [fallback](/Users/rex/Desktop/tuji/tuji-web/output/concert-fan-support-2026-10/no-db-fallback.json)

本次保留 iOS 既有 Localizable.xcstrings 修改，未修改 iOS、Android、自訂詞或收藏詞。媒體及操作產物位於 Git 忽略的 output 目錄；可簽入來源位於 data、lib、scripts、tests。

## 日本外觀與用詞參考

- [RUIFAN／KING BLADE 官方](https://ruifan.co.jp/)：手持應援ペンライト形態。
- [Sanrio 推し活官方商品](https://www.sanrio.co.jp/special/enjoyidol/goods/) 與 [官方銀テホルダー資料](https://corporate.sanrio.co.jp/news/assets/pdf/2019/20220308102818305s.pdf)：うちわケース、銀帶收納與攜帶用途。
- [Kenko Tokina 演唱會雙筒望遠鏡](https://www.kenko-tokina.co.jp/optics/binoculars/concert/)：小型雙筒結構與演唱會用途。
- [Alpine 音樂用耳塞](https://www.alpinehearingprotection.com/collections/music)：濾音耳塞的物件形態。
- [zakkamart 官方痛バッグ](https://zakka-mart.com/?cid=&keyword=&mode=srh&page=2&sort=p)：徽章展示用包袋用詞。

以上為概念與外觀參照；生成素材沒有使用這些品牌或藝人肖像。
