# 冬季第一批：郵局擴充發布與驗證

日期：2026-10-29。工作批 `winter-2026-01`。使用者已授權正式上傳與資料庫發布，現已新增兩詞並完成發布後獨立驗證，主圖鑑由 1,241 增為 1,243 詞。發布稽核時提交、推送與部署尚未執行；本文件記錄當時的內容發布狀態，後續程式整合與部署由獨立 Git 變更記錄。

正式分類：[郵局](https://tuji.nexflow.team/category/postal-services)。[發布後獨立稽核](releases/winter-postal-2026-10/evidence/post-release-review/final-summary.json)涵蓋本批全部內容、20 個媒體物件與網站／App 兩正式網域共 40 個一般／避快取探針。

原需求：[2026 冬季第 1 批](releases/winter-postal-2026-10/request.md)。

## 本批定稿

| ID | English | 日本語／讀音 | 繁中 |
| --- | --- | --- | --- |
| new-years-postcard | New Year's postcard | 年賀はがき／ねんがはがき | 賀年明信片 |
| mourning-postcard | mourning postcard | 喪中はがき／もちゅうはがき | 服喪明信片 |

本批新增 2 詞、6 筆釋義、4 句三語例句、8 組英日詞塊、2 張 WebP、18 段 MP3（6 段主詞、12 段例句）。兩詞都屬既有免費主題 `postal-services`，`relatedWords` 都連到已發布的 `postcard`；不新增主題、不改分類封面或分類翻譯。

### 給行銷的取捨

- **年賀状不另立詞條**：年賀はがき是郵局販售、帶年賀標示與抽獎號碼的預付郵資明信片；年賀状則是記有新年問候的書狀，也可使用普通明信片。按需求保留年賀はがき，釋義說明兩者差別，避免製作兩個高度重疊的圖像詞條。T005 的窗口購買題目可使用年賀はがき。
- **服喪通知的收件禮節保留但不絕對化**：釋義保留「收到者通常避免寄賀年卡、改以寒中問候致意」，同時說明服喪者收到賀年卡本身並不失禮。不能把通知的本旨寫成禁止對方寄卡。
- **插圖限制**：年賀圖省略當年度面額、年份與官方票樣細節；喪中通知圖省略個資。兩張都是概念插圖，不可當作當年度官方票樣或可直接寄用的郵品。

概念依據：[日本郵便明信片種類](https://www.post.japanpost.jp/service/send/domestic/mail/postcard/)、[日本郵便切手禮節](https://www.post.japanpost.jp/enjoy/culture/howto/stamp/)、[日本郵便年賀狀教材](https://data.schoolpost.jp/9716/1475/8269/online_nenga_teacher_tebiki.pdf)。教材明確區分年賀用明信片與年賀狀，並說明服喪期間收卡及寒中問候的慣例；此處沒有引用教材的舊年份作為 2026 年寄送時程。

## 審查與檢查

| 層級 | 結果／證據 |
| --- | --- |
| 本批內容結構 | 2 詞各有完整讀音分段、2 例句、三語對齊欄位及全句可重建的英日詞塊；[機械報告](releases/winter-postal-2026-10/evidence/preparation-report.json)。 |
| 獨立內容審查 | 2 詞／4 句／8 組詞塊逐項通過。初審要求修正日文釋義對年賀状的概念，已修正並複查；[最終審查](releases/winter-postal-2026-10/evidence/independent-review-content.json)，初審檔保留。 |
| 圖片 | 兩張原 PNG 與正式 WebP 均經獨立逐張審查，1254×1254、bytes/hash/概念/日本外觀/風格通過；[圖片審查](releases/winter-postal-2026-10/evidence/independent-review-images.json)。 |
| 音檔 | 18 段實際 Google Chirp3-HD MP3；source/owner/locale、bytes/hash、完整連續 frames、ffprobe 及 ffmpeg 全段解碼通過；[製作驗證](releases/winter-postal-2026-10/evidence/audio-candidates/verification-report.json)、[獨立驗證](releases/winter-postal-2026-10/evidence/independent-review-audio.json)。未宣稱全段主觀聽審。 |
| 正式站碰撞核對 | READ ONLY 交易查得全庫當時 1,241 個已發布主詞，兩新 ID、英文詞頭、日文詞頭與句塊皆無衝突；既有郵局分類與 postcard 確認存在。[DB 前檢](releases/winter-postal-2026-10/evidence/database-preflight.json)、[雙學習方向搜尋證據](releases/winter-postal-2026-10/evidence/api-preflight.json)。 |
| 本批發布器 | 沿既有受保護發布器作既有分類增補版；刪除分類新增／翻譯寫入／封面物件／rollback 刪分類。正式 ID mapping 先持久化再建例句音檔路徑。S3 限定 create-only，不走無法保證原子性的 REST fallback。[獨立程式及計畫審查通過](releases/winter-postal-2026-10/evidence/independent-review-publisher.json)，正常與缺少 S3 設定的唯讀分支皆實際驗證。 |
| 發布前真實 dry run | DB 與 S3 HeadBucket／List(max1) 只讀探測通過，分開回報 databaseWriteReady 與 storageCreateOnlyReady。[日誌](releases/winter-postal-2026-10/evidence/publisher-dry-run.txt)。此前檢當時未執行 PUT；其後獲授權 apply 已完成 20 物件上傳與發布後驗證。 |
| 計畫負向測試 | 7 項通過：有效計畫至 DB 設定關卡、內容 digest、分類封面、不同分類、未通過獨審、來源 hash、媒體大小。全部不提供 DB 憑證且無 apply。[測試結果](releases/winter-postal-2026-10/evidence/plan-negative-tests.txt)。 |
| 公開備援與部署 | 未將候選匯入公開種子／備援，避免普通部署誤發。因首頁使用圖片清單筆數，兩個圖片鍵先保存為補丁，DB 發布及驗證後才套入本地 canonical 清單；全部舊映射保留。[發布後整合](releases/winter-postal-2026-10/evidence/canonical-image-integration-post-publication.json)。提交／推送／部署另授權，未宣稱部署端靜態映射已同步。 |
| 型別與建置 | 最終發布器與圖片映射定稿後，`npx tsc --noEmit` 及 `npm run build` 均 exit 0；[型別日誌](releases/winter-postal-2026-10/evidence/typecheck-final.log)、[建置日誌](releases/winter-postal-2026-10/evidence/build-final.log)。未執行會寫入正式資料的 vercel-build/migrate。 |
| 上線後驗證 | [獨立稽核通過](releases/winter-postal-2026-10/evidence/post-release-review/final-summary.json)：原計畫加 v2 詞塊修正逐欄相符，20 個遠端物件通過，兩正式網域英日方向的普通／避快取 API、詳情、分類及頁面共 40 個探針通過。本批 iOS 解碼形狀通過；未做實機或主觀聽審。 |

## 預覽與不可變計畫

- 本地完整預覽：依[證據復原說明](releases/winter-postal-2026-10/README.md)復原後，位於 `output/winter-postal-2026-10/preview.html`；含兩圖、三語內容、詞塊提示及 18 段音檔。
- [最新計畫指標](releases/winter-postal-2026-10/evidence/latest-plan.json)：保存不可變計畫檔名、SHA-256 及內容 digest，舊計畫保留不覆寫。
- [不可變原發布計畫](releases/winter-postal-2026-10/evidence/publish-plan-4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea.json)，SHA-256 `4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea`；發布器 SHA-256 `531adc29a7cdb84a71e69d20d5a19cb2b9f1fc678658c9e2da28af5a60181831`。計畫鎖定圖片映射補丁與發布後整合順序，原檔與全部來源未改寫。
- [Apply manifest](releases/winter-postal-2026-10/evidence/apply-manifest-2026-10-29T08-51-06-358Z.json)：狀態 applied，SHA-256 `54f22c4aa5725d87a3974290bb916d92f2969e87cb0a928dc32f85898eeeab17`；4 個真實例句 ID 為 3707–3710。[可攜式發布證據](releases/winter-postal-2026-10.json)保留物件清單與修正證據。
- [完整來源候選](../data/winter-postal-2026-10.json)及[詞塊](../data/example-spans-winter-postal-2026-10.json)。
- [本批發布器](../scripts/publish-winter-postal-2026-10.ts)預設只做 dry run；原計畫包含當時內容／詞塊／圖片／音檔／獨審報告／發布器來源 hash、既有分類 before-state、20 個媒體物件規格。原計畫音檔使用 `{exampleId}` 模板；獲授權 apply 已預留並持久化 3707–3710 的映射，再解析正式路徑。

以下為原製作階段命令紀錄；已發布的計畫不可重新封存或重跑 apply。乾淨 checkout 的離線測試與證據復原，見[便攜證據說明](releases/winter-postal-2026-10/README.md)。

```sh
node --env-file=.env.local scripts/prepare-winter-postal-2026-10.mjs --check-db --check-api --finalize
node scripts/verify-winter-postal-2026-10-audio.mjs
node --test tests/winter-postal-2026-10-plan.test.mjs
npx tsx --env-file=.env.local scripts/publish-winter-postal-2026-10.ts
```

首次生成音檔另使用本批 `plan-winter-postal-2026-10-audio.mjs` 與 `generate-winter-postal-2026-10-candidate-audio.mjs`。已有相同 source 的音檔可重用，不必因非語音釋義修正而重生。

以上命令保留為製作階段的操作紀錄，原計畫已發布，不應重新啟動第二次 apply。正式操作已使用使用者明確授權；未執行提交、推送、部署或 rollback。

## 正式操作與 v2 點擊邊界修正

20 個全新物件 create-only 上傳（0 覆寫），上傳後與 DB 提交前完整核對遠端 bytes。預留四個例句 ID 後先保存映射，再建立例句音檔路徑；單一交易寫入並發布全部兩詞及相依資料，沒有提交半套草稿。

發布後官方例句 checker 發現簡單句中獨立 `ください` 應不可點擊。另建[v2 詞塊](../data/example-spans-winter-postal-2026-10-v2.json)、[不可變修正計畫](releases/winter-postal-2026-10/evidence/correction-v2/correction-plan-745ad740a5d986a4af64da616ccd127b21757f1521118774b07f727398b773d2.json)與[獨審](releases/winter-postal-2026-10/evidence/post-release-review/independent-correction-v2-review.json)，六項回歸／負向測試通過後，以完整前後快照與舊值保護的交易只更新該 span、刪三筆 gloss。[執行紀錄](releases/winter-postal-2026-10/evidence/correction-v2/correction-apply-745ad740a5d986a4af64da616ccd127b21757f1521118774b07f727398b773d2.json)狀態 applied。句子、其他詞塊、圖片與音檔完全不變。最終 DB 比較採原計畫加 v2 overlay，保留原發布歷史證據。

[本批官方例句檢查](releases/winter-postal-2026-10/evidence/post-release-review/scoped-official-example-check/audit.json)兩詞／四句機械及逐筆語意皆通過、0 問題；[全庫例句檢查](releases/winter-postal-2026-10/evidence/post-release-example-contract-final/audit.json)1,243 詞／2,486 句機械通過，整庫語意未重審。整庫 API checker 尚有四筆歷史純假名讀音書寫差異，不屬本批；本批無解析或快取差異。

只針對 `words` tag 做兩次失效、一次快取刪除，沒有清除其他 tag；最終兩正式網域普通及避快取回應均為 1,243 詞，兩詞及 v2 詞塊可見。已更新行銷上線紀錄。未做全庫圖片／語意重審、主觀全段聽審、iOS 實機及裝置快取測試。
