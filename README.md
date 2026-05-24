# Everyday English Picture Dictionary

> 看得見的英文，記得住的單字。

一個「圖鑑式學英文」的互動學習網站。目標使用者是中文母語者，透過圖片、分類、發音、例句、間隔複習與測驗來學會生活英文。

🌐 **線上看**：https://everyday-english-picture-dictionary.vercel.app

---

## 功能

- **圖鑑分類** — 9 大分類（廚房 / 浴室 / 臥室 / 客廳 / 辦公室 / 街上 / 超市 / 交通 / 調味料）共 105 個常用單字
- **真實照片** — 72 字使用 Wikimedia Commons 圖片，其餘 fallback 到 Loremflickr
- **發音** — Web Speech API
- **搜尋** — 中／英互查、即時下拉建議
- **收藏 + 進度** — localStorage 即時，登入後自動同步到帳號
- **小測驗** — 看圖選英文 / 看中文選英文 / 拼字練習
- **間隔複習 (SRS)** — 多選題 + 自評，自動排下次複習時間
- **用戶系統** — Email/密碼註冊、Google OAuth 登入、個人 dashboard
- **後台** — 單字 CRUD、全站統計（事件量、Top 單字、測驗最難的字）

---

## 快速開始

### 純前端（不接 DB）

```bash
npm install
npm run dev          # http://localhost:3000
```

沒設 `DATABASE_URL` 時會 fallback 到 `lib/words.ts` 的靜態資料，登入 / 後台 / SRS 等需要 DB 的功能不會運作，但圖鑑 / 搜尋 / localStorage 收藏都能用。

### 完整功能（接 Neon Postgres）

```bash
# 1. 在 Vercel dashboard → Storage 開一個 Neon Postgres
# 2. 把連線字串放到 .env.local
DATABASE_URL=postgres://...
ADMIN_PASSWORD=任意字串
GOOGLE_CLIENT_ID=...           # 可選；Google 登入用
GOOGLE_CLIENT_SECRET=...

# 3. 跑 migration（建表 + seed 105 字 + 生成 SRS 卡）
npm run migrate

# 4. 啟動
npm run dev
```

---

## 主要頁面

| 路徑 | 用途 |
|---|---|
| `/` | 首頁 + 每日 5 字 + 分類卡片 |
| `/category/[id]` | 該分類所有單字 |
| `/word/[id]` | 單字詳情（圖、音、例句、混淆詞、相關詞） |
| `/search` | 中英搜尋 + 分類篩選 |
| `/favorites` `/progress` | 我的收藏 / 學習進度 |
| `/study` | **SRS 間隔複習**（多選題；需登入） |
| `/quiz`, `/quiz/[type]` | 舊版 3 種測驗 |
| `/register` `/signin` `/me` | 帳號 |
| `/login` `/admin/*` | 後台（單一密碼） |

---

## 部署到 Vercel

```bash
vercel link
vercel --prod
```

`vercel-build` script 會自動跑 `tsx scripts/migrate.ts` 把 DDL 套用、seed 資料、生成 SRS 卡，所以每次 deploy 都是冪等的。

---

## 文件

- **這份 README**：跑起來 + 主要功能
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**：完整技術參考 — DB schema、所有 API、auth flow、SRS 演算法、event tracking、部署細節

---

## 技術堆疊

Next.js 14 (App Router) · TypeScript · Tailwind · Neon Postgres · `@neondatabase/serverless` · Web Crypto (PBKDF2 + HMAC) · Web Speech API · Wikipedia REST API · Vercel

---

## 圖片授權

- 主要圖片：[Wikimedia Commons](https://commons.wikimedia.org/)（CC / 公有領域）
- Fallback：[Loremflickr](https://loremflickr.com/) 抓 Flickr CC 圖片

要替換成自己的圖片：編輯 `lib/image-urls.json`（id → URL 對照表），或在後台 `/admin/words/[id]/edit` 直接改 `imageUrl`。
