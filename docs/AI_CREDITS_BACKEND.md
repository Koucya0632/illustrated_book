# 罐頭點數後端：開發進度

已完成錢包、月贈／簽到、新照片報價辨識、基本補充／補償、Apple 入帳／退款及 Web／iOS／Android 畫面。另有只讀帳本檢查與上線文件。以下前兩階段保留當時驗證紀錄；最新規則見本頁及第七階段；產品定稿見 ../../docs/AI_CREDITS_PRODUCT_DECISIONS.md。2026-10-06 已正式切換，以下歷史進度保留當時狀態；最新結果見頁末正式公開切換紀錄。

## 已實作規則

- 當月免費額度自動更新至 1,000 點，不累積，同月不補滿；每天簽到 10 點，UTC 每月最多 300 點。2 月按實際天數領取。
- 有效永久可領福利；AI_CREDITS_REPLACE_LEGACY_ENABLED 開啟後所有有效永久帳號自動轉制，包含仍有效的 Pro，政策與首筆月贈同一交易；簽到及購買點永久有效。
- 同一日期／月份只有一筆領取紀錄。消費、到期與改政策不會重置領取額度。
- 贈點依最早到期順序使用，接著使用無效期贈點，最後使用購買點數。購買點數沒有到期日。
- 同一帳號與環境的異動鎖同一帳號列；點數、預留、領取與帳本在同一資料庫交易提交。
- 預留先降低可用餘額；成功結算扣除點數，失敗釋放。已過期的預留點數釋放後立即記錄到期。
- 相同操作重試回原狀態；金額變更或相反的結算結果回衝突。已釋放操作不能靠重試重新預留。
- `walletVersion` 為遞增十進位字串，避免 BIGINT 被客戶端截斷。帳本按數字 ID 分頁。
- Sandbox 與正式環境的餘額、領取與操作完全分開，環境由伺服器設定。
- 新表與 RLS 在同一交易建立，沒有客戶端直接讀寫政策。資料庫失敗回 503。

## API

| 路徑 | 用途 |
| --- | --- |
| `GET /api/credits/wallet` | 自動月贈更新；餘額、預留、月贈／簽到／購買點可用量、UTC 重置與本月紀錄 |
| `GET /api/credits/ledger?cursor=…` | 每頁最多 50 筆與下一頁游標；附目前錢包 |
| `POST /api/credits/benefits/monthly/claim` | 舊端相容；自動當月月贈防重複，三端已移除按鈕 |
| `POST /api/credits/check-in` | 簽到；月上限後仍記錄簽到，金額為 0 |

POST 不採用客戶端傳入的金額、日期、帳號或環境。跨站瀏覽器 POST 會被拒絕；原生 App 可使用既有登入驗證。API 均不快取。

## 開關

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| `AI_CREDITS_MODE` | `off` | `live` 開放；`shadow` 目前保留，不發點、不扣點 |
| `AI_CREDITS_ENVIRONMENT` | 關閉時為 `production` | 啟用 live／shadow 必須明填 `sandbox` 或 `production` |
| `AI_CREDITS_READ_ENABLED` | `false` | 暫停新工作時可保持錢包／帳本查詢 |
| `AI_CREDITS_MONTHLY_ENABLED` | `false` | 月贈獨立開關 |
| `AI_CREDITS_CHECK_IN_ENABLED` | `false` | 簽到獨立開關 |
| `AI_CREDITS_REPLACE_LEGACY_ENABLED` | `false` | 有效永久自動取代舊制，包含有效 Pro |
| 舊效期環境變數 | 不再生效 | 月贈固定下月重置，簽到永久有效 |

月贈自動更新、簽到永久保留及舊永久直接替換已定稿。更新在帳號鎖內，月份唯一 claim 防重複；同月消費後不補滿，不累積離線月份。有效 Pro 已核定立即轉永久會員點數制，剩餘 Pro 期限不另補點已核定。沒有公開政策寫入入口。

`createCreditWallet` 的 `grant` 是內部帳本原語，不是已驗證的購買流程；不可直接把客戶端交易 ID 當作已付款來源。第二階段透過 `transact` 把任務異動與 `reserve`／`settle` 放在同一交易。錢包本身不按時間直接刪除預留，由任務服務驗證執行權與對帳截止時間後結算。

## 資料庫與測試

完整 migration 已接入 `migrateCreditSchema`，只新增表，不改舊權益。開發驗證僅使用 Docker 的隔離 PostgreSQL，不執行正式 migration。

```sh
npm run test:credits:integration
npx tsc --noEmit
npm test
npx next build
```

整合測試命令會建立獨立 PostgreSQL 17 容器、跑測試並清除容器；需 Docker 可用。它不載入 `.env.local`，不使用 `DATABASE_URL`。一般 `npm test` 會略過未提供獨立測試庫的資料庫套件；不可把這個略過當成交易測試已通過。

測試包含多裝置領取、併發扣點、混合來源、跨月／2 月、到期後退點、寫入故障回滾、RLS 與帳本分頁。

### 第一階段驗證（2026-10-03）

- 點數整合測試：26 項全部通過，使用全新 PostgreSQL 容器；結束後已清除。
- TypeScript：通過。
- 全站測試：665 通過、2 略過、0 失敗。點數資料庫測試在上一項獨立執行，沒有依賴略過結果。
- Next.js 正式建置：通過。
- 既有圖鑑 frozen fixture eval：通過，476 詞／952 例句，結果維持既有基準。
- CI 已加入點數資料庫測試步驟，尚未觸發遠端 CI。

沒有執行正式資料庫 migration、會員切換或商店價格調整。

## 正式上線前

1. 有效 Pro 立即轉制已核定；剩餘 Pro 期限不另補點已核定，退款人工結案工具待完成。
2. 建立商店商品及實際售價，完成 Sandbox／TestFlight 付款與退款。
3. 部署前驗證 migration、排程、吞吐量、真機 UI 及帳本監控；依核定 cohort 分批開放。

US$1.99 是商店商品價格，不能只改程式常數。正式售價與 Pro 商品下架尚未操作。

## 第二階段：辨識任務與 200 格（2026-10-03）

本階段接入**既有私人圖片**的普通與高精度辨識。普通 100 點、高精度 100 點，先普通再高精度合計 200 點。新增拍照上傳、手動建卡的新入口及附帶補充仍待接入；不能把本階段視為首發功能已全部完成。

### 流程與 API

| 路徑 | 行為 |
| --- | --- |
| `POST /api/ai/quotes` | 指定 imageId、feature、targetLanguage、glossLanguage；取得 5 分鐘報價 |
| `POST /api/ai/operations` | 提交 quoteId 與 `Idempotency-Key` header；點數、任務、必要格數一起保留，回 202 |
| `GET /api/ai/operations/[id]` | 查任務；只有已扣點並提交成功的結果會公開 |
| `POST /api/ai/operations/[id]/cancel` | 只取消尚未執行的任務，同一交易釋放點數與容量 |
| `POST /api/ai/operations/[id]/confirm` | 選 candidateId，原子建卡；同一任務最多綁定一張卡，重送不另扣點 |
| `GET /api/cron/ai-operations` | 受 CRON_SECRET 保護，一次處理一筆待辦或恢復任務 |

報價保存圖片 hash、語言、功能、費率與政策版本。客戶端不能覆寫金額。相同識別與內容重送取回原任務；更換內容回衝突。報價不預扣，接受時再次查永久權益、圖片與容量。

新增 `ai_quotes`、`ai_operations`、`ai_operation_attempts` 與 `atlas_capacity_reservations`。同帳號先鎖錢包，再鎖跨環境共用的圖鑑容量，避免 Sandbox／正式兩把帳號鎖各占最後一格。每張圖片同時最多一個進行中的辨識任務。

### 扣點與恢復

- worker 取得 90 秒執行權與唯一 token；執行期間每 15 秒嘗試心跳。外部模型呼叫不在資料庫交易內。
- 結果須非空、通過 schema、有中文基本詞義；需要跨語言 gloss 時也須有 gloss。原始 provider blob 不公開保存。
- 結果先持久暫存；候選、認字 job、用量紀錄與扣點在同一交易提交。資料庫寫入失敗不會留下已扣款但拿不到候選的狀態。
- 暫存結果可在新 worker 恢復，直接重試提交，沒有第二次模型呼叫或第二次扣點。
- 空結果／缺必要詞義／圖片不可用會釋放點數與格數。無可交付結果的已知 token 用量保留在 attempt，不能把沒有收費當成沒有成本。
- 模型執行超過 40 秒或狀態不明時先進入 `reconciling`。對帳截止設為接受後 15 分鐘，worker 在截止後終止並釋放；舊 token、過期執行權與遲到回應都不能再扣點。實際釋放時間取決於排程及 worker 恢復時間。
- 只剩不到 60 秒的排隊任務不再啟動模型；它會釋放並回 `queue_deadline`。取消已在執行的任務回衝突，不能擅自退點後讓模型繼續交付。
- 一般及精準 provider 沿用既有設定；精準結果必須為 escalated stage。執行前有每使用者每分鐘 12 次、全站每日既有上限的保護，資料庫不可用時不放行模型。

### 容量與舊入口

明確登錄為 credits 的永久帳號使用 200 格；會員回應加入 billingMode，圖鑑鎖定與容量顯示也讀此政策。原 legacy 永久會員仍為原權益，舊 Pro 仍保留 300 格，沒有自動轉制或停售商品。

辨識前保留必要的一格；已存在同圖片卡片的重辨識不另占一格。成功後保留 30 分鐘確認期，確認期限過後重新查容量，保存結果不重新辨識或重扣點。確認只接受該任務自己的候選，第二個候選不能從同一次收費取得第二份附帶補充權利。

確認會把一次性附帶補充權利綁定到該 item，狀態為 `pending`。第二階段當時尚未實作補充履約；第三階段已加入工作與補償。舊 enrich 端點仍不能冒充免費履約，正式收費仍待完整上線驗收。

新制帳號透過舊上傳、重辨識、確認或 enrich 入口會收到 `update_required`；GET 詳情只讀保存內容，不自動呼叫 AI。這個判斷來自伺服器 cohort，暫停新工作時仍有效。legacy 帳號保留原路徑。

### 開關與部署範圍

- `AI_CREDITS_OPERATIONS_ENABLED=true`：允許新報價與接受。也必須同時設定 live、worker 開關與 CRON_SECRET。
- `AI_CREDITS_WORKER_ENABLED=true`：允許受保護 worker 執行與恢復。暫停接受新工作後仍可處理已持久接受的任務。
- 兩個開關預設關閉；沒有設定正式 cohort 或啟用正式模型。
- **沒有修改 vercel.json 排程**。上線前須配置適合目前方案的受保護定期 worker，驗證排程間隔、吞吐量、15 分鐘恢復期限及 60 秒路由上限。不能把「存在 worker 路徑」當成「已部署自動排程」。
- 目前 provider 介面不支援中止底層請求；40 秒後停止接收結果並對帳，底層請求仍可能產生成本，但不會透過遲到回應扣款或自動再呼叫一次模型。

### 第二階段驗證

- 點數／AI 整合測試：49 項全通過，包含真實 PostgreSQL 與 provider 假資料，不呼叫付費模型。
- 驗證相同接受重送、舊 token、已保存結果恢復、逾時與遲到回應、失敗成本記錄、最後一格競爭、確認期過期、一次建卡、語言／來源綁定、Pro 容量與 RLS。
- 第一階段的併發發點、月界、有效期、帳本與回滾測試一同重跑。
- TypeScript 與 Next.js 正式建置通過；全站測試 672 通過、3 略過、0 失敗。兩個資料庫套件已在上述隔離整合測試另行執行。
- 圖鑑 frozen fixture eval 通過，476 詞／952 例句維持既有基準。
- 正式資料庫 migration、worker 排程、會員切換、商店價格及遠端 CI 均未執行。

## 第三至六階段：目前交付（2026-10-03）

### 新照片、基本補充與補償

POST /api/ai/images 只上傳，不呼叫 AI、不扣點；限 8 MiB 的 JPEG／PNG／WebP／HEIC／HEIF，multipart 全體限 9 MiB。先驗證再縮圖及去除 EXIF，每帳號未完成上傳限 20 張／100 MiB。新上傳採持久 reservation，15 分鐘未完成及沒有建卡的 7 天照片可由清理 worker 回收；已建卡或有進行中辨識的圖片會保留。相同圖片回傳照片，不沿用其他語言的舊候選。

確認候選會綁定一張卡的基本補充，清除重辨識卡片的舊語言補充。補充結果、用量與狀態一起提交；保存的結果可重試提交而不再次呼叫模型。已知不合格結果最多嘗試三次；逾時或執行權不明不自動再呼叫。失敗只補償一次，回原 lot；原贈點已過期時立即到期。圖片／卡片被刪除或更改時，舊補充結束，不覆寫新內容。

新增 ai_fulfillments、ai_fulfillment_attempts、credit_image_uploads、credit_compensations，均啟用 RLS；新 client 不可直接寫入。

### Apple 消耗型入帳與退款

POST /api/credits/purchases/verify 接受已登入帳號的 signedTransaction。嚴格驗證簽章、商品 allowlist、環境、消耗型、交易 ID、數量及 appAccountToken；不允許開發模式只解碼。以 environment＋transaction ID 全域去重，原帳號／商品／數量不可改。

通知先驗證外層與交易，保存 inbox 後回覆；資料庫及驗證服務失敗回可重試錯誤。找不到帳號保留待辦。部分退款按 Apple 千分之一百分比刻度換算並向下取整為整數點；退款通知先於 verify 亦能入帳及撤銷於同一交易。

退款只收回原 purchase lot 可用點，不挪用其他來源。仍預留的退款點阻止扣點，釋放時回收；已消耗退款暫停新工作。退款撤回只恢復實際收回部分；舊事件不能覆寫新狀態。退款及基本補充補償共享帳號鎖，防止重複返還。

CREDITS_STORE_PROCESSING_ENABLED 與 CREDITS_PURCHASE_ENABLED 分開；停止新購不停止已付款驗證。商品 ID app.tuji.credits.1000／4000／7000 與 1,000／US$0.99、4,000／US$2.99、7,000／US$4.99 已核定，未建立正式商品。US$1.99 永久會員商店價格尚未調整。

### 三端畫面與付款同步

- Web、iOS、Android：罐頭圖示、餘額／保留、月贈／簽到、照片上傳、報價確認、最近工作、候選建卡及補充狀態。
- GET /api/credits/catalog：只讀開關／商品映射；GET /api/ai/operations：目前帳號／環境最近 50 筆，未提交結果不公開。
- 三端按十進位字串比較 walletVersion，避免 BIGINT 截斷；登入帳號分開保存接受識別碼。未知結果、暫停及登入失敗保留原識別碼。
- 暫停期間開啟 READ 後可用同識別碼恢復已接受工作；不存在的工作不能新增預留。
- iOS 點數交易確認 deliveryAck、交易識別及狀態後才 finish；背景同步失敗保留交易，unfinished 在啟動／登入／前景／恢復時續送。
- 新 Pro 入口預設關閉；既有 Pro 交易與權益保留。Web／Android 沒有付款入口，Android 尚未配置 Play Billing。
- 四種語系已接入原生畫面；沒有用商店提案價格冒充實際售價。

### 營運檢查與驗證

只讀帳本工具 audit-credits.ts 已加入，檢查餘額／ledger／版本、預留／來源分配、福利／grant、商店 lot 及補償。使用一致只讀快照，不修復餘額、不觸發贈點到期。用隔離 PostgreSQL 主動製造帳本及來源差異，驗證會報出異常。

目前 76 項隔離整合測試全部通過；Web 679 通過／3 套資料庫略過，資料庫另行驗證；iOS 43 項相關模擬器測試通過；Android 68 model＋21 相關 network＋211 app 通過及 Debug APK 建置成功。Android 原有分享事件測試在全 network 套件仍失敗，保留其原有修改。TypeScript、Next.js 建置及 iOS 多語系檢查通過。

正式 migration、排程、cohort 移轉、商店商品／售價、Sandbox／TestFlight 實際付款、真機 UI 驗收及遠端 CI 尚未完成。效期、舊會員與已使用退款支援仍待產品規則定稿。正式開關保持關閉。

完整開關、驗收及回退步驟見[上線準備](../../docs/AI_CREDITS_ROLLOUT.md)。



## 第七階段：自动月贈與直接替換

GET /api/cron/credit-monthly 需 CRON_SECRET，live 且月贈開啟才執行；每批最多 100 帳號，重複排程不重複發點。錢包讀取及交易也更新當月，不依賴使用者領取或排程準時。wallet 增加 monthlyAvailable、checkInAvailable；catalog 增加 monthlyDelivery=automatic_reset、monthlyCarryover=false、checkInExpires=false。

政策版本 credits-2026-10-auto-monthly。credit_policy_events 啟用 RLS，用帳號／環境／版本唯一鍵記錄 automatic_cutover。替換與首次發點同交易，失敗全部回滾。直接替換開關目前關閉，有效 Pro 排除。

最新隔離 PostgreSQL 測試 83 通過；Web 679 通過／3 資料庫略過，TypeScript／Next.js 通過。iOS 43 項、多語系及 Android Debug／model／app 通過。正式 migration、排程、會員切換、商店與真正 Sandbox／TestFlight 付款未執行。

## 第八階段：唯讀上線前盤點

scripts/preflight-credits.ts 按明確的商店環境查新制資料，並標示共享舊權益尚未分類。回傳缺表／盤點欄位、新表 RLS、客戶端政策與完整可讀性；受 RLS 過濾的角色不能把空結果當成通過。會員、來源、容量、舊預留、工作與退款只輸出彙總。它不呼叫自動發月贈的 wallet。

scripts/export-credit-migration.ts 離線匯出 CREDIT_DDL＋AI_OPERATION_DDL，同一交易提交，附 5 秒 lock_timeout 及每 statement 60 秒上限；不連資料庫。匯出只包含新制模組，完整應用程式仍需核對既有會員及圖鑑欄位。

最新隔離測試 95 通過；Web 679 通過／4 資料庫套件略過，資料庫另測；TypeScript／Next.js 通過。既有後端唯讀盤點及未執行的 SQL 已保存於 ../../outputs/ai-credits-preflight-20261003/。新制 18 張表尚未正式部署，有效 Pro 過渡及商店付款驗收仍待完成。

## 第九階段：独立付款驗收環境（2026-10-04）

使用者核定建立免費環境後，建立獨立 Supabase Free 專案及 Vercel Hobby 网站 https://tuji-credits-sandbox.vercel.app 。新庫建立完整應用 schema、18 張新制表與 RLS，沒有複製正式使用者。初次 seed 的例句防覆寫檢查有 10 筆衝突，測試初始化副本核對新庫身份後略過例句替換，完成其餘回填與分區；正式 migration 檢查保留。

Sandbox 錢包、福利、自動轉制及 Apple 嚴格驗簽入帳已啟用，AI 工作與付費模型關閉。線上驗證登入、三種商品映射、月贈 1,000、同日簽到只入帳 10、無效簽章／LocalTesting 不入帳；預檢通過，測試帳本 0 差異。無效付款目前由驗證錯誤處理回 503，不代表成功入帳。

iOS 新增 Tuji-CreditsSandbox，共享 scheme 無本機 StoreKit 設定，缺設定不回退正式後端，拒絕非 Sandbox 交易；deliveryAck 的環境須匹配才 finish。4 項相關模擬器測試、iPhone 開發簽署建置與多語系檢查通過。此階段尚未安裝手機，後續進展如下。詳見 ../../outputs/ai-credits-sandbox-20261004/README.md 。

## 第十階段：首筆 Apple Sandbox 購買（2026-10-05）

沙盒版經使用者選定安裝到 iPhone 16 Pro Max 並啟動。使用者建立美國區 Sandbox Apple Account、登入 Tuji 測試帳號並完成 1,000 點包購買。嚴格 Apple 驗證持久記錄 app.tuji.credits.1000／quantity 1／points 1,000，購買 lot 不過期、grant_count 1。當天另有簽到 10 點，餘額合計 2,020（每月 1,000＋簽到 20＋購買 1,000）；資料庫只讀核對 1 帳號、0 差異。

App Store Connect 的 Sandbox Server URL 原指向舊正式後端，本輪改為 https://tuji-credits-sandbox.vercel.app/api/billing/appstore-notifications 並回讀確認；Production Server URL 保留原值。實際 Apple 通知與退款仍待驗收，退款處理 worker／cron 尚未排程。

此輪首筆後尚待其餘驗收；後续進展如下。

## 第十一階段：三種商品與退款入口（2026-10-05）

使用者完成 4,000／7,000 點包。資料庫有三筆 Sandbox 交易，各 quantity 1、grant_count 1，購買 lot 均不過期；購買餘額 12,000、總餘額 13,020、wallet version 6。只讀帳本核對 1 帳號、0 差異。

新 Sandbox 通知網址收到 4,000／7,000 點的嚴格驗證 ONE_TIME_CHARGE 通知。手動呼叫受 CRON_SECRET 保護的處理入口，2 筆按設計標記 ignored，沒有第二次入帳、pending 0。此證據涵蓋接收與購買通知處理，不能替代退款或通知重送驗收；自動處理排程尚未啟用。

iOS 僅在 TUJI_CREDITS_SANDBOX 編譯退款測試區與私有帳本入口，以登入帳號的 server ledger 取得已完成購買 ID，再開啟 Apple 原生退款畫面。載入與操作前檢查 Sandbox catalog、帳號與錢包環境；不修改本機點數、不直接提交退款。沙盒裝置建置／簽章、一般 Debug 模擬器建置與 4 項付款保護測試通過。實際退款仍需使用者在手機提交與後續 Apple 通知驗收。

## 第十二階段：實機退款提交（2026-10-05）

同一筆 1,000 點交易在 Apple 頁曾顯示「接続できません」。改用 `Transaction.beginRefundRequest(for:in:)` 可正常開啟頁面，但仍有相同載入錯誤；使用者收到現有「恢復購買」同步步驟後，確認已提交退款。裝置 API 回傳 submitted、交易 ID 2000001246185609，原始 HITL 通過。同步並未獨立記錄，不能宣稱唯一根因已確定。

Apple 已發出嚴格驗證的 CONSUMPTION_REQUEST。尚未收到 REFUND，不先扣點；未取得用量資料傳送同意，因此不回傳用量資料。正式核准後再以受保護通知處理入口撤回相應購買來源、核對贈點來源及帳本。暫時診斷已移除，清理版沙盒與一般 Debug 建置、簽章檢查通過。

## 第十三階段：整筆退款與撤點驗收（2026-10-05）

Apple REFUND 已收到；受保護 worker 手動處理成功，通知狀態 processed。原 1,000 點購買交易 refund_points／withdrawn_points 1,000、remaining 0；其他兩筆 lot 及月贈／簽到保持原額。錢包可用 12,020、購買 11,000、月贈 1,000、簽到 20、版本 7、無預留或人工核對限制。

只讀帳本核對 0 差異，worker 再執行 processed 0／pending 0。通過真實整筆退款與通知處理重跑；HTTP 通知重送、部分退款與撤回尚待實際 Apple 驗收。當時 Sandbox／正式自動通知排程均未配置，該次成功不代表自動處理；後續 Sandbox 排程見下節。

## 14. TestFlight 與實際模型（2026-10-05）

TestFlight 1.3.0（32）手機確認錢包 12,020，新增一包 1,000 後核對 13,020，重試同步及重開仍為 13,020。新交易只發點一次，原退款不變。

獨立測試後端已配置既有 Google／OpenAI provider、私人 Supabase 圖片儲存及 Supabase pg_cron／pg_net；測試專案之外的資料庫、模型設定、部署與排程均未變動。辨識／補充／通知每分鐘有待辦才派送受保護 HTTP；月贈及照片清理每日派送。授權放 Vault，helper 僅伺服器可執行，net schema 不向客戶端 Data API 開放。每日首次排程執行待觀察，受保護路由手動派送已通過。

另一個合成帳號與杯子插畫完成普通／高精度各一次，均由排程執行；各扣 100，附帶補充不另扣。上傳、接受重送、確認重送、重辨識沿用卡片、取消釋放、候選詞義與已補充卡片回讀通過，24 項条件成立，帳本 2 帳號、0 差異。原手機帳號仍 13,020，下一項為手機真照片普通辨識，預期 12,920。

本輪英文插畫樣本估計模型成本 US$0.005787，非供應商帳單與平均成本；未測日文讀音、手機 UI、實際模型失敗補償及正式負載。詳見[驗收紀錄](../../outputs/ai-credits-testflight-20261005/README.md)。

## 15. 手機日文補充與格式修正（2026-10-05）

手機普通辨識初次補充失敗，背景處理按原來源返還 100 一次。獨立合成帳號重現模型欄位驗證錯誤；安裝的 OpenAI adapter 預設非嚴格格式，`enrichWord` 已明確啟用 `strictJsonSchema=true`。真實 adapter 的請求回歸測試先失敗後通過；680 項測試通過、4 項略過，型別檢查通過。測試後端連續三輪日文流程通過，暫時診斷已清除。原手機例外未保留，因此對其原因是依同症狀重現推論。

修正後使用者確認手機讀音、定義有顯示與 12,920 餘額。後端核對新的普通工作與補充均完成，只有一次 100 點扣點、補充 attempt 1、没有補償／預留，帳本 0 差異；卡片「食器類／しょっきるい」可讀。下一項為手機高精度，預期 12,820。[手機驗收](../../outputs/ai-credits-testflight-20261005/phone-japanese-after-fix-verification.json)。

## 16. 手機高精度與同日簽到（2026-10-05）

高精度工作與補充已完成，使用者回報讀音、定義可見；後端核對餘額 12,820、只扣 100 一次、補充 attempt 1、帳本 0 差異。「ティーポット」卡的讀音與中日定義可讀。本次為另一個 imageId／itemId，未驗證手機同圖重辨識沿用卡片。[高精度驗收](../../outputs/ai-credits-testflight-20261005/phone-japanese-precision-verification.json)。

永久容量 API 確認 200；今天已簽到的請求重送兩次，總額與 walletVersion 均不變，月贈保持 800、購買 12,000、簽到 20。每日 10／每月最多新送 300／簽到不過期政策正確。手機容量及簽到顯示待確認。[權益核對](../../outputs/ai-credits-testflight-20261005/phone-benefits-backend-verification.json)。

## 有效 Pro 立即轉制：開發與測試完成

已依使用者決定實作：有永久權益的訂閱／贈送 Pro 立即改用永久會員點數制。會員回應、200 格容量、超额鎖定、AI 建卡與月贈排程一致；沒有舊 AI 月額度、Pro 期限或升級 Pro。訂閱與贈送紀錄保留，未發放額外補償。

驗證：682 項一般測試通過、4 個資料庫套件由專用隔離流程另測；95 項 PostgreSQL 整合測試及 TypeScript 通過。獨立測試環境建置與部署通過，訂閱及贈送 Pro 合成帳號的實際 HTTP 驗收確認 200 格、月贈多次讀取只發一次、歷史紀錄保留；永久權益之後撤銷時不會復活舊 Pro。合成帳號均已清除。

測試環境原漏設 MEMBERSHIP_POLICY=v2，首輪驗收發現非會員沿用舊 3 格；已補齊設定並重新部署，遠端驗收通過。正式環境仍未 migration／切換，18 張表尚未部署；正式售價及停售也未操作。使用者已確認剩餘 Pro 期限不另補點，直接套用新制。

[交付證據](../../outputs/ai-credits-release-preflight-20261005/README.md)。


## 2026-10-05 送審前補充

credit_refund_resolutions 為第 19 張新表的一部分，保存人工處理理由與精確 Apple 退款事件。POST /api/admin/members/:id/credit-refunds 要求 admin cookie、同來源及嚴格欄位；環境由伺服器帳號設定決定。GET 只讀。/admin/credits 顯示只讀積壓、待人工退款及 24 小時已知成本。

正式部署 AI_CREDITS_MODE=off，READ／MONTHLY／CHECK_IN／REPLACE_LEGACY=false。WORKER／OPERATIONS／STORE_PROCESSING／PURCHASE=true 為審查工作與已接受交易提供背景處理；新操作仍由個別使用者配置的 mode 限制。AI_CREDITS_REVIEW_ENABLED=true 搭配最多 20 個有效 UUID v4 的 AI_CREDITS_REVIEW_USER_IDS，僅這些帳號以 sandbox、live、自動月贈／簽到配置使用新制。公開用戶維持 legacy。

Apple sandbox URL 指向 /api/billing/sandbox-notifications：外層與內層皆嚴格驗簽，review cohort 留在正式資料庫的 sandbox 空間，其餘既有獨立測試通知轉送固定獨立後端，轉送失敗回 503 讓 Apple 重試。原正式 URL 保持。購買交付拒絕交易環境與伺服器帳號環境不符。

五個正式 pg_cron 工作透過私有 SECURITY DEFINER function 及 Vault token 呼叫既有保護路由；閒置隊列不發 HTTP。已驗證實際 HTTP、worker、anon／authenticated 權限與 net API 非公開。月贈與清理為每日排程，按帳號當月政策去重，不補過去月份。

正式售價與 Pro 停售尚未執行，與核准後的版本可取得時間協調。詳細證據位於 ../../outputs/ai-credits-release-candidate-20261005/。

## 2026-10-06 送審草稿完成

審查帳號已在正式版模擬器登入並載入點數頁，餘額 800。三個點數商品的真實購買頁截圖皆處理 COMPLETE；1.3.0（33）與三個商品版本已加入同一 reviewSubmission，共四項 READY_FOR_REVIEW。submittedDate=null，未提交 Apple；公開切換仍關閉，售價／停售待核准後協調。模擬器首次安裝缺少簽章造成 sessionMissing，重新以有簽章的模擬器版本建立後通過，不需 App 原始碼變更。

## 2026-10-06 正式公開切換完成

2026-10-06：使用者確認公開 App Store 已顯示 1.3.0（33）後，正式永久會員點數制已切換。永久會員 USA 售價 US$1.99；三個點數包 APPROVED；四個 Pro 已停售，可售地區 0，自動新增地區關閉。

9 個 production 帳號各收到本月正常贈點 1,000，合計 9,000；重送未再發點，剩餘期限不補點。會員函式以正式配置逐帳核對皆為 lifetime、credits、200 格、無 Pro 期限。歷史會員／贈送／事件紀錄的筆數與內容雜湊均不變。正式 9、審查沙盒 1、獨立沙盒 2 個錢包帳本差異皆為 0，審查 800 與原手機沙盒 12,820／版本 15 保持一致。

月贈 HTTP 第一次 updated=10、第二次 updated=1，pending 均为 0。updated 包含每次處理的審查沙盒帳號，不代表新發點次数。排除審查名單後待切換／待月贈帳號 0；本輪未以真實客戶登入作 HTTP 驗收。

部署使用同一已驗證程式，更新六個開關：MODE=live、READ／REPLACE_LEGACY／MONTHLY／CHECK_IN=true、PRO_NEW_PURCHASE_ENABLED=false。環境 production、審查 sandbox 隔離及已付款處理維持原設定。四條受保護 worker HTTP 均為 200；五個 cron 皆 active，最近排程紀錄 succeeded。cron 的成功代表排程執行，閒置條件式派送可能沒有發出 HTTP；實際路由另有驗收。

部署 dpl_DTv5ndebLBSi9g53nmK3Q4EqgqgZ 已指向正式網域，19 張表／RLS 檢查通過，無工作積壓。API 管理員金鑰移除已上架訂閱被 Apple 拒絕；使用者確認服務承諾後，以帳號持有人 UI 完成四個 Pro 停售。API 讀回各商品地區 0、自動新增地區 false。

本輪未進行真實付費購買、未產生新 Apple 退款事件、未另確認裝置價格快取同步，也未作大規模負載或三端完整無障礙測試。部分退款與撤回的證據包含隔離資料庫測試。沒有另發公告或手動調整餘額。

[完整正式上線證據](../../outputs/ai-credits-launch-20261006/README.md)。
