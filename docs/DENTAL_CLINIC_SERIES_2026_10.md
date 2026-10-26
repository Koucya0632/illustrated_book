# 牙科診所系列：正式發布與驗證完成

日本時間 2026-10-26 23:20:54。

正式新增 **14 詞、42 筆釋義、28 句三語例句、56 組英日詞塊、14 張詞圖、1 張分類封面與 126 段發音**。上傳 141 個全新素材，覆寫 0；正式已發布主詞由 1,227 增至 1,241。

[正式分類](https://everyday-english-picture-dictionary.vercel.app/category/dental-clinic) · [發布記錄](releases/dental-clinic-series-2026-10.json) · [原始不可變計畫](releases/dental-clinic-publish-plan-c945b3100fcdbdbfd30258fc2a92114f7e9bad63b81461401ea233ba520bf9de.json) · [正式 apply manifest](releases/dental-clinic-apply-manifest-2026-10-26T14-05-09-691Z.json)

## 詞條

| English | 日本語 | 繁中 |
|---|---|---|
| dental clinic | 歯科医院 | 牙科診所 |
| dental chair | 歯科診療台 | 牙科診療椅 |
| dental mirror | デンタルミラー | 牙科口鏡 |
| dental bib | 歯科用エプロン | 牙科圍巾 |
| dental suction tip | 排唾管 | 牙科吸唾管 |
| dental filling | 詰め物 | 補牙填補物 |
| dental crown | 被せ物 | 牙冠套 |
| dentures | 入れ歯 | 活動假牙 |
| braces | 歯列矯正装置 | 牙齒矯正器 |
| dental impression tray | 印象用トレー | 牙科取模托盤 |
| intraoral camera | 口腔内カメラ | 口內攝影機 |
| cavity | 虫歯 | 蛀牙 |
| dental X-ray | 歯のレントゲン写真 | 牙科X光片 |
| interdental brush | 歯間ブラシ | 牙間刷 |

保留既有牙醫、牙科衛生士、牙刷、牙膏、牙線與漱口水的原分類。詰め物為局部填補物、被せ物為牙冠套、入れ歯為可摘式假牙；矯正器圖採固定式托槽金屬線。

## 驗證

| 層級 | 結果 |
|---|---|
| 正式資料庫 | READ ONLY 逐欄核對發布計畫，詞條、定義、讀音、兩句例句、翻譯、詞塊、gloss、媒體、分類與卡片完全一致。14 詞在同一交易中發布。 |
| 語意與讀音 | 14 詞及 28 句有個別具體編審；以現行正式資料與原始計畫完全相符為條件復用，沒有批次泛用 pass。 |
| 圖片 | 15 張原圖逐張檢視，正式 WebP 都為 1024×1024；遠端 hash 與已檢視本機圖片完全一致。提示詞與原始 PNG 保存在本機。 |
| 音檔 | 主詞 42 段、例句 84 段，owner、locale、文字來源、路徑及雜湊符合；遠端 MP3 完整 frames 通過。未宣稱逐段主觀聽審。 |
| 公開 API／iOS 形狀 | zh-en 與 zh-ja 的一般及避快取 URL 均為 1,241 詞，含完整 14 新詞，欄位和 locale 投影正確，內容一致。未執行 iOS 裝置測試。 |
| 詳情與路由 | 56 次雙方向一般／避快取詳情、14 個詞頁及 1 個分類頁，共 71 個請求通過；詳情例句和目標語詞塊可精確重組。 |
| 全庫結構 | 1,241 主詞、2,482 例句，基本一致性與例句結構通過；既有全庫語意覆核未完成，不宣稱全庫完全健康。 |
| 種子與 fallback 防護 | 每個新 ID 和分類都受防護；一般 migration、無 DB／錯誤／空分類結果和同步 helpers 均不意外公開未發布內容。 |
| 最新 main 整合 | 只新增牙科內容；939 測試通過、11 略過、0 失敗，型別與固定語料 eval 通過，Webpack 生產建置通過。 |

原工作區和最新 main 分開處理，未混入原分支 c58a4a7 或尚未提交的寵物用品／租屋設備。原工作區變更保留。這份記錄隨牙科系列提交並推送至 main；實際提交識別以 Git 歷史和推送後稽核檔為準。

## 既有警示與限制

公開 API 稽核仍有 4 個非本系列詞的假名書寫格式警示：`picnic-sheet`、`superball-scooping`、`chocolate-banana`、`ramune`。日文詞頭使用片假名而 reading 使用平假名，未修改這些既有詞。這些警示不在牙科系列驗證通過的範圍內。

隔離工作區的預設 Turbopack 建置在既有 Google 字型解析處失敗；改用 Webpack 生產建置通過。Node 22 重試也重現該本機問題；未修改字型來源或建置設定。基底 main 的 GitHub CI 已通過，牙科提交的遠端 CI 另於推送後核對。

正式操作：上傳 141、覆寫 0、預留例句 ID 28、資料庫整批發布 1。沒有執行 routine migration、rollback、Storage 清理或手動部署；沒有修改 iOS、自製詞或收藏詞。推送 main 可能觸發既有自動部署。

## 證據位置

本機完整後驗證：

- [stored-content-verification.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/stored-content-verification.json) · SHA-256 `b0b0392c983ce9b8acbfa24406734cb5c25f493f8dc160947df5da3fdc6ac8a8`
- [audio-database.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/audio-database.json) · SHA-256 `a6c6aec90164df53f4fffe13f50fb399d0726467e65b0b58c2f352fb295357a8`
- [remote-media-verification.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/remote-media-verification.json) · SHA-256 `9890d10136c92985fcde0047250958fabb5663e88cd358c041a4ec159062b516`
- [content-review.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/content-review.json) · SHA-256 `5c17ccd5909f1335754ba64c06156653f121429461e149982b7f24d348024536`
- [api-verification.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/api-verification.json) · SHA-256 `3d6ce7c7c298dab828630b791937e865c06ae49dce4236cf16c8293983cae825`
- [routes-verification.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/routes-verification.json) · SHA-256 `7f9e6b2f14e34b9b43fcf0edd55afb5a074c70d44df3f38bfb18ff82e75652f6`
- [catalog-examples/audit.json](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-post-release/catalog-examples/audit.json) · SHA-256 `94f9007f76b1ee0ce167c51ba751ff10d324ddd42e5739507c8f970ac81353e6`

- [可試聽本機預覽](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-preparation/preview.html)
- [圖片總覽](/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-preparation/contact-sheet.png)
- [本批提示詞](../data/dental-clinic-image-prompts-2026-10.json)
- 圖片來源與版本 WebP：`/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-2026-10/`
- 正式恢復 manifest：`/Users/rex/Desktop/tuji/tuji-web/output/dental-clinic-publish-prep/apply-manifest-2026-10-26T14-05-09-691Z.json`
- 發布中斷或後續恢復須沿用原 manifest、計畫及其綁定的本機來源；不建立第二個未受控 apply。rollback 另需授權。

日本用語與外觀參考：

- [官方參考 1](https://www.jda.or.jp/go/check.html)
- [官方參考 2](https://www.jda.or.jp/consultation/vol-08.html)
- [官方參考 3](https://www.jda.or.jp/Foreign-temporary-workers/pdf/mouth-Health-Handbook_v02.pdf)
- [官方參考 4](https://pd.dental-plaza.com/)
- [官方參考 5](https://www.morita.com/jmmc/ja/products/diagnostic-and-imaging/intraoral-camera/penviewer/)
- [官方參考 6](https://www.lion-dent-health.or.jp/labo/article/tool/04-1/)
- [官方參考 7](https://www.gc.dental/japan/products/professional/impression-material/impression-trays)
- [官方參考 8](https://service.yoshida-dental.co.jp/ca/series/10337/spec)
