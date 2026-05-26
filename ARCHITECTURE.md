# Architecture — Everyday English Picture Dictionary

> 完整技術參考。如果你只是要把專案跑起來，看 [README.md](./README.md) 就好。

---

## 1. 系統概觀

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│  ├── Public site                                                  │
│  │   - WordsProvider (context)        ◄── server-fetched         │
│  │   - UserProvider  (context)        ◄── server-fetched         │
│  │   - localStorage cache             (favorites / learned)      │
│  │   - Web Speech API                 (pronunciation)            │
│  │   - lib/supabase/client.ts         (auth signUp/signIn/OAuth) │
│  │   - lib/analytics.ts → /api/events (sendBeacon)               │
│  └── Admin (gated by single password)                             │
│                                                                   │
└─────────────────┬─────────────────────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼─────────────────────────────────────────────────┐
│  Vercel (Next.js 14 App Router)                                   │
│                                                                   │
│  middleware.ts                                                    │
│    ├─ /admin/* + /api/admin/*  → admin HMAC cookie gate           │
│    └─ everything else          → refresh Supabase session cookie  │
│                                                                   │
│  ┌─────────────┐  ┌────────────────────┐                          │
│  │ Server      │  │ API routes (Node)  │                          │
│  │ Components  │  │  /api/users/*      │                          │
│  │ (async)     │  │  /api/study/*      │                          │
│  └──────┬──────┘  │  /api/events       │                          │
│         │         │  /api/admin/*      │                          │
│         │         └─────────┬──────────┘                          │
│         │                   │                                     │
│         ▼                   ▼                                     │
│   lib/current-user.ts   lib/db.ts (postgres-js)                   │
│         │                   │                                     │
│         │ ┌─────────────────┘                                     │
│         │ │                                                       │
│         ▼ ▼                                                       │
│   @supabase/ssr                                                   │
│     (auth cookies)                                                │
└─────────┬────────────────────────────────┬────────────────────────┘
          │                                │
          │ Auth REST (GoTrue)             │ Direct SQL (pooler:6543)
          ▼                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase (single backend — Postgres + Auth + RLS)               │
│                                                                  │
│  auth.users     ◄── managed by GoTrue (email/pw + OAuth)         │
│       │                                                          │
│       │ trigger handle_new_user()                                │
│       ▼                                                          │
│  profiles (id uuid pk → auth.users)                              │
│                                                                  │
│  user_favorites, user_learned, user_quiz_results,                │
│  user_cards, user_words           (RLS: auth.uid()=user_id)      │
│                                                                  │
│  words ─┬─ word_definitions  (zh / ja / en …, CEFR)              │
│         ├─ word_examples ─ word_example_translations             │
│         ├─ word_tags ─ tags                                      │
│         ├─ word_relations  (synonym / antonym / confusing / …)   │
│         └─ categories  (FK)                                      │
│  cards, events                    (RLS: public read / anon ins.) │
└──────────────────────────────────────────────────────────────────┘

外部:
  upload.wikimedia.org   ─ 圖片來源（72 字）
  loremflickr.com        ─ 圖片 fallback
  accounts.google.com    ─ OAuth (managed by Supabase, no DIY)
```

---

## 2. 技術堆疊

| Layer | 用什麼 | 為什麼 |
|---|---|---|
| Framework | Next.js 14.2.35 (App Router) | SSG + RSC + Edge middleware + API routes 一站搞定 |
| Language | TypeScript 5.5 (strict) | 編譯期攔錯 |
| Style | Tailwind 3.4 | 卡片式 UI 寫起來快 |
| Backend | **Supabase**（Postgres + Auth + RLS） | 一個 service 全包；省掉自寫密碼 hashing / OAuth / RLS |
| DB driver | `postgres` (porsager/postgres) via pooler:6543 | Edge limit；Node runtime；prepare:false 配 transaction-mode pooler |
| User Auth | `@supabase/ssr` + `@supabase/supabase-js` | 內建 email/password、Google OAuth、session cookie |
| Admin Auth | 仍為 DIY PBKDF2 + HMAC cookie | 單一密碼，跟用戶系統解耦，故意不走 Supabase |
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
├── db.ts                     # postgres-js lazy initializer（pooler:6543, prepare:false）
├── data.ts                   # public words 讀取 (DB JOIN 子表 → static fallback)
├── words.ts                  # 105 字靜態 seed (legacyToV2 normalizer 補 v2 shape)
├── words-db.ts               # admin CRUD (transactional, server-only)
├── word-validate.ts
├── users-db.ts               # profiles + per-user 資料
├── current-user.ts           # cookie → Supabase user (server-only)
├── auth.ts                   # admin HMAC cookie
├── safe-redirect.ts          # 防 open redirect 的 next 驗證
├── cards-db.ts               # SRS card + user_card 操作（含 CEFR/tag filter）
├── srs.ts                    # 排程演算法
├── mastery.ts                # 單詞熟練度 (EMA + forgetting curve)
├── categories.ts             # 9 分類靜態（client-safe）
├── categories-db.ts          # 同名 DB-aware loader（server-only，留作未來 DB-driven 切換）
├── supabase/                 # Supabase SSR clients
│   ├── client.ts             # browser
│   ├── server.ts             # server (cookies-based)
│   └── middleware.ts         # middleware-side session refresh
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
| GET | `/api/study/queue?limit=20&new=10[&cefr=A1,A2][&tags=foo,bar]` | node | 取到期 + 新卡，附 MCQ choices；可按 CEFR / 自由 tag 過濾 |
| POST | `/api/study/answer` | node | `{cardId, rating}` → 排下次複習 |

---

## 6. Database schema (schema v2)

> 2026-02 重構為正規化結構：原本 `words` 內的 `chinese / examples / related_words / confusing_words` 全部抽到獨立關聯表，加上 CEFR / status / 多語言 / typed relations / 自由 tag。詳細歷史見 `/Users/rex/.claude/plans/streamed-wobbling-aho.md` 的 Phase 1-3。

### Words 核心 + 關聯表

```
categories
  id TEXT PK                  -- 'kitchen' | 'bathroom' | ...
  name, name_zh, emoji, description, color, image_url, sort_order, created_at

words
  id TEXT PK
  word TEXT, also_known_as TEXT[], part_of_speech TEXT,
  category TEXT NOT NULL REFERENCES categories(id)  ON DELETE RESTRICT
  pronunciation TEXT, audio_url TEXT NULL,
  image_url TEXT,
  cefr_level TEXT  CHECK IN ('A1'..'C2')  NULL,
  status TEXT NOT NULL DEFAULT 'published'
       CHECK IN ('draft','published','archived'),
  deleted_at TIMESTAMPTZ NULL,                      -- soft delete
  collocations TEXT[], note TEXT,
  created_at, updated_at
  INDEX words_category_idx, words_word_idx (lower(word))

word_definitions                                      -- 多語言義項
  id BIGSERIAL PK
  word_id TEXT FK CASCADE
  language TEXT NOT NULL                              -- 'zh' | 'ja' | 'en' | …
  definition TEXT NOT NULL
  cefr_level TEXT NULL  (CHECK A1..C2)
  sort_order INT
  UNIQUE (word_id, language, sort_order)
  INDEX (word_id, language)

word_examples                                         -- 例句本體
  id BIGSERIAL PK
  word_id TEXT FK CASCADE
  sentence TEXT NOT NULL                              -- 英文原句
  cefr_level TEXT NULL
  sort_order INT
  INDEX (word_id)

word_example_translations                             -- 每句多語言翻譯
  example_id BIGINT FK CASCADE
  language TEXT, translation TEXT
  PK (example_id, language)

tags
  id TEXT PK                  -- slug
  name, emoji, color, created_at

word_tags                                             -- 字 ↔ 自由 tag
  word_id TEXT FK CASCADE, tag_id TEXT FK CASCADE
  PK (word_id, tag_id)
  INDEX word_tags_tag_idx (tag_id)

word_relations                                        -- 強型別關係圖
  id BIGSERIAL PK
  source_word_id TEXT FK CASCADE                      -- 一定是真實字
  target_word_id TEXT (no FK — 容許「概念字」)
  relation_type TEXT CHECK IN
    ('synonym','antonym','hypernym','hyponym','confusing','see-also')
  note TEXT NULL
  UNIQUE (source, target, type)
  CHECK (source <> target)
  INDEX src_idx, tgt_idx
```

`target_word_id` 故意不加 FK：legacy 「易混淆」備註常指 `refrigerator` 之類字典裡沒有的概念字，UI 顯示為純文字 chip 即可。Source 端仍有 CASCADE，刪字會自動清關係。

### 事件 / SRS

```
events
  id BIGSERIAL PK
  type TEXT,                  -- view | favorite | pronounce | quiz_attempt
  word_id TEXT, category TEXT, quiz_type TEXT, correct BOOLEAN,
  session_id TEXT, ip_hash TEXT (8 bytes hex), created_at
  INDEX events_type_idx, events_word_idx, events_created_idx (DESC)

cards
  id BIGSERIAL PK
  word_id TEXT FK CASCADE
  card_type TEXT             -- 回想卡 | 填空卡
  front TEXT, back TEXT, explanation TEXT, tags TEXT[]
  deck_key TEXT              -- 'recall-zh-en' | 'recall-en-zh' | 'cloze-1' …
  created_at
  UNIQUE (word_id, deck_key) -- 讓 generator 冪等

user_cards
  user_id UUID FK auth.users CASCADE
  card_id BIGINT FK cards CASCADE
  PK (user_id, card_id)
  status TEXT                -- 新卡 | 學習中 | 複習中 | 穩定
  interval_days NUMERIC(10,4)
  next_review_at TIMESTAMPTZ
  review_count, mistake_count, last_rating, last_reviewed_at, updated_at
  INDEX user_cards_due_idx (user_id, next_review_at)
```

### 使用者帳號

```
auth.users        ← Supabase GoTrue（不要手動 SELECT；用 RLS predicates）
profiles
  id UUID PK REFERENCES auth.users(id) ON DELETE CASCADE
  username TEXT NOT NULL UNIQUE
  created_at
  INDEX profiles_username_lc_idx (lower(username))

user_favorites    (user_id UUID FK CASCADE, word_id TEXT FK CASCADE, created_at)  PK (user_id, word_id)
user_learned      (user_id UUID FK CASCADE, word_id TEXT FK CASCADE, learned_at)  PK 同
user_quiz_results (id BIGSERIAL PK, user_id UUID FK CASCADE, quiz_type, total, correct, created_at)
user_words        (user_id UUID, word_id TEXT, mastery NUMERIC(5,2), last_reviewed_at,
                   review_count, updated_at, PK (user_id, word_id))
```

### 關鍵 FK 鏈

- 刪 `auth.users` 一個 row → `profiles` + 所有 `user_*` cascade 清空
- 刪 `words` 一個 row → `cards`、`word_definitions`、`word_examples` (→ translations)、`word_tags`、`word_relations` (source 端)、`user_favorites`、`user_learned`、`user_words`、`user_cards`(透過 cards) 全部 cascade
- **生產上**已不用 hard delete word —`words-db.softDeleteWord()` 改打 `status='archived'` + `deleted_at`，read path（`lib/data.ts`）以 `WHERE deleted_at IS NULL AND status = 'published'` 過濾
- 刪 `categories` 一個 row → `RESTRICT`（會拒絕，避免誤刪一整個分類）

### RLS 概要

| 表 | SELECT | INSERT / UPDATE |
|---|---|---|
| `words`、`categories`、`tags`、`word_tags`、`word_definitions`、`word_examples`、`word_example_translations`、`word_relations`、`cards` | 公開 `USING (true)` | service-role only（透過 `DATABASE_URL` 直連） |
| `events` | 公開 `USING (true)` | anon `WITH CHECK (true)` |
| `profiles` | 公開 `USING (true)` | self UPDATE `auth.uid() = id` |
| `user_favorites / user_learned / user_quiz_results / user_cards / user_words` | self ALL `auth.uid() = user_id` | 同 |

> **重要**：`lib/db.ts` 用 `DATABASE_URL` 直連 Supabase pooler，那條路徑跑的是 service-tier 角色，RLS **不會生效**。所有 user-scoped 查詢必須在 SQL 自己帶 `WHERE user_id = ${userId}`。Supabase JS SDK 路徑（`@supabase/ssr` createClient）會走 RLS，那是用戶端 auth cookie 帶出來的 anon/auth 角色。

---

## 7. Auth & Sessions

### Admin（單一密碼）

```
POST /api/auth/login {password}
  ↓ timingSafeEqual(password, process.env.ADMIN_PASSWORD)  // constant-time
  ↓ mintAdminToken() → "<expiryMs>.<hmac_b64url>"
  ↓ Set-Cookie: eepd_admin=...; HttpOnly; Secure; SameSite=Lax; 7d

middleware.ts on /admin/* or /api/admin/*:
  ↓ verifyAdminToken(cookie) — HMAC over expiry
  ↓   key = ADMIN_SECRET (preferred) || ADMIN_PASSWORD (fallback)
  ↓ 通過 → next()
  ↓ 失敗 + HTML → 302 /login?next=...
  ↓ 失敗 + JSON → 401
```

> 設 `ADMIN_SECRET` 之後，密碼與簽章金鑰就解耦：rotate 密碼不會把所有 admin
> session 一次踢出，而且密碼/金鑰任何一個外洩都不會直接破掉另一個。沒設時退回
> 用 `ADMIN_PASSWORD` 簽章，向後相容。

### User accounts（多用戶 — Supabase Auth）

密碼、Session、Google OAuth、email confirmation 全由 Supabase 的 GoTrue 服務管理。Cookie 由 `@supabase/ssr` 寫入（`sb-<project>-auth-token`），refresh 由 middleware 每次請求觸發。

```
Client form (RegisterForm / SigninForm)
     ↓
supabase.auth.signUp({email, password, options:{data:{username}}})
supabase.auth.signInWithPassword({email, password})
     ↓
Supabase GoTrue (auth.users)                       密碼 hash 由 Supabase 處理
     ↓                                              （bcrypt + salt）
Trigger handle_new_user()                          自動建 public.profiles row
     ↓
Set-Cookie sb-...auth-token  (httpOnly, 1h access + refresh)

Server: lib/current-user.ts
     ↓
createClient() → supabase.auth.getUser()           讀 cookie 驗 token
     ↓
返回 user.id (UUID) → 查 profiles + per-user 表
```

### Google OAuth flow（透過 Supabase）

```
Client click → supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: '/auth/callback?next=/me' }
})
     ↓
Supabase 302 → accounts.google.com/...             Google client_id/secret 設在 Supabase dashboard
     ↓
Google → Supabase callback → /auth/callback?code=...
     ↓
exchangeCodeForSession(code)                       Supabase 寫 session cookie
     ↓
profiles trigger 也跟著 fire（新用戶）
     ↓
302 → nextPath
```

要設 Google provider：Supabase dashboard → Authentication → Providers → Google → 貼 Client ID + Secret → 把 callback URL 加進 Google Cloud Console。

---

## 8. Word data flow

```
DB ──┐
words + 4 個關聯子查詢 ────┐                                    cache key:
  word_definitions        │                                    "all-words-v3"
  word_examples + transl. ├─→ lib/data.ts  getAllWords()        unstable_cache
  word_relations          │   單一 SQL，LATERAL jsonb_agg       tag "words"
  word_tags               │   每個 word 一次往返組裝完          revalidate 60s
                          │      ↓
                          │   app/layout.tsx (async server)
                          │      ↓
                          │   <WordsProvider words={...}>
                          │      ↓
                          │   useWords() / useWord(id) / useSearchWords(q)
                          │      ↓
                          │   所有 client 元件直接用 (SearchBar / DailyWords /
                          │   SearchClient / FavoritesClient / QuizRunner /
                          │   ProgressClient)
                          │
lib/words.ts ─────────────┘  Fallback when DATABASE_URL 沒設（local dev、build）
(105 字靜態 seed，legacyToV2()
 normalizer 補上 definitions /
 examples.translations / relations)
```

**為什麼這樣設計：**
- Admin 改完字 → `revalidateTag("words")` → public site 60 秒內看到
- Client 元件**不需要**自己 fetch /api/words；server-side 拉好放 context
- Build 不需要 DB（fallback 確保 type-check + page generation 可離線跑）
- **一次 SQL** — 用 `(SELECT jsonb_agg(...) FROM child WHERE word_id = w.id)` 在主查詢內 aggregate，不是 N+1
- 公開 read path filter：`WHERE deleted_at IS NULL AND status = 'published'`，admin path（`lib/words-db.ts`）不過濾，看得到 draft/archived

### Word 物件 shape

`lib/data.ts` 把 row 組成 `Word` 物件給上層：

```ts
interface Word {
  id, word, alsoKnownAs?, category, partOfSpeech, pronunciation, audioUrl?, imageUrl
  cefrLevel?: 'A1'|...|'C2'
  status: 'draft' | 'published' | 'archived'

  definitions: Array<{ language, definition, cefrLevel?, sortOrder }>
  chinese: string                    // = primaryChinese(definitions)，便利欄位
  examples: Array<{
    en: string, zh: string,          // zh 是便利欄位 = translations.zh
    translations: Record<string, string>,
    cefrLevel?, sortOrder
  }>
  relations: Array<{ wordId, type, note? }>   // 6 種 type 見 §6
  tags: string[]

  collocations?, note?
}
```

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
新卡（status="新卡" 或 interval=0）— 固定步進，無錯誤懲罰:
  重來 → 10 min,  學習中
  困難 → 1 day,   學習中
  穩定 → 3 days,  複習中
  熟練 → 7 days,  複習中

已複習過:
  重來 → 重設 10 min, 學習中
  困難 → × 1.3 × penalty
  穩定 → × 2.4 × penalty
  熟練 → × 3.8 × penalty

封頂 5 年。humanizeInterval() 把小數天轉成「N 分鐘 / 小時 / 天 / 週 / 月 / 年」。
```

#### 錯誤率懲罰（mistakePenalty）

歷史錯誤越多的卡，成長倍率越打折，避免一次答對就跳很遠：

```
rate    = mistake_count / review_count       # lifetime ratio
penalty = max(0.5, 1 − rate × 0.5)           # floor: 一半倍率封底

rate=0     → 1.00  (no change)
rate=0.5   → 0.75
rate=1.0   → 0.50  (最多砍一半)
```

實例：interval=10 天的卡，答「熟練」應該變成 38 天；但如果這張卡 5 次裡錯 2 次（rate=0.4），實際間隔 = 10 × 3.8 × 0.8 = 30.4 天。

API response 多帶 `next.penaltyApplied`（%），UI 在「下次複習」後面顯示「(依錯誤紀錄縮短 N%)」。

### 答題速度建議（client-only）

`StudyClient` 用 `performance.now()` 記從卡顯示到點選的毫秒，答對後**只是高亮建議的按鈕**（不自動評分，使用者最終決定）：

```
回想卡：  <3s → 熟練,  <7s → 穩定,  >7s → 困難
填空卡：  <4s → 熟練,  <8s → 穩定,  >8s → 困難
```

建議按鈕有 ring + 「建議」徽章；其他鈕仍可點。Server 端完全不知道這個 elapsed — 純粹是 UX 提示。

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
                                      # 用 DATABASE_URL 連 Supabase pooler
  ↓
next build                            # 105+ word pages SSG, 其餘 ISR/dynamic
  ↓
Edge / Node functions 打包
  ↓ Deploy → READY
```

### 環境變數（Production）
```
# Supabase (Vercel ↔ Supabase Marketplace 自動注入)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY    # 僅 server；繞過 RLS，給 fanout / admin 工具用
DATABASE_URL                 # Postgres pooler (port 6543)，給 lib/db.ts 直連

# Admin
ADMIN_PASSWORD               # 後台單一密碼
ADMIN_SECRET                 # 選填；admin cookie HMAC 簽章金鑰
                             # 沒設時 fallback 用 ADMIN_PASSWORD（向後相容）
```

> Google OAuth 的 client_id / secret 設在 **Supabase Dashboard**，不是專案環境變數。
> 換句話說只要 Supabase 端的 Google provider 開好，前端 `signInWithOAuth` 就能用。

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

### Google OAuth（透過 Supabase）
**不是 DIY** — 整套 OAuth 由 Supabase 的 GoTrue 處理。前端 `supabase.auth.signInWithOAuth({ provider: "google" })` 就會把用戶送去 Google；回來時打到 `/auth/callback`，那支 route 只負責 `exchangeCodeForSession(code)` 並寫 cookie。

設定點：
- **Supabase Dashboard → Authentication → Providers → Google** 貼 Client ID/Secret
- **Google Cloud Console** 把 Supabase 的 callback URL（`https://<project>.supabase.co/auth/v1/callback`）加進授權 redirect
- 前端傳的 `redirectTo` 必須是專案網域，且該網域要加到 **Supabase → URL Configuration → Redirect URLs** 白名單裡

`/auth/callback` 自己會驗證 `next` 是同源路徑（防 open redirect）。三個表單頁面（`/signin`、`/register`、`/login`）的 `next` 也透過 `lib/safe-redirect.ts` 統一驗證。

---

## 14. 路徑慣例 / 常見陷阱

- **Server-only 模組**用 `import "server-only"` 標註（`lib/words-db.ts`, `lib/users-db.ts`, `lib/current-user.ts`），誤匯入 client 端會 build error。
- **Edge routes**（middleware、登入登出、events）不能用 `cookies()` from `next/headers`，要從 `req.cookies` 讀。
- **`unstable_cache` tag**：admin 寫完叫 `revalidateTag("words")`，ISR 自動失效。
- **Supabase pooler (transaction mode)** 不支援跨 statement 的 prepared statement，所以 `lib/db.ts` 用 `prepare:false`；migrate 也沒包 BEGIN/COMMIT，每個 statement 獨立 idempotent。
- **`lib/db.ts` 直連繞過 RLS**：`DATABASE_URL` 用的是 service-tier 角色，所以 Postgres RLS 不會被執行。所有 user-scoped 查詢都必須**顯式**帶 `WHERE user_id = ${userId}` — 這是真正的防線，RLS 只在 supabase-js 路徑生效。
- **`DISTINCT` + `ORDER BY random()`** 在 PG 違法。乾擾項那邊改成過量抽 + JS dedupe。
- **`vercel env pull` 拉不到 Marketplace 注入的 Sensitive 值**（DATABASE_URL 等顯示空字串）— 只能在 build/runtime 取得。所以本地開發若要 DB 連線，得從 Vercel dashboard 手動拷貝。
