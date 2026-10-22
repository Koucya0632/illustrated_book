# 銀行系列：正式資料發布與驗證紀錄

日期：2026-10-22（Asia/Tokyo）。使用者已明確授權上傳、正式資料庫寫入、提交及推送 main。

新增 12 詞、36 筆釋義、24 個三語例句、48 條英日句子詞塊、12 張詞圖、1 張分類封面、108 段發音。上傳 121 個不可覆寫、內容定址素材。已發布主詞庫由 1143 增至 1155 詞。

## 本次範圍

| ID | English | 日本語 | 繁中 |
|---|---|---|---|
| passbook | passbook | 通帳 | 存摺 |
| cash-card | cash card | キャッシュカード | 提款卡 |
| bank-counter | bank counter | 銀行窓口 | 銀行櫃台 |
| queue-ticket | queue ticket | 番号札 | 號碼牌 |
| queue-ticket-dispenser | queue ticket dispenser | 番号札発券機 | 取號機 |
| form-filling-desk | form-filling desk | 記入台 | 填單台 |
| personal-seal | personal seal | 印鑑 | 個人印章 |
| seal-case | seal case | 印鑑ケース | 印章盒 |
| bank-transfer-form | bank transfer form | 振込依頼書 | 匯款申請書 |
| deposit-slip | deposit slip | 入金伝票 | 存款單 |
| cash-envelope | cash envelope | 現金封筒 | 現金信封 |
| banknote-counter | banknote counter | 紙幣計数機 | 點鈔機 |

既有 bank／銀行、bank-teller／銀行窓口係、convenience-store-atm／コンビニATM 保留；未搬移詞條。提款卡、信用卡、存款單、匯款申請書、個人姓名章與辦公室橡皮章的概念分別處理。

## 正式操作與恢復

- 121 個素材採 create-only 上傳，完整下載比對 bytes／SHA-256；遠端 108 段 MP3 另驗完整 frame sequence。
- 先將 24 個正式例句 ID 寫入原始恢復清單，再建立例句音檔路徑。
- 所有詞、釋義、例句、詞塊、音檔資料與分類在單一 DB 交易中插入並發布，交易前後均比對完整內容。
- 發布後再於唯讀交易執行同一份完整內容比對器；全部符合不可變計畫。
- [原始 apply manifest](/Users/rex/Desktop/tuji/tuji-web/output/bank-publish-prep/apply-manifest-2026-10-22T14-46-15-547Z.json)；SHA-256：`a728d92f85a70fe7463edd43b58bbed09794df5a18be0a9752a3c610e3900f6c`。
- [封存發布計畫](/Users/rex/Desktop/tuji/tuji-web/output/bank-publish-prep/publish-plan-f6f50df7b0fcdc72f4cdc47bebeb6cb0153ffc0d88ced4066ebaaeaffd2862e7.json)；SHA-256：`f6f50df7b0fcdc72f4cdc47bebeb6cb0153ffc0d88ced4066ebaaeaffd2862e7`。
- Plan digest：`7cc1fe3bde3602664971f184e45e96166c5bd143da2903b3c57541346d3dcc52`。
- [可攜式發布證據與物件清單](releases/bank-series-2026-10.json)。中斷恢復須沿原 manifest；本次沒有 rollback。

## 發布後檢查

| 層級 | 結果與限制 |
|---|---|
| DB 完整內容 | 12 詞、24 句及所有相依資料與原發布計畫完全相符。 |
| 雙例句與點擊翻譯 | 12 詞／24 句結構、三語意思、A2/B1 層次及 48 條英日詞塊通過；每詞每句有具體審閱理由與精確來源快照。 |
| 圖片 | 12 張遠端 WebP 已全量視覺覆核；1 張封面 hash 與已審閱版本相同。全部 1024×1024。 |
| 主詞／例句發音 | 36／72 段 owner/locale、來源文字、MP3 frame、MIME、hash 通過；未宣稱全段人工聽審。 |
| 英日 API 與 iOS 欄位 | 兩種學習方向主詞、媒體投影、24 組詞條詳細 API、48 條顯示句子的詞塊與語境義通過。必要及可選 Codable 欄位形狀通過；未做 iOS 裝置測試。 |
| 一般／避快取 | 英日完整主詞 payload 已收斂，皆為 1155 詞；先前暫存缺漏只在既定快取更新期間出現。 |
| 分類／詞條網頁 | 一般及避快取網址共 26 個探測均 200；分類頁包含全部 12 詞。 |
| 一般部署與備用路徑 | 新詞 ID 與整個分類受保護；缺 DB、查詢失敗、未完整發布均不會提前出現。 |
| main 整合 | 以 origin/main 為基礎的獨立工作目錄只納入銀行變更；49 項相關測試、TypeScript、Next.js build 與 whitespace check 通過。 |
| 部署 | 本次未執行手動部署。使用者授權推送 main；由既有 Git 自動流程處理後續動作。 |

整個詞庫的資料庫一致性檢查通過 1155 詞，雙例句與詞塊機械檢查通過 2310 句。本次僅對新增銀行系列完成語意覆核，不聲稱其餘詞條已全量語意覆核。全詞庫 API 檢查另標出既有 picnic-sheet、superball-scooping、chocolate-banana、ramune 四筆純假名讀音書寫形式差異；它們不屬本次銀行系列，未改動。

## 稽核與素材

- [preview](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/preview.html)
- [screenshot](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/preview-screenshot.png)
- [contactSheet](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/contact-sheet.png)
- [catalogBefore](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/catalog-before.json)
- [categoryQuery](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/category-query-probe.json)
- [previewVerification](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/preview-verification.json)
- [candidate](/Users/rex/Desktop/tuji/tuji-web/data/bank-series-2026-10.json)
- [spans](/Users/rex/Desktop/tuji/tuji-web/data/example-spans-bank-2026-10.json)
- [semanticReview](/Users/rex/Desktop/tuji/tuji-web/data/bank-semantic-review-2026-10.json)
- [visualReview](/Users/rex/Desktop/tuji/tuji-web/data/bank-visual-review-2026-10.json)
- [finalImageReview](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/final-image-review.json)
- [imagePrompts](/Users/rex/Desktop/tuji/tuji-web/data/bank-image-prompts-2026-10.json)
- [imageSources](/Users/rex/Desktop/tuji/tuji-web/output/bank-2026-10/sources)
- [versionedImages](/Users/rex/Desktop/tuji/tuji-web/output/bank-2026-10/images)
- [imageManifest](/Users/rex/Desktop/tuji/tuji-web/output/bank-publish-prep/image-manifest.json)
- [audioManifest](/Users/rex/Desktop/tuji/tuji-web/output/bank-audio-candidates/generated-manifest.json)
- [audioVerification](/Users/rex/Desktop/tuji/tuji-web/output/bank-audio-candidates/verification-report.json)
- [publishPlan](/Users/rex/Desktop/tuji/tuji-web/output/bank-publish-prep/publish-plan-f6f50df7b0fcdc72f4cdc47bebeb6cb0153ffc0d88ced4066ebaaeaffd2862e7.json)
- [dryRun](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/publisher-dry-run.log)
- [tests](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/final-tests.log)
- [typecheck](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/typecheck.log)
- [build](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/build.log)
- [appliedManifest](/Users/rex/Desktop/tuji/tuji-web/output/bank-publish-prep/apply-manifest-2026-10-22T14-46-15-547Z.json)
- [postReleaseDatabase](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/stored-content-verification.json)
- [postReleaseExamples](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/example-audit.json)
- [postReleaseSemanticReview](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/semantic-review.json)
- [postReleaseImages](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/images/audit.json)
- [postReleaseVisualReview](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/images/visual-review.json)
- [postReleaseRemoteImages](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/remote-image-audit.json)
- [postReleaseAudio](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/audio-audit.json)
- [postReleaseApi](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/api-audit.json)
- [postReleaseDetailApi](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/detail-api-audit.json)
- [postReleaseRoutes](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/web-route-audit.json)
- [cacheHistory](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/cache-poll-history.json)
- [mainTests](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/main-tests.log)
- [mainTypecheck](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/main-typecheck.log)
- [mainBuild](/Users/rex/Desktop/tuji/tuji-web/output/bank-preparation/main-build.log)
- [發布後完整狀態表](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/release-ledger.json)
- [全詞庫雙例句機械檢查](/Users/rex/Desktop/tuji/tuji-web/output/bank-post-release/catalog-examples/audit.json)

## 日本用語與外觀依據

三菱 UFJ 的[臨櫃開戶說明](https://www.bk.mufg.jp/kouza/order/)、[振込規定](https://www.bk.mufg.jp/regulation/furikomi.html)及[表單範例](https://www.bk.mufg.jp/houjin/chohyo_kinyu.html)，以及[ダイト紙幣計數機](https://www.daito-inc.co.jp/products_cat/note/)用於核對用語及設備類型。銀行表單格式依機構而異；紙本存摺與印章不代表所有帳戶的必要條件。圖片是單獨生成並逐張審閱的教學素材，鈔票不作現行日圓版面教學。
