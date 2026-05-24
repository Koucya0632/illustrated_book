# Architecture — Everyday English Picture Dictionary

> 完整技術參考。如果你只是要把專案跑起來，看 [README.md](./README.md) 就好。

---

## 1. 系統概觀

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│  ├── Public site                                                  │
│  │   - WordsProvider (context)  ◄─── server-fetched on layout    │
│  │   - UserProvider  (context)  ◄─── server-fetched on layout    │
│  │   - localStorage cache (favorites / learned / quizHistory)    │
│  │   - Web Speech API (pronunciation)                            │
│  │   - lib/analytics.ts → POST /api/events  (sendBeacon)         │
│  └── Admin (gated)                                                │
│                                                                   │
└─────────────────┬─────────────────────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼─────────────────────────────────────────────────┐
│  Vercel (Next.js 14 App Router)                                   │
│                                                                   │
│  middleware.ts ── gates /admin/* and /api/admin/*                 │
│                                                                   │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────┐               │
│  │ Server      │  │ API routes │  │ Edge routes  │               │
│  │ Components  │  │ (Node)     │  │ (login etc.) │               │
│  └─────────────┘  └────────────┘  └──────────────┘               │
│            │            │              │                          │
│            └────────────┴──────────────┘                          │
│                         │                                         │
│                  lib/db.ts (lazy)                                 │
└─────────────────────────┼─────────────────────────────────────────┘
                          │ @neondatabase/serverless (HTTPS pool)
┌─────────────────────────▼─────────────────────────────────────────┐
│  Neon Postgres                                                    │
│   words, events,                                                  │
│   users, user_favorites, user_learned, user_quiz_results,         │
│   cards, user_cards                                               │
└───────────────────────────────────────────────────────────────────┘

外部:
  upload.wikimedia.org    ─ 圖片來源（72 字）
  loremflickr.com         ─ 圖片 fallback（2 字 + 新增字）
  accounts.google.com     ─ OAuth authorize
  oauth2.googleapis.com   ─ token exchange
```

---

## 2. 技術堆疊

| Layer | 用什麼 | 為什麼 |
|---|---|---|
| Framework | Next.js 14.2.35 (App Router) | SSG + RSC + Edge middleware + API routes 一站搞定 |
| Language | TypeScript 5.5 (strict) | 編譯期攔錯 |
| Style | Tailwind 3.4 | 卡片式 UI 寫起來快 |
| DB | Neon Postgres (Vercel Marketplace) | Serverless-friendly、HTTPS driver、免 connection pool |
| DB driver | `@neondatabase/serverless` | 支援 Edge runtime |
| Auth | 自寫 PBKDF2-SHA256 + HMAC-signed cookie | 不引入 NextAuth；Edge-friendly Web Crypto |
| OAuth | DIY Google OAuth (`fetch`) | 沒裝 library；流程簡單 |
| Speech | Web Speech API (`speechSynthesis`) | 不用後端 |
| 圖片 | Wikipedia REST API（一次性下載 URL）+ Loremflickr | 都是 CC / 公有領域，免 API key |
| 部署 | Vercel | Next.js 原生 |

---

## 3. 目錄結構

```
app/                          # Next.js App Router
├── layout.tsx                # 根 layout — async, 預載 words + currentUser
├── page.tsx                  # 首頁
├── not-found.tsx
├── (公開頁)
│   ├── category/[id]/page.tsx
│   ├── word/[id]/page.tsx
│   ├── search/SearchClient.tsx
│   ├── favorites/FavoritesClient.tsx
│   ├── progress/ProgressClient.tsx
│   ├── quiz/[type]/QuizRunner.tsx          # 舊版 quiz（保留）
│   └── study/StudyClient.tsx               # SRS MCQ
├── (使用者)
│   ├── register/RegisterForm.tsx
│   ├── signin/SigninForm.tsx
│   └── me/MeClient.tsx
├── (Admin — gated by middleware)
│   ├── admin/layout.tsx
│   ├── admin/page.tsx                       # 總覽
│   ├── admin/words/(list, new, edit)
│   └── admin/stats/page.tsx
├── login/LoginForm.tsx                      # admin 單一密碼登入
└── api/
    ├── auth/login | logout                  # admin
    ├── auth/google | google/callback        # OAuth
    ├── users/register|login|logout|me|sync  # user accounts
    ├── users/favorites|learned|quiz-results
    ├── admin/words(/:id)                    # CRUD
    ├── events                               # 公開埋點
    └── study/queue | answer                 # SRS

components/                   # 共用 UI
├── Navbar / Footer / CategoryCard / WordCard
├── DailyWords / SearchBar
├── PronunciationButton / FavoriteButton
├── WordsProvider / UserProvider             # React context
├── HydrateUserState / EventTracker
├── UserNav / GoogleButton

lib/                          # 純邏輯，沒有 React
├── db.ts                     # neon() lazy initializer
├── data.ts                   # public words 讀取 (DB → static fallback)
├── words.ts                  # 105 字靜態 seed（同時是 dev fallback）
├── words-db.ts               # admin CRUD（server-only）
├── word-validate.ts
├── users-db.ts               # users + per-user data
├── current-user.ts           # cookie → user (server-only)
├── auth.ts                   # admin token (HMAC)
├── user-auth.ts              # user PBKDF2 + session HMAC
├── google-oauth.ts
├── cards-db.ts               # SRS card + user_card 操作
├── srs.ts                    # 排程演算法
├── categories.ts             # 9 分類靜態
├── daily.ts                  # 每日 5 字 seeded shuffle
├── quiz.ts                   # 舊 quiz 隨機題
├── storage.ts                # localStorage + dual-write to server
├── analytics.ts              # client 埋點
├── speech.ts                 # Web Speech API
└── image-urls.json           # 72 字的 Wikimedia URL 對照表

scripts/
├── migrate.ts                # DDL + seed + 卡片生成；vercel-build 自動跑
└── fetch-wiki-images.mjs     # 一次性抓 Wikipedia 縮圖

middleware.ts                 # /admin/* + /api/admin/* 守門
types/index.ts                # 共用型別
```

---

## 4. 頁面路由

### 公開頁（不需登入）

| Route | 渲染 | 用途 |
|---|---|---|
| `/` | SSR + ISR 60s | 首頁、每日 5 字、9 大分類 |
| `/category/[id]` | SSG + ISR 60s | 分類圖鑑頁；`generateStaticParams` |
| `/word/[id]` | SSG + ISR 60s | 單字詳情；fires `view` event |
| `/search` | Dynamic | 即時搜尋（中/英） + 分類篩選 |
| `/favorites` | Dynamic | 我的收藏（讀 localStorage） |
| `/progress` | Dynamic | 學習進度（讀 localStorage） |
| `/quiz`, `/quiz/[type]` | SSG + ISR | 舊版 quiz（image / chinese / spelling） |
| `/study` | Dynamic (登入後) | SRS 多選複習 |

### 用戶 / Admin

| Route | 守門 | 用途 |
|---|---|---|
| `/register`, `/signin` | 無 | 帳號註冊 / 登入 |
| `/me` | server-side 檢查，無 cookie 自動跳 `/signin` | 個人 dashboard |
| `/login` | 無 | Admin 單一密碼登入 |
| `/admin/*` | `middleware.ts` 攔截 | Admin CRUD + 統計 |

---

## 5. API endpoints

### 公開

| Method | Path | Runtime | 用途 |
|---|---|---|---|
| POST | `/api/events` | edge | 事件埋點（view/favorite/pronounce/quiz_attempt）；IP 取 SHA-256 前 8 bytes |

### Admin

| Method | Path | Runtime | 守門 |
|---|---|---|---|
| POST | `/api/auth/login` | edge | 公開（middleware 例外） |
| POST | `/api/auth/logout` | edge | — |
| GET / POST | `/api/admin/words` | node | middleware |
| GET / PATCH / DELETE | `/api/admin/words/[id]` | node | middleware |

### 使用者帳號

| Method | Path | Runtime | 公開？ |
|---|---|---|---|
| POST | `/api/users/register` | node (PBKDF2) | ✓ |
| POST | `/api/users/login` | node | ✓ |
| POST | `/api/users/logout` | edge | ✓ |
| GET | `/api/users/me` | node | 自動帶 cookie |
| POST | `/api/users/sync` | node | 需登入 |
| GET / POST | `/api/users/favorites` | node | 需登入 |
| POST | `/api/users/learned` | node | 需登入 |
| GET / POST | `/api/users/quiz-results` | node | 需登入 |
| GET | `/api/auth/google` | edge | 公開；redirect 到 Google |
| GET | `/api/auth/google/callback` | node | 公開；驗 state → upsert → set cookie |

### SRS

| Method | Path | Runtime | 用途 |
|---|---|---|---|
| GET | `/api/study/queue?limit=20&new=10` | node | 取到期 + 新卡，附 MCQ choices |
| POST | `/api/study/answer` | node | `{cardId, rating}` → 排下次複習 |

---

## 6. Database schema

```
words
  id TEXT PK
  word TEXT, also_known_as TEXT[], chinese TEXT, category TEXT,
  part_of_speech TEXT, pronunciation TEXT, image_url TEXT,
  collocations TEXT[], examples JSONB, related_words TEXT[],
  confusing_words JSONB, note TEXT,
  created_at, updated_at
  INDEX words_category_idx, words_word_idx (lower(word))

events
  id BIGSERIAL PK
  type TEXT,                  -- view | favorite | pronounce | quiz_attempt
  word_id TEXT, category TEXT, quiz_type TEXT, correct BOOLEAN,
  session_id TEXT, ip_hash TEXT (8 bytes hex), created_at
  INDEX events_type_idx, events_word_idx, events_created_idx (DESC)

users
  id BIGSERIAL PK
  username TEXT UNIQUE, email TEXT UNIQUE,
  password_hash TEXT NULL,    -- NULL = OAuth-only
  google_sub TEXT UNIQUE NULL,
  created_at
  INDEX users_email_lc_idx, users_username_lc_idx, users_google_sub_idx

user_favorites           (user_id FK CASCADE, word_id FK CASCADE, created_at)  PK (user_id, word_id)
user_learned             (user_id FK CASCADE, word_id FK CASCADE, learned_at)  PK 同
user_quiz_results        (id BIGSERIAL PK, user_id FK CASCADE, quiz_type, total, correct, created_at)

cards
  id BIGSERIAL PK
  word_id TEXT FK CASCADE
  card_type TEXT             -- 回想卡 | 填空卡 (區分卡/概念卡 已停用)
  front TEXT, back TEXT, explanation TEXT, tags TEXT[]
  deck_key TEXT              -- 'recall-zh-en' | 'recall-en-zh' | 'cloze-1' …
  created_at
  UNIQUE (word_id, deck_key) -- 讓 generator 冪等

user_cards
  user_id FK, card_id FK, PK (user_id, card_id)
  status TEXT                -- 新卡 | 學習中 | 複習中 | 穩定
  interval_days NUMERIC(10,4)
  next_review_at TIMESTAMPTZ
  review_count, mistake_count, last_rating, last_reviewed_at, updated_at
  INDEX user_cards_due_idx (user_id, next_review_at)
```

關鍵 FK：所有 user_* 都 `ON DELETE CASCADE` 到 `users`；所有對 `words` / `cards` 的 reference 也 cascade。刪一個字會清掉它的卡 + 所有用戶對該字的 SRS 狀態。

---

## 7. Auth & Sessions

### Admin（單一密碼）

```
POST /api/auth/login {password}
  ↓ 比對 process.env.ADMIN_PASSWORD
  ↓ mintAdminToken() → "<expiryMs>.<hmac_b64url>"
  ↓ Set-Cookie: eepd_admin=...; HttpOnly; Secure; 7d

middleware.ts on /admin/* or /api/admin/*:
  ↓ verifyAdminToken(cookie) — HMAC over expiry，key = ADMIN_PASSWORD
  ↓ 通過 → next()
  ↓ 失敗 + HTML → 302 /login?next=...
  ↓ 失敗 + JSON → 401
```

### User accounts（多用戶）

```
密碼 hash:  PBKDF2-SHA256 / 100k iter / 16-byte salt
           儲存格式 "pbkdf2$<iter>$<salt_b64url>$<hash_b64url>"

Session token:  "<userId>.<expiryMs>.<hmac_b64url>"
HMAC key:       HMAC(ADMIN_PASSWORD, "eepd-user-session/v1")
                — 名空間隔離；admin/user 簽章不可互換；admin 換密碼一次失效兩種
Cookie:         eepd_user, HttpOnly, SameSite=Lax, Secure, 30 day
```

### Google OAuth flow

```
1. GET /api/auth/google?next=/me
     ↓ random state (24 bytes hex)
     ↓ Set-Cookie: eepd_oauth_state, eepd_oauth_next (10 min)
     ↓ 302 → https://accounts.google.com/o/oauth2/v2/auth?...

2. Google → GET /api/auth/google/callback?code=...&state=...
     ↓ verify state cookie === query state
     ↓ POST oauth2.googleapis.com/token {code, ...}  → access_token
     ↓ GET openidconnect.googleapis.com/v1/userinfo → {sub, email, name}
     ↓ DB upsert:
         A) findByGoogleSub  → 已連結，登入
         B) findByEmail      → 有同 email 帳號，linkGoogleSub
         C) 都沒有           → createOAuthUser (no password)
     ↓ Set-Cookie eepd_user
     ↓ 302 → nextPath
```

---

## 8. Word data flow

```
DB (words 表) ────┐
                  ├─→ lib/data.ts  getAllWords()       (unstable_cache, tag "words", 60s)
                  │      ↓
                  │   app/layout.tsx (async server)
                  │      ↓
                  │   <WordsProvider words={...}>
                  │      ↓
                  │   useWords() / useWord(id) / useSearchWords(q)
                  │      ↓
                  │   所有 client 元件直接用 (SearchBar / DailyWords / SearchClient / FavoritesClient / QuizRunner / ProgressClient)
                  │
lib/words.ts ─────┘  Fallback when DATABASE_URL 沒設（local dev、build 過程）
(105 字靜態 seed)
```

**為什麼這樣設計：**
- Admin 改完字 → `revalidateTag("words")` → public site 60 秒內看到
- Client 元件**不需要**自己 fetch /api/words；server-side 拉好放 context
- Build 不需要 DB（fallback 確保 type-check + page generation 可離線跑）

---

## 9. 每用戶資料同步

```
未登入：localStorage 是唯一 source of truth（favorites / learned / quizHistory）

登入：
  1. layout.tsx 拉 getCurrentUserBundle() → {user, favorites, learned}
  2. <HydrateUserState> useEffect 將 server 資料 union 進 localStorage
  3. 之後 toggleFavorite / markLearned / recordQuiz:
       - 寫 localStorage（立刻）
       - POST /api/users/{favorites|learned|quiz-results}（fire-and-forget）
  4. 註冊/登入成功時前端送一次 POST /api/users/sync
       - 把當前 localStorage 全部上傳 → server 合併 → 回傳合併結果
       - 確保跨裝置融合不會遺失
```

設計準則：**localStorage = 即時、無延遲；server = 真相、跨裝置**。網路抖動不會掉資料（fire-and-forget 失敗，下次 sync 會補）。

---

## 10. SRS 系統

### 卡片生成（`scripts/migrate.ts` 的 `cardsForWord`）

```
每個 word 生成最多 3 張卡：

deck_key="recall-zh-en"  回想卡:  「{chinese}」的英文是？     → word
deck_key="recall-en-zh"  回想卡:  「{word}」的中文意思是？   → chinese
deck_key="cloze-1"       填空卡:  從第一個含 target 的例句挖空 → word
```

執行於 `vercel-build` 階段（migrate.ts），用 `ON CONFLICT (word_id, deck_key) DO NOTHING` 達成冪等。增字 → 自動補卡；停用字 → 自動刪卡（CASCADE）。

### MCQ 乾擾項選法（`lib/cards-db.ts`）

```sql
SELECT back FROM cards
WHERE deck_key = ${deckKey}      -- 同 deck_key 才會同語言
  AND id <> ${excludeCardId}
  AND back <> ${correctBack}
ORDER BY random() LIMIT 9         -- 過量抽，JS 去重後取 3
```

`deck_key` filter 是關鍵 — 它保證「中翻英」的乾擾項都是英文、「英翻中」都是中文。

### 排程演算法（`lib/srs.ts`）

```
新卡（status="新卡" 或 interval=0）:
  重來 → 10 min,  學習中
  困難 → 1 day,   學習中
  穩定 → 3 days,  複習中
  熟練 → 7 days,  複習中

已複習過:
  重來 → 重設 10 min, 學習中
  困難 → × 1.3, 複習中 (interval ≥ 21 時升級「穩定」)
  穩定 → × 2.4, 同上
  熟練 → × 3.8, 同上

封頂 5 年。humanizeInterval() 把小數天轉成「N 分鐘 / 小時 / 天 / 週 / 月 / 年」。
```

### 答題流程（`/study`）

```
GET /api/study/queue → 最多 20 張（先到期，補新卡到 10 張上限）

每張卡：
  MCQ 模式（回想卡、填空卡）:
    顯示 4 選 1
    點錯 → 自動 rate "重來" → 1.4s 進下一張
    點對 → 顯示 3 顆按鈕（困難 / 穩定 / 熟練）讓使用者細分難度 → 0.6s 進下一張
  Typing 模式（fallback，目前無此類卡）:
    打字 → 顯示答案 → 4 顆按鈕全選

POST /api/study/answer {cardId, rating}
  → schedule(prev, rating)
  → upsertReview(...)
```

---

## 10b. 單詞熟練度（Mastery）

獨立於卡片 SRS 的第二層追蹤。**卡片 SRS** 決定「什麼時候再看到這張卡」；**單詞熟練度** 衡量「整體上你對這個字有多熟」，跨同一個字的所有卡型（中→英、英→中、cloze）共用一個分數。

### 資料模型
```sql
user_words (
  user_id BIGINT FK CASCADE,
  word_id TEXT FK CASCADE,
  mastery NUMERIC(5,2),      -- 0-100，stored "last known" 值
  last_reviewed_at TIMESTAMPTZ,
  review_count INT,
  updated_at,
  PRIMARY KEY (user_id, word_id)
);
INDEX user_words_mastery_idx (user_id, mastery)
```

### 表現分對應
```
重來 → 0
困難 → 30
穩定 → 70
熟練 → 100
```

### 更新公式（EMA 指數加權移動平均）
```
α = 0.3
mastery_decayed = applyDecay(prev_mastery, last_reviewed_at, now)
mastery_new     = α × score + (1 − α) × mastery_decayed
                = 0.3 × score + 0.7 × mastery_decayed
```
α=0.3 讓單次答題影響有限（不會被一次失誤歸零），但連續好幾次同方向會明顯移動。

### 遺忘曲線（lazy decay）
不跑批次 job、不直接寫衰減後的值進 DB。每次「讀取 / 計算」時才套用：
```
days_since   = (now − last_reviewed_at) / 1 day
half_life    = max(1, mastery / 5)      -- 100 分→20 天，20 分→4 天
mastery_now  = mastery × 2^(−days_since / half_life)
```
**為什麼 lazy**：不需 cron、不需要 DB trigger，只在使用者要看到分數時花一個浮點數運算。寫入的永遠是「最後一次答題後的新分數」，read 時再演化到當下。

### 與卡片 SRS 的關係
- **排程不變**：卡片自己的 `next_review_at` / `interval_days` 完全照原本的 schedule() 算
- **隊列順序變了**：`/api/study/queue` 拿到的卡先按 (已看過 / 全新) 分組，已看過的再用 `mastery ASC` 排序 — 弱項先做
- **答題副作用**：`POST /api/study/answer` 一次更新兩張表：`user_cards` (SRS) + `user_words` (mastery)

### 暴露點
- `lib/mastery.ts` — 純函式：`applyDecay`, `applyAnswer`, `masteryLevel`
- `lib/users-db.ts` — `getMasteryRow`, `upsertMastery`, `getAllMastery`
- `lib/cards-db.ts` — `attachMasteryAndSort(userId, queue)`
- `components/MasteryBar.tsx` — UI 元件，server-renderable
- API `/api/study/answer` 回傳體新增 `{ mastery: { before, after, delta, level } }`
- 頁面：`/study` 顯示 delta；`/me` 顯示「最熟」+「需要加強」；`/word/[id]` 登入用戶顯示熟練度條

---

## 11. 事件追蹤

```
公開頁 client:
  components/EventTracker (server-passed wordId/category)
    useEffect → track({type:"view", wordId, category})
  FavoriteButton click → track({type:"favorite", wordId})  (only on add)
  PronunciationButton click → optional track (wordId prop)
  QuizRunner answer → track({type:"quiz_attempt", wordId, quizType, correct})

lib/analytics.ts:
  sessionId stored in localStorage (UUID)
  navigator.sendBeacon('/api/events', JSON)  // 不阻塞、不需 await

/api/events (edge runtime):
  validate type ∈ {view, favorite, quiz_attempt, pronounce}
  ip_hash = SHA-256(x-forwarded-for + salt) 前 8 bytes
  INSERT INTO events ...

/admin/stats（server component）:
  並發跑 6 個 aggregate queries：
    - 30d 事件類型分佈
    - 30d top 15 viewed words
    - 30d 分類熱度
    - quiz 正確率最低的 10 字（≥3 嘗試）
    - 14d 每日趨勢
    - 7d 不同 session_id 數
```

---

## 12. 部署 (Vercel)

### `package.json` scripts
```
dev           next dev
build         next build                     (本地用)
vercel-build  tsx scripts/migrate.ts && next build   (Vercel build 步驟)
start         next start
migrate       tsx scripts/migrate.ts         (手動跑)
```

### Build 流程
```
Vercel 偵測 Next.js → 跑 npm run vercel-build
  ↓
tsx scripts/migrate.ts                # DDL idempotent + seed + cards
  ↓
next build                            # 105+ word pages SSG, 其餘 ISR/dynamic
  ↓
Edge / Node functions 打包
  ↓ Deploy → READY
```

### 環境變數（Production）
```
# DB (Vercel ↔ Neon Marketplace 自動注入)
DATABASE_URL, POSTGRES_URL, PGHOST, ...

# Admin
ADMIN_PASSWORD               # 也拿來 derive user-session HMAC key

# Google OAuth (optional — 沒設則 /api/auth/google 回 503)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

### `next.config.js` 圖片白名單
```
upload.wikimedia.org, loremflickr.com, live.staticflickr.com,
images.unsplash.com, source.unsplash.com, placehold.co
```

---

## 13. 外部整合

### Wikipedia REST API（一次性）
`scripts/fetch-wiki-images.mjs` 為 105 個字查 `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`，把 `originalimage.source` 寫進 `lib/image-urls.json`。包含 429 退避 + 增量續抓。結果：**72/105 有 Wikimedia 圖**，剩下 fallback 到 loremflickr 關鍵字。

### Loremflickr fallback
`lib/words.ts` 的 `img()` 工具產生 `https://loremflickr.com/600/450/{tag1,tag2}?lock={hash}`。`lock` 用 keyword hash 保證**同一個字永遠拿到同一張照片**。

### Google OAuth
DIY，沒裝 NextAuth。整流程在 `lib/google-oauth.ts` + 兩個 route。Redirect URI 從 `request.url.origin` 推導，必須在 Google Console 註冊完全相同的字串。

---

## 14. 路徑慣例 / 常見陷阱

- **Server-only 模組**用 `import "server-only"` 標註（`lib/words-db.ts`, `lib/users-db.ts`, `lib/current-user.ts`），誤匯入 client 端會 build error。
- **Edge routes**（middleware、登入登出、events）不能用 `cookies()` from `next/headers`，要從 `req.cookies` 讀。
- **`unstable_cache` tag**：admin 寫完叫 `revalidateTag("words")`，ISR 自動失效。
- **Neon serverless driver** 不支援 transactions over multi-statement，所以 migrate 沒包 BEGIN/COMMIT；每個 statement 獨立 idempotent。
- **`DISTINCT` + `ORDER BY random()`** 在 PG 違法。乾擾項那邊改成過量抽 + JS dedupe。
- **`vercel env pull` 拉不到 Marketplace 注入的 Sensitive 值**（DATABASE_URL 等顯示空字串）— 只能在 build/runtime 取得。所以本地開發若要 DB 連線，得從 Vercel dashboard 手動拷貝。
