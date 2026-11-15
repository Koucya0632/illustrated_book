# 工作批上線紀錄與流程

這個資料夾放每一批詞上線時留下的證據：候選檔快照、publish plan、apply manifest、上線後檢查。

## 舊的 publisher 凍結為證據

2026-11 以前的每一批都有自己的一組腳本：`scripts/publish-<批>-series.ts`（或 `publish-winter-*`、`publish-travel-tokyo-*`），共 28 支，加上 `prepare-<批>-publish-plan`、`plan-<批>-audio`、`generate-<批>-candidate-audio`、`verify-<批>-audio` 和 `package.json` 裡對應的 npm script。

**這些檔案不再修改。** 它們是當時實際寫進正式資料庫的程式，留著是為了能回答「那一批是怎麼上線的」，以及需要時用同一支腳本做 rollback（manifest 記的是它自己的格式）。修 bug、改流程都只改共用 publisher。

## 新主題的流程（共用 publisher）

適用：開一個新主題的工作批。加詞到已上線主題（`expandsLiveTopic`）、只維護例句的 `post-publication` 批次不走這條路。

1. **登記**：候選檔放 `data/<主題>-series-<yyyy-mm>.json`，在 `lib/catalogue/releases.ts` 尾端加一筆 `guardedCandidate("<主題>-<yyyy-mm>", candidate, { ownsCategoryRecord: true, sharedPublisher: true })`。登記之後一般部署就會守門：詞、圖片、主題都等 publisher。
2. **圖片與審核**：照 `WORD_IMPORT.md` 第 6 節產圖；`output/<主題>-publish-prep/` 下要有 `image-manifest.json`、`visual-review.json`、`semantic-review.json`，span 放 `data/example-spans-<主題>-<yyyy-mm>.json`。
3. **音檔**：
   ```bash
   npm run release:audio:plan -- --release <id>
   npm run release:audio:generate:local -- --release <id>
   npm run release:audio:verify -- --release <id>
   ```
   verify 需要 `ffprobe`、`ffmpeg`，會寫出 `verification-report.json` 和 `mp3-frames-report.json`。
4. **準備 plan**（唯讀）：
   ```bash
   npm run release:prepare-publish -- --release <id> --check-db
   ```
   產出 `output/<主題>-publish-prep/publish-plan.json` 與不可變的 `publish-plan-<sha256>.json`。plan 會鎖住每個審核過的輸入，**也鎖住共用 publisher 自己的程式**（`lib/catalogue/publish/*.ts`、`scripts/publish-release.ts`）：準備之後只要其中任何一個檔案改了，publisher 就拒絕執行，要重新準備。
5. **Dry run**，再用它印出的指紋 apply：
   ```bash
   npm run release:publish -- --release <id>
   npm run release:publish -- --release <id> --apply --confirm-host <db> --confirm-storage <storage>
   ```
   apply 先把 Storage 物件（內容定址、只新增不覆寫）全部上傳並下載比對，最後在**同一個交易**裡寫入草稿並發佈。中途失敗會留下 `apply-manifest-*.json`，用 `--apply --resume <manifest>` 接著做；要撤回用 `--rollback <manifest>`（同樣要兩個指紋），Storage 物件保留。
6. **留證據**：把 plan 與 apply manifest 複製到這個資料夾。

程式在 `lib/catalogue/publish/`：`descriptor.ts`（檔案位置慣例）、`prepare.ts`、`audio.ts`、`plan.ts`（驗證與鎖定）、`database.ts`、`storage.ts`、`publish.ts`。測試：`tests/release-publisher.test.ts`、`tests/release-publisher-postgres.test.ts`（臨時 Postgres 走 dry run、中斷、續跑、重複發佈被擋、rollback）。
