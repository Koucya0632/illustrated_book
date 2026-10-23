# 證件系列：正式發布與驗證

日本時間2026-10-23。使用者已授權素材上傳、正式資料庫寫入、提交及推送main。

已新增10詞、30筆釋義、20句三語例句、40組英日句子詞塊、10張詞圖、1張分類封面及90段音檔。正式主詞由1171增為1181，一般API與避快取API皆已可見完整系列。

| English | 日本語 | 繁中 |
|---|---|---|
| passport | パスポート | 護照 |
| driver's license | 運転免許証 | 駕駛執照 |
| residence card | 在留カード | 在留卡 |
| My Number card | マイナンバーカード | 個人編號卡 |
| student ID card | 学生証 | 學生證 |
| international driving permit | 国外運転免許証 | 國際駕駛許可證 |
| health insurance eligibility certificate | 資格確認書 | 健保資格確認書 |
| certificate of residence | 住民票の写し | 住民票謄本 |
| seal registration certificate | 印鑑登録証明書 | 印鑑證明書 |
| seal registration card | 印鑑登録証 | 印鑑登錄卡 |

既有employee-id-card／社員証保留在辦公室分類。沒有搬移舊詞或修改自訂、收藏內容。在留卡採2026年新版形式示意；健保項目使用資格確認書；印鑑登錄卡與印鑑證明書分開。圖片為教學辨識示意，未作文件真偽教材。

## 正式操作

- 101個全新素材以create-only上傳，0覆寫。每個物件於上傳後與DB交易前均完整下載核對大小、MIME及SHA-256；發布後再核對全部101個物件。
- 先預留20個正式例句ID並存入恢復manifest，再解析例句音檔路徑。
- 單一資料庫交易寫入全部相依資料並發布10詞；沒有提交半套可公開子資料。
- 發布後以READ ONLY交易逐欄比對主詞、釋義、日文詞頭及讀音、例句、翻譯、詞塊、三語gloss、分類、卡片及媒體，與封存計畫完全一致。
- 1次words快取標籤失效；沒有手動部署、rollback或刪除舊物件。推送main後由既有平台流程處理。

## 驗證結果

| 層級 | 結果 |
|---|---|
| 全庫DB基礎一致性 | 1181詞通過。 |
| 全庫例句結構 | 2362句及其英日詞塊機械檢查通過；全庫語意仍未重新審閱。 |
| 本批逐筆語意 | 10詞／20句各有具體理由及精確來源hash；正式來源完全一致後沿用已完成判定。 |
| 遠端圖片 | 全部11張為1024×1024有效WebP，MIME、大小與hash通過，與已逐張審閱的素材一致。 |
| 發音 | 詞頭30段、例句60段分開；owner、locale、source text、完整MP3 frames、MIME、大小與hash通過。未宣稱逐段主觀聽審。 |
| 正式API／iOS形狀 | 52個英日主詞、所有詞條詳情與多語分類API探針通過；目前CardWord必要及可選欄位契約符合。未做iOS實機測試。 |
| 網頁與快取 | 22個一般／避快取分類及詞條頁面探針通過；兩方向主詞ID集合皆為1181，一般與避快取已收斂。 |
| main整合 | 以origin/main的獨立目錄只納入證件變更。型別、Next build、909項測試通過、11項依既有環境條件略過、0失敗；169項隔離PostgreSQL整合測試通過；476詞／952句frozen eval機械檢查100%，與baseline相同。 |
| 一般部署防護 | 每個新ID與分類均受seed防護；公開備援和同步helpers排除；分類只有全部計畫主詞皆已發布才顯示。 |

全庫API另有picnic-sheet、superball-scooping、chocolate-banana、ramune四筆既有純假名書寫差異；本批沒有這些問題。沒有宣稱全庫語意、圖片或主觀聽審已全部通過。

## 計畫與恢復證據

- 不可變計畫：publish-plan-57b12c781c27f7c51e7186b830f3500438175a102d9f1e784ac022ac4114daa2.json
- 計畫檔SHA-256：57b12c781c27f7c51e7186b830f3500438175a102d9f1e784ac022ac4114daa2
- Plan digest：80de54d3bb49843a2f6d842e41806e2f8e2cd8189d413728e1c8b883027ad41c
- Apply manifest：apply-manifest-2026-10-23T04-10-02-523Z.json，狀態applied，SHA-256 a9bbf03e18ac5e5ee5df337819c113ed9bd0c6cf318a9c862c7fd2ce3cbc1b22
- [可攜式恢復與驗證清單](releases/identity-documents-series-2026-10.json)：含20個真實例句ID映射及101個物件的精確鍵、URL、大小、MIME、hash與上傳狀態。
- 詳細本機證據：output/identity-documents-post-release。中斷須先檢查原manifest，不另啟第二次apply。

正式分類：[證件](https://tuji.nexflow.team/category/identity-documents)。

用語與外觀參考：[出入國在留管理廳新版卡說明](https://www.moj.go.jp/isa/tokutei)、[厚生勞動省資格確認方式](https://www.mhlw.go.jp/stf/newpage_50657.html)、[My Number卡官方介紹](https://www.kojinbango-card.go.jp/kojinbango-/)、[警察廳駕照整合](https://www.npa.go.jp/bureau/traffic/r4kaisei_main.html)、[新宿區印鑑登錄及證明](https://www.city.shinjuku.lg.jp/todokede/koseki03_000005.html)。
