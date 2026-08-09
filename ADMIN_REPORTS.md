# Tuji Web Admin 與 Reports

更新日期：2026-07-01

## 1. Admin 的角色

Web admin 是內部工具，服務三件事：

- 詞庫管理。
- Atlas/UGC 管理與下架。
- 數據與問題排查。

Admin 不是 iOS 使用者入口，不應被一般使用者看到。

## 2. 目前主要入口

| 路徑 | 用途 |
|---|---|
| `/admin` | 管理首頁 |
| `/admin/words` | 詞庫列表與管理 |
| `/admin/words/new` | 新增詞 |
| `/admin/stats` | 統計 |
| `/admin/reports` | 回報/檢舉 |
| `/admin/atlas` | Atlas 內容管理 |
| `/admin/members` | 會員 Pro 狀態查詢、手動贈與／收回 |

會員頁支援用 **Email 或 TJ UID** 查詢。多數 Apple 登入帳號是 private relay 信箱，
用對方寄信的地址查不到人 —— 請他提供 UID，或直接從 `/admin/feedback` 處理（App 內
意見回饋一定帶著帳號，列表上也直接顯示方案）。

訂閱的營收、續訂與流失數字看 App Store Connect，後台不重做。退款與取消由 App Store
通知自動降級，後台沒有也不需要「取消訂閱」。

## 3. API

| API | 用途 |
|---|---|
| `/api/admin/words` | 詞 CRUD |
| `/api/admin/words/:id` | 單詞更新/刪除/補充 |
| `/api/admin/upload` | 圖片上傳 |
| `/api/admin/fetch-image` | 服務端抓圖 |
| `/api/admin/reports/:id` | 處理 report |
| `/api/admin/atlas/items` | Atlas item 管理 |
| `/api/admin/atlas/items/:id` | Atlas item 更新 |
| `/api/admin/members/:id/entitlement` | 手動贈與／收回 Pro（理由必填） |

## 4. 審核用途

App Store 若問 Atlas/UGC：

- 使用者可刪除自己的 Atlas item。
- Admin 可查看、處理、下架公開內容。
- AI 生成內容需要使用者確認。

如果 iOS 開放公開圖鑑，必須讓使用者也能在 App 內找到檢舉入口；只有 admin 後台不夠。

## 5. 安全規則

- Admin route 必須與一般 auth 分開。
- 不把 service role client 暴露到 client component。
- 所有 admin write 都要驗證身份。
- 圖片上傳限制 MIME/type/size。
- 操作應可追蹤，至少保留 created/updated timestamp。

## 6. 待補

- Report list 的處理狀態標準化。
- Atlas 公開內容的使用者端檢舉入口。
- Admin 操作審計事件。
- 更清楚的 TestFlight Review 說明素材。
