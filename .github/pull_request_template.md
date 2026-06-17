<!--
分支命名：
  feat/<area>-<short>     新功能
  fix/<area>-<short>      修 bug
  refactor/<area>-<short> 不改外部行為的重寫
  chore/<short>           升 deps / 雜事
  docs/<short>            純文件
  hotfix/<short>          緊急修

Commit 走 Conventional Commits：
  feat(api): /api/study/answer 寫回 SRS 狀態
  fix(auth): server action 沒帶 session 時回 401 而非 500

跨 repo 規矩看傘 repo 的 CONTRIBUTING.md。
-->

## 改了什麼

<!-- 一句話描述 -->

## 為什麼

<!-- 連結設計書 / Issue / iOS 端對應 PR；沒有就 N/A -->

- Issue: ___
- iOS 對應 PR（API 合約改動時）: Koucya0632/tuji-ios#___

## 影響範圍（勾有改到的）

- [ ] 新增 / 改變 **API route**（`app/api/**`）→ 注意 iOS 端合約
- [ ] 改 **DB schema** / 寫了 migration（`scripts/migrate.ts`）
- [ ] 改 **Supabase RLS / policy**
- [ ] 動到 **env var**（新增 key → 同步到 Vercel env，三個環境都設）
- [ ] 改 **zod schema**（request / response 驗證）
- [ ] 改共用元件（`components/**`）→ 全站視覺檢查
- [ ] 改 enrich / translate 腳本（`scripts/**`）

## Self-review checklist

### 紀律（每次都檢查）

- [ ] **Secrets**：service-role key / DB 連線字串沒進 client bundle、沒進 log、沒 commit
- [ ] **Auth**：受保護的 route / server action 都驗過 session，沒有靠前端藏按鈕
- [ ] **RLS**：新表 / 新查詢在 RLS 開啟下測過，沒繞過 row 權限
- [ ] **輸入驗證**：API 入口用 zod parse，沒直接信任 request body
- [ ] **Server / Client 邊界**：`"use client"` 只加在需要的地方；server 機密沒外洩到 client component
- [ ] **N+1 / 熱路徑**：list 查詢沒在迴圈內逐筆打 DB
- [ ] **型別**：沒有新增 `any` / `@ts-ignore` 來壓錯

### 看狀況

- [ ] 改 API 合約 → iOS 端 PR 已對齊（或標記 breaking、排好上線順序）
- [ ] 加 migration → 在 staging DB 跑過、可重入、舊資料不會壞
- [ ] 新依賴 → 檢查 bundle 體積與授權條款
- [ ] 改快取 / `revalidate` → 確認沒有把使用者私有資料快取成公開

## 截圖 / 錄影

<!-- UI 改動必附；桌機 + 手機寬度各一，深淺底各一 -->

| 改之前 | 改之後 |
|---|---|
|  |  |

## 測試

- [ ] `npm run lint`（`next lint`）過
- [ ] `npm run build` 過
- [ ] 本機 `npm run dev` 手動測過（golden path + 邊界）
- [ ] Vercel preview 部署點過

## Rollout 注意

<!-- 上 prod 要特別注意的事；沒有就刪 -->
<!-- 例：「需要先在 Vercel 設好 NEW_API_KEY，且 migration 要先跑」-->

---

<!--
PR 大小：≤ 400 行 / ≤ 8 檔 順暢；> 400 拆；> 1000 一定拆。
合併用 Squash merge，合完自動刪分支。
-->
