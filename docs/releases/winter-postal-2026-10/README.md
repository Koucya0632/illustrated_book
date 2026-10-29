# 冬季郵局擴充：便攜證據

本目錄保存正式使用過的原始計畫、apply manifest、v2 修正前後快照與 journal、獨立審查及發布後稽核的原始 bytes。`restoration-index.json` 記錄每份檔案的原位置、便攜位置、大小與 SHA-256。這是歷史證據，不是重新發布的要求或授權。

## 乾淨 checkout 的離線檢查

安裝專案依賴後，不需要 `.env`、資料庫、ignored `output/`、模型金鑰或媒體下載即可執行：

```sh
node scripts/restore-winter-postal-2026-10-evidence.mjs
node --test tests/winter-postal-2026-10-plan.test.mjs tests/winter-postal-2026-10-kudasai-v2.test.mjs
npm test
```

一般測試入口 `winter-postal-2026-10-offline.test.ts` 也會執行本批 13 項測試。發布器測試使用原計畫的衍生副本，在臨時目錄放合成媒體 bytes，以測試 digest、來源、媒體大小、分類及審查閘門；不宣稱重新驗證歷史 MP3/WebP 的語意或格式。v2 測試使用實際修正計畫的完整前後快照。

## 復原可執行工具需要的 ignored 證據

```sh
node scripts/restore-winter-postal-2026-10-evidence.mjs --restore
```

這只將精確證據複製至原 `output/winter-postal-2026-10/` 路徑，不覆寫任何不同 bytes。若要執行需要實際媒體的歷史 dry-run 或打開本機預覽，可另選：

```sh
node scripts/restore-winter-postal-2026-10-evidence.mjs --restore --media
```

`--media` 只下載 manifest 列出的 20 個已發布公開物件，核對完整大小、SHA-256 與 MIME 後保存至 ignored 路徑；不會上傳、寫 DB、產生媒體或預留例句 ID。它不會下載原 PNG，因原 PNG 沒有公開物件 URL；原生成檔留在製作工作區，不應為了重現歷史而重新生成。發布後稽核所需的正式 WebP 與 MP3 均可由上述物件恢復。

需要資料庫的稽核須另由使用者提供適當環境。不要將 `.env` 或憑證提交。歷史發布器與修正工具的來源按已套用計畫的 hash 原樣保存；缺少 ignored 檔案時應復原證據，不能改寫來源或已套用計畫來通過檢查。

## 證據分層

- [原發布計畫](evidence/publish-plan-4dc7b1fd16da209521dfd360f7359a066c17508cfd64e306d1c3a911533a8dea.json)與 [apply manifest](evidence/apply-manifest-2026-10-29T08-51-06-358Z.json)：兩詞、四例句與 20 個物件。
- [v2 修正計畫](evidence/correction-v2/correction-plan-745ad740a5d986a4af64da616ccd127b21757f1521118774b07f727398b773d2.json)及 [applied journal](evidence/correction-v2/correction-apply-745ad740a5d986a4af64da616ccd127b21757f1521118774b07f727398b773d2.json)：只將獨立 `ください` 改為不可點，不改顯示句或媒體。
- [發布後摘要](evidence/post-release-review/final-summary.json)：本批 DB、遠端媒體、雙正式網域普通／避快取 API 與使用者路徑結果。
- [原始需求](request.md)：保存當時四批需求供理解第 1 批的選詞裁量；本次 Git 整合不包含第二批內容製作。

既有分類 canonical 映射只新增兩個已發布 ID。原計畫內的補丁與「發布後才套用」順序按歷史原樣保留，並非要求在現已整合的 registry 再次套用補丁。發布後的實際整合結果見 [canonical 證據](evidence/canonical-image-integration-post-publication.json)。

## 正常部署相容性

本次程式整合另加入兩筆已發布詞條的例句 pair，及 v2 詞塊 corpus，供既有 `migrate` 在部署時辨識，未加入 words seeds 或公開備援。原15個發佈計畫來源保持原bytes。

- [整合前 published/pair 覆蓋核對](code-integration/published-pair-coverage-before.json)：READ ONLY 證實 origin/main 唯一缺漏是本批兩詞。
- [整合後真實資料只讀比對](code-integration/migration-live-readonly-plan.json)：全庫1243 published IDs均有pair，本批兩pair均屬target，四句與八組英日span的文字、讀音、版本與三語gloss完全吻合v2，正常例句同步對本批預期為no-op。這份查核沒有執行正式migration。
- `winter-postal-2026-10-migration.test.ts` 以拒絕所有DML的fixture SQL呼叫真實例句同步器，驗證本批與完整註冊詞庫no-op、未發布拒絕及編輯衝突拒絕。
