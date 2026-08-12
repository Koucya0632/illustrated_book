# Tuji Web

更新日期：2026-08-12

`tuji-web` 是 Tuji 的 Next.js 後端、公開 Web 與內部管理後台。iOS 是主要產品端；Web 負責詞庫、學習資料、物見（公開圖鑑）、訂閱權限、審核與營運工具。

## 技術

- Next.js 14.2、React 18、TypeScript
- Supabase Auth / Postgres / Storage
- Vercel route handlers 與 CDN
- Vercel AI SDK、OpenAI gateway、Google Vision
- StoreKit 2 伺服器驗證與 App Store Server Notifications V2

## 常用命令

```bash
npm install
npm run dev
npm test
npm run build
npm run migrate
npm run verify:atlas
```

`npm run vercel-build` 會先跑可重入 migration，再執行 Next.js build。

## 主要能力

| 模組 | 現況 |
|---|---|
| Catalog | 英文／日文詞庫、四種介面語言、本地化分類、方向化搜尋、日文振假名切分 |
| Study | queue、answer、stats、reports、SRS、熟練度；答題紀錄可保存 `hinted` metadata |
| User | 帳號、設定、公開身分、收藏、進度、封鎖名單、意見回饋 |
| Atlas | 私人拍照生成、AI 配額、背景同步、物見公開項目與合集、作者主頁、收藏後加入學習 |
| Billing | StoreKit 驗證、訂閱通知、手動贈與、有效權限合併與異動流水帳 |
| Moderation | 項目／合集機審、人工佇列、項目／合集／作者檢舉、升級與下架 |
| Admin | 詞庫、Atlas、reports、feedback、會員權限、統計與漏斗 |

## 目錄

| 路徑 | 用途 |
|---|---|
| `app/api` | iOS／Web API |
| `app/admin` | 內部管理後台 |
| `app/atlas` | Atlas Web 與公開頁 |
| `lib/atlas` | Atlas 管線、審核、公開序列化與 provider |
| `lib/admin` | 管理端查詢與操作 |
| `scripts` | migration、資料修復、翻譯與振假名回填 |
| `tests` | Node 測試 |

## API 合約重點

- iOS 透過 Repository 層依賴 Catalog、User、Progress、Study、Atlas 與 Billing API；改 response shape 時必須同步 iOS model。
- 學習方向相關請求應明確帶 `learning=zh-en|zh-ja`，本地化內容帶 `lang=zh-Hant|zh-Hans|ja|en`。兩者都屬於快取鍵。
- 公開 GET 才能進共享快取；`/api/users/*`、`/api/study/*`、寫入與管理端一律 private/no-store。
- Pro 的功能判斷使用「訂閱 ∪ 手動贈與」的有效權限，不直接拿裝置端 StoreKit 狀態當帳號權限。
- 收藏別人的物見內容使用獨立 `savedItemsLimit`，不消耗自製圖鑑格數。

## 延伸文檔

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)：系統邊界與資料流
- [`PRODUCT_MODULES.md`](./PRODUCT_MODULES.md)：產品模組與 endpoint
- [`ADMIN_REPORTS.md`](./ADMIN_REPORTS.md)：管理後台、檢舉與會員操作
- [`WORD_IMPORT.md`](./WORD_IMPORT.md)：詞庫匯入
