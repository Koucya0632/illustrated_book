# 冬季結帳擴充：便攜證據

本目錄保存第二批實際使用的 `0202e769…` 發布計畫、apply manifest、獨立審查及發布後稽核原始 bytes。`restoration-index.json` 記錄來源、大小與 SHA-256；舊的未套用候選計畫不在復原清單中。這是歷史證據，不是重新發布授權。

兩個新詞為 `point-card`（loyalty card／ポイントカード）與 `drinking-straw`（ストロー），皆屬免費便利商店主題。既有 `plastic-bag` 保留超市分類及學習權益，只追加 `レジ袋` 搜尋別名、繁中基本 note 與英日 note；不新增同義詞條。

## 離線核對與證據復原

```sh
node scripts/restore-winter-checkout-2026-10-evidence.mjs
npm test
```

不需要 `.env`、資料庫、ignored `output/` 或媒體下載，即可核對便攜證據與計畫綁定的程式／資料來源。測試含 bag CAS、真實顯示函式與正常例句同步器的拒絕寫入 fixture。音檔已做來源、語系、完整 bytes／MP3 frame／解碼核對，未宣稱主觀完整聆聽。

```sh
node scripts/restore-winter-checkout-2026-10-evidence.mjs --restore
node scripts/restore-winter-checkout-2026-10-evidence.mjs --restore --media
```

`--restore` 將原始證據復原至 ignored 路徑，拒絕覆寫不同 bytes。選用 `--media` 才會下載 manifest 中已發布的 20 個公開 WebP／MP3，驗證完整大小、SHA-256 與 MIME；不會上傳、寫 DB、保留 ID 或重新生成。原 PNG 未公開，留在製作工作區。歷史製作／發布工具仍需適當環境及原技能契約，不能改寫已套用計畫或其 sources 來繞過檢查。

## 程式同步

發布後才套用已審補丁：新增兩組例句 pair、英日 span corpus、兩個 canonical image key，沒有新增 words seed 或公開備援詞。英文靜態 note 僅精準追加已審用法，避免後續手動 `apply-localized-texts` 恢復舊值；其餘 JSON entries／欄位不變。正常 migrate 不改寫既有袋詞的 alias、繁中 note 或日文 note，未新增例行袋詞 writer。

`winter-checkout-2026-10-migration.test.ts` 呼叫真實同步器，以拒絕所有 DML 的 fixture 驗證已發布詞庫 no-op、未發布與後續編輯拒絕。發布器、計畫與來源保持原始 bytes；補丁是歷史順序紀錄，已整合後不要再次套用。產品程式提交、推送與部署由主對話另核對授權。

## 最終資料上線驗證

[獨立發布後摘要](evidence/post-release-review/final-summary.json)及[完整探針明細](evidence/post-release-review/http-probes-compact.json)確認：DB 完整比對、20 個遠端媒體、兩詞四例句官方檢查、8 個 API 解碼形狀探針與 76 個唯一使用者 URL 均通過；30 組普通／避快取 JSON 的本批內容一致。全庫 1245 詞的機械稽核無問題，未宣稱全庫語意逐詞重審。

驗證中曾遇到連線數上限及普通 API 快取尚未更新，經降載、重試及本批 words 快取處理後收斂；過程見[已去除敏感資訊的紀錄](evidence/verification-load-incident.json)。原始私人 runtime logs 未納入，重複的大型全詞庫 HTTP payload 只保留本機路徑／SHA 參照，便攜證據保存逐 probe 狀態、原因與本批 payload。

目前 `restoration-index.json` 封存 58 份精確證據與 12 個不可變來源依賴；在沒有原 output 或環境檔的暫存 checkout，驗證及復原 58/58 均通過。程式同步仍為本地準備，尚未提交、推送或部署。
