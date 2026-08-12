# Tuji Web Product Modules

更新日期：2026-08-12

## 1. 模組總覽

| 模組 | Web 角色 | iOS 依賴 |
|---|---|---|
| Catalog | 詞庫、分類、搜尋、本地化、振假名 | 高 |
| Study | queue、answer、stats、reports、SRS log | 高 |
| Progress | progress、mastery、top words | 高 |
| User | settings、profile、sync、feedback、blocks | 高 |
| Atlas／物見 | 私人創作、公開合集、收藏與學習 | 高 |
| Billing | 訂閱、贈與、有效權限、配額 | 高 |
| Moderation | 機審、人工佇列、檢舉、下架 | 高 |
| Admin | 內容、會員、回報與營運工具 | 中 |
| Events | 輕量產品事件 | 中 |

## 2. Catalog

代表 endpoint：`/api/words`、`/api/words/:id`、`/api/categories`、`/api/search`、`/api/users/custom-words`。

- 公開詞庫可 public cache；自製詞與使用者資料不可共享快取。
- `lang` 決定釋義／分類顯示語言，`learning` 決定英語或日語資料集。
- 日文 response 可帶 `readingSegments`；切分不可信時只帶 reading fallback。
- 搜尋 client cache 與 server request 都必須包含語言方向。

## 3. Study

代表 endpoint：`/api/study/queue`、`/api/study/answer`、`/api/study/stats`、`/api/study/reports`、`/api/atlas/study/*`。

- Queue 合併公版、自製與已收藏物見項目。
- Answer 驗證 card ownership/visibility，更新 SRS 與 mastery。
- Study log 是 best-effort；複習求救提示寫入 `metadata.hinted`。
- 方向化 request 必須帶 `learning`，避免切換語言後短 TTL 保留舊方向資料。

## 4. Progress

代表 endpoint：`/api/users/progress`、`/api/users/mastery`、`/api/users/top-words`、`/api/users/favorites`、`/api/users/learned`、`/api/users/sync`。

- iOS 可 optimistic update 收藏／已學，後端仍是最終權威。
- 清除進度不清收藏、設定或 Atlas。
- Progress/mastery/stats 都按學習方向隔離。

## 5. User

代表 endpoint：`/api/users/me`、`/api/users/settings`、`/api/users/profile`、`/api/users/delete-account`、`/api/users/feedback`、`/api/users/blocks`。

- Profile 是暱稱、簽名與頭像的唯一編輯入口；公開作者資料由同一投影產生。
- UID 是不可變公開 handle，不以 email 作顯示名 fallback。
- 封鎖只影響物見 discovery；已收藏內容與學習紀錄保留。
- 登出必須清除 iOS 的 account-scoped store，避免下一帳號繼承資料。

## 6. Atlas／物見

私人創作 endpoint：`/api/atlas/images/*`、`/api/atlas/items/*`、`/api/atlas/sync`、`/api/atlas/entitlement`。

公開／消費 endpoint：

- `/api/atlas/public`、`/api/atlas/public/:slug`、`/api/atlas/public/by-lemma`
- `/api/atlas/public/collections/*`
- `/api/atlas/public/authors/:username`
- 單項／合集 save、合集 learn
- 項目／合集／作者 report

目前產品單位是「合集」：作者挑選自己的已完成項目、設定名稱／簡介／頭像後送審。通過後可在物見瀏覽；使用者收藏合集後解鎖成員，並可整批加入學習。單字詳情只在確有公開內容時注入「大家的圖鑑」，沒有空狀態佔位。

收藏物見內容使用 `savedItemsLimit`（預設 Free 1000、Pro 5000），不消耗自製圖鑑 `atlasSlotsLimit`。

## 7. Billing

代表 endpoint：`/api/billing/verify`、`/api/billing/appstore-notifications`、`/api/atlas/entitlement`、`/api/admin/members/:id/entitlement`。

- App Store 訂閱與營運贈與分表保存，有效權限取聯集。
- 同一訂閱只綁一個 Tuji 帳號。
- 管理員只能贈與／收回贈與，不能取消 App Store 訂閱；理由必填。
- 權限 response 同時帶自製格數、普通 AI、高精度 AI、物見收藏限制與 usage。

預設限制：

| 能力 | Free | Pro |
|---|---:|---:|
| 自製圖鑑 | 3 | 300 |
| 普通 AI／月 | 30 | 500 |
| 高精度 AI／月 | 0 | 30 |
| 已收藏物見項目 | 1000 | 5000 |

## 8. Moderation

- 項目與合集 submission pipeline 都會跑圖片／文字政策。
- 狀態包含 draft、pending_auto、pending_review、approved、rejected、takedown、withdrawn。
- 使用者可檢舉公開項目、合集與作者；檢舉成功才顯示已收到。
- 高風險理由或累積門檻可升級人工處理；admin 可批准、忽略、退回或下架。
- 作者封鎖由帳號名單控制，不應使公開 GET 失去 CDN 快取。

## 9. Admin

Admin 是內部工具，包含詞庫、reports、feedback、Atlas 項目／合集審核、Atlas 漏斗、會員權限與統計。一般使用者不可進入；所有 write 都要有 admin 驗證與可追蹤理由。

## 10. Events

`/api/events` 是 private/no-store。不得記錄 token、email、圖片 URL、自由輸入全文或未脫敏錯誤 payload。Study log 與 entitlement ledger 是各自的權威操作紀錄，不應混進一般產品事件。
