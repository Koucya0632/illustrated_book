# Tuji Web Admin 與 Reports

更新日期：2026-10-01

## 1. Admin 的角色

Web admin 是內部工具，服務詞庫維護、UGC 審核、使用者問題排查、會員權限與營運觀測。它不是一般產品頁，不應被 iOS 使用者或搜尋引擎當成公開入口。

## 2. 主要入口

| 路徑 | 用途 |
|---|---|
| `/admin` | 管理首頁 |
| `/admin/words` | 詞庫 CRUD 與 enrich |
| `/admin/reports` | Study／內容回報 |
| `/admin/feedback` | App 內意見回饋 |
| `/admin/atlas` | 公開項目審核 |
| `/admin/atlas/collections` | 合集審核 |
| `/admin/atlas/reports` | 項目／合集／作者檢舉 |
| `/admin/atlas/funnel` | upload → recognize → confirm → cards 漏斗與 AI 成本 |
| `/admin/members` | 會員搜尋與有效權限摘要 |
| `/admin/members/:id` | 訂閱、贈與、到期日與權限流水帳 |
| `/admin/stats` | 產品統計；付費客戶數只計訂閱，不把贈與算收入 |

會員搜尋支援 Email 與 TJ UID。Apple private relay 地址常與使用者聯絡地址不同；查不到時請使用 App 內 feedback 已附帶的帳號，或請對方提供 UID。

## 3. 會員權限

權益綁定 Tuji 帳號，同一帳號在 Android 與 iOS 共用。Pro 有兩個獨立來源：

- App Store 訂閱：由 verify／notification 更新，取消、退款與續訂由 Apple 決定。
- 手動贈與：管理員可指定天數贈與或收回，理由必填。

後台顯示訂閱、Pro 贈與與永久權益紀錄。手動贈與預設選擇永久會員；切換 Pro 才需填天數，兩種操作皆需填理由。永久會員無到期日，Pro 到期後仍保留；已持有永久權益不重複贈與，僅 grant／legacy_pro 可人工收回。商店購買由原商店退款處理，收回贈與不會取消訂閱。

統計頁的 Pro／永久會員／免費人數互斥，三者合計為總註冊；「持有永久權益」另外包含仍在 Pro 的帳號。付費訂閱與贈與分開計算。匿名工作階段分開列出網站、iOS、Android；Android 每次 App 程序的首次前台開啟送出 app_open，畫面重建與背景工作不重複計數，舊版 App 的歷史事件無法回補。

## 4. Reports 與 moderation

使用者端目前可提交：

- Study 題目回報。
- App feedback。
- 物見公開項目檢舉。
- 公開合集檢舉。
- 作者身分檢舉。

項目與合集送審會先經機器政策，結果可直接批准、轉人工或拒絕。檢舉的高風險理由／累積門檻可把內容升級到人工佇列；admin 依 target 類型前往項目、合集或作者處理並保留 moderation event。

iOS 的檢舉 UI 只有在伺服器成功接受後才顯示「已收到檢舉」。429、401 或網路失敗不能冒充成功。

## 5. 代表 API

| API | 用途 |
|---|---|
| `/api/admin/words*` | 詞庫 CRUD／enrich |
| `/api/admin/reports/:id` | Study report 處理 |
| `/api/admin/feedback/:id` | Feedback 處理 |
| `/api/admin/atlas/items*` | 公開項目審核與管理 |
| `/api/admin/atlas/collections/:id` | 合集審核 |
| `/api/admin/atlas/reports/:id` | Atlas report 狀態處理 |
| `/api/admin/atlas/funnel` | 漏斗與 AI 用量 |
| `/api/admin/members/:id/entitlement` | 手動贈與／收回 Pro 或永久會員 |

## 6. 安全與操作規則

- Admin route 與一般 auth 分開，所有管理 write 都要驗證身份。
- Service role client 只存在 server side。
- 上傳限制 MIME、size 與處理後尺寸；不信任檔名。
- 權限贈與、收回、審核與下架必須保留 actor、理由與時間。
- 不在 log 或產品事件保存 token、email、原圖簽名 URL、自由輸入全文。
- Reports 的處理狀態、moderation 狀態與內容 visibility 是不同概念，不應互相覆寫。
