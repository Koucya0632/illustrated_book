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

權益綁定 Tuji 帳號，同一帳號在 Android 與 iOS 共用。Pro 已停售並停止新增手動贈與；符合資格的舊 Pro 已轉為永久會員點數制，訂閱與贈與歷史保留供退款與查帳。

手動贈與可選永久會員或點數，兩者理由皆必填（最多 500 字）。永久會員無到期日，已持有權益不重複贈與，僅 grant／legacy_pro 可人工收回，商店購買由原商店退款處理。點數可選 1,000／4,000／7,000 或自訂正整數；須持有有效永久會員且點數制已開啟。點數以 adjustment 來源永久保留，不列購買收入，也不占月贈或簽到額度。

點數發放、帳本與贈與理由／actor／時間在同一錢包鎖及交易提交；同一 request key 重送不重複發點，改數量或理由則拒絕。正式／沙盒由伺服器配置決定。會員詳情顯示錢包現存餘額與最近 50 筆點數贈與；查看後台不會自動發月贈。點數制會員顯示永久會員及 200 格，AI 用量按次列示，不再顯示舊的每月次數上限。

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
| `/api/admin/members/:id/entitlement` | 贈與／收回永久會員；舊 Pro 僅保留收回 API |

| `/api/admin/members/:id/credit-grants` | 查看點數餘額與贈與紀錄／手動贈與點數 |

## 6. 安全與操作規則

- Admin route 與一般 auth 分開，所有管理 write 都要驗證身份。
- Service role client 只存在 server side。
- 上傳限制 MIME、size 與處理後尺寸；不信任檔名。
- 權限贈與、收回、審核與下架必須保留 actor、理由與時間。
- 不在 log 或產品事件保存 token、email、原圖簽名 URL、自由輸入全文。
- Reports 的處理狀態、moderation 狀態與內容 visibility 是不同概念，不應互相覆寫。
