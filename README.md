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

## 學習流程（`/study`）

進站先在「設定 → 學習」勾一個或多個主題，回到首頁點「今日任務」或直接到 `/study`，會看到兩顆 tile：**新學**（從沒看過的字）和**複習**（到期該再考的字）。Stats 拉完才會顯示按鈕，避免假數字一閃。

### 新學（3 步走完一整批）

`POST /api/study/queue?mode=new` 拉 N 張新字，每張帶 `choices`（英文 distractor）+ `spellingChoices`（拼錯 distractor，由 `lib/misspellings.ts` 算）。N 張會**連續走過 3 個 step**，每步把整批走完再進下一步。

| Step | bubble | UI | 寫 SRS？ | 對錯處理 |
|---|---|---|---|---|
| **1 認識** | 認識這個字嗎？ | 自動翻面，圖 + 英文 + 發音 + 2 鈕（認識／知道） | ✅（認識=穩定、知道=困難） | 沒「錯」概念，按下就進下一張 |
| **2 辨認** | 對應的英文是哪個？ | 圖 + 發音，4 個英文 MCQ | ❌ | 答對 pop 掉；**答錯推到 stepQueue 尾端，輪迴到答對為止** |
| **3 拼字** | 哪一個拼法是對的？ | 圖 + 發音，4 個拼法 MCQ（正確 + 3 個拼錯） | ❌ | 同 Step 2 |

進度條公式 `((step − 1) + 該 step 進度) / 3`，**答錯不會讓條退回去**（用 `(total − stepQueue.length) / total` 算 step 進度）。右上 chip 顯示 `Step n/3`。

走完 Step 3 → done summary：所有 N 張的 **WordTile grid**（圖 + 英文 + 中文 if `showZh`），告訴你「剛學了這些字」。

### 複習（單趟跑完 due 卡）

`POST /api/study/queue?mode=review&limit=min(50, stats.due)` 拉到期卡，按 `next_review_at` + mastery 弱者優先排。每張兩個 phase：

1. **`phase=answer`**：圖 + 發音 + 4 個英文 MCQ；點完跳到 `review` phase。
2. **`phase=review`**：露答案卡（英文 + 發音 + 中文 + explanation），4 鈕 SRS 評分（答對時隱藏「重來」剩 3 鈕；建議的那顆有 ring + badge，依答題速度推：<3s 熟練、<7s 穩定、慢→困難；答錯則建議重來）。

每選一次評分 → `POST /api/study/answer` → `lib/srs.ts` 算下次到期 + 更新 mastery / mistake_count / review_count → 0.45 秒後切下一張。

走完一批 → done summary：4 個 SRS 桶 tile（重來/困難/穩定/熟練 各幾張）。

### 兩者共通

- 主題過濾：兩個 mode 都看 `studyCategories`；空陣列時 `/study` 直接顯示 CTA 叫你去設定挑主題。
- Stats 也吃同樣的主題過濾（`/api/study/stats?category=foo,bar`），所以 landing 的 N/M 數字跟實際可拉到的卡數一致。
- `/api/study/answer` 只在新學 Step 1 + 複習任一 phase 才會打。新學 Step 2/3 是純前端的 reinforcement，不動 SRS。
- backlog 滿到 100+ 張時，新學 tile 變灰 + warning banner，點下去會跳 modal 叫你先複習；硬要新學也可以 override。

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
