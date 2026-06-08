# Architecture — Tuji（圖鑑式英文）

> 完整技術參考。如果你只是要把專案跑起來，看 [README.md](./README.md) 就好；
> 產品功能盤點看 [PRODUCT_MODULES.md](./PRODUCT_MODULES.md)。

---

## 1. 系統概觀

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│  ├── Tuji Shell (components/tuji/Shell.tsx)                       │
│  │   - sidebar / mobile tab bar / 吉祥物                          │
│  │   - WordsProvider / CategoriesProvider / UserProvider          │
│  │   - SettingsProvider          (draft + save, hydrate from API) │
│  │   - I18nProvider              (zh-Hant / zh-Hans / ja)         │
│  │   - AppScale                  (font_size → zoom)               │
│  │   - localStorage cache        (favorites / learned)            │
│  │   - Web Speech API            (US/UK accent)                   │
│  │   - lib/supabase/client.ts    (auth signUp/signIn/OAuth)       │
│  │   - lib/analytics.ts → /api/events (sendBeacon)                │
│  └── Admin (gated by single password)                             │
└─────────────────┬─────────────────────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼─────────────────────────────────────────────────┐
│  Vercel (Next.js 14 App Router, Fluid Compute)                    │
│                                                                   │
│  middleware.ts                                                    │
│    ├─ /admin/* + /api/admin/*  → admin HMAC cookie gate           │
│    └─ everything else          → refresh Supabase session cookie  │
│                                                                   │
│  Server Components ────► lib/current-user.ts ─┐                   │
│  API routes (Node):                            │                  │
│    /api/events  /api/search                    │                  │
│    /api/users/{me,profile,settings,            │                  │
│                favorites,learned,sync,         ├─► @supabase/ssr  │
│                progress,delete-account}        │   (auth cookies) │
│    /api/study/{queue,answer,stats}             │                  │
│    /api/admin/{words,words/:id,                │                  │
│                words/:id/enrich,               │                  │
│                upload,fetch-image}             │                  │
│    /api/cron/partman    (Vercel Cron)          │                  │
│                                                │                  │
│                       lib/db.ts (postgres-js, pooler:6543, max=15)│
└─────────┬────────────────────────────────┬────────────────────────┘
          │                                │
          │ Auth REST (GoTrue)             │ Direct SQL
          ▼                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase (Postgres + Auth + RLS + Storage)                      │
│                                                                  │
│  auth.users  ──trigger handle_new_user──►  profiles              │
│                                                                  │
│  per-user:                                                       │
│    user_settings, user_favorites, user_learned,                  │
│    user_quiz_results, user_cards, user_words,                    │
│    study_logs                       (RLS: auth.uid()=user_id)    │
│                                                                  │
│  words ─┬─ word_definitions       (zh-Hant / ja / en …, CEFR)    │
│         ├─ word_examples ─ word_example_translations             │
│         ├─ word_localized_texts   (etymology / note overlay)     │
│         ├─ word_tags ─ tags                                      │
│         ├─ word_relations         (synonym / antonym / …)        │
│         ├─ word_media             (image / audio / ai_memory)    │
│         ├─ word_categories        (M:N, is_primary)              │
│         └─ category (legacy FK, still used by reads)             │
│                                                                  │
│  categories ─ category_translations (per-language name overlay)  │
│  cards, events                    (RLS: public read / anon ins.) │
│                                                                  │
│  Storage:  word-images bucket (public read)                      │
│            ── 自家託管，runtime 不依賴任何外部圖床                │
└──────────────────────────────────────────────────────────────────┘

外部：
  accounts.google.com  ─ OAuth (managed by Supabase)
  AI Gateway           ─ admin/scripts only: enrich + translate
                         (anthropic/claude-sonnet-4-6 default)
```

---

## 2. 技術堆疊

| Layer | 用什麼 | 為什麼 |
|---|---|---|
| Framework | Next.js 14.2 (App Router) | SSG + RSC + middleware + API routes 一站搞定 |
| Language | TypeScript 5.5 (strict) | 編譯期攔錯 |
| Style | Tailwind 3.4 + 自訂 Tuji 設計系統（`components/tuji/ui.tsx`） | 卡片式 + 吉祥物風格 |
| Backend | **Supabase**（Postgres + Auth + RLS + Storage） | 一個 service 全包；省掉自寫密碼 hashing / OAuth / RLS / 圖檔伺服 |
| DB driver | `postgres` (porsager/postgres) via pooler:6543, `max=15` | Node runtime；transaction-mode pooler；prepare:false |
| User Auth | `@supabase/ssr` + `@supabase/supabase-js` | email/password、Google OAuth、session cookie 全內建 |
| Admin Auth | DIY HMAC cookie + `ADMIN_SECRET` | 單一密碼，跟用戶系統解耦 |
| Speech | Web Speech API (`speechSynthesis`) | US/UK 口音；不用後端 |
| 圖片 | **Supabase Storage**（`word-images` public bucket） | 自家託管、無外部 runtime 依賴 |
| AI（admin / scripts） | `ai` SDK v6 經 Vercel AI Gateway，預設 `anthropic/claude-sonnet-4-6` | enrich / translate；前台 runtime 不會打 AI |
| i18n | `lib/i18n.ts`（UI）+ `lib/opencc.ts`（zh-Hans 即時轉換）+ DB overlays | 三語：zh-Hant（source）/ zh-Hans / ja |
| 部署 | Vercel Fluid Compute | Next.js 原生；Node default 300s timeout |

---

## 3. 目錄結構

```
app/                          # Next.js App Router
├── layout.tsx                # 根 layout：載 words + currentUser + settings + categories
├── page.tsx                  # Today 首頁
├── not-found.tsx
├── (公開)
│   ├── cards/                # 全部單字格狀瀏覽 + 分類晶片 + 漸進分頁
│   ├── category/[id]/
│   ├── word/[id]/            # 譯義 / 詞形變化 / 來源故事 tabbed card
│   ├── search/               # /api/search 即時、空狀態 → browse fallback
│   ├── favorites/            # 分類晶片 + 排序（新/舊/A–Z）
│   ├── progress/             # 圖鑑完成度 + 連勝 + 6 週熱力圖
│   └── study/                # SRS 入口（landing → answer → review → done）
├── (使用者)
│   ├── register/  signin/    # Supabase Auth 表單
│   ├── settings/             # SettingsClient（draft + 保存）
│   └── me/                   # Profile hero + Top 5 + 需要加強 + 入口
├── (Admin — middleware 守門)
│   ├── admin/page.tsx        # 總覽
│   ├── admin/words/{list, new, edit}
│   └── admin/stats/
├── login/                    # admin 單一密碼登入
└── api/
    ├── auth/login | logout                  # admin
    ├── auth/callback                        # Supabase OAuth code exchange
    ├── users/{me, profile, settings,
    │          favorites, learned, sync,
    │          progress, delete-account}     # user accounts + per-user data
    ├── admin/words(/:id)                    # CRUD
    ├── admin/words/[id]/enrich              # 單字 AI 補齊（etymology / forms / chinese_def）
    ├── admin/upload | fetch-image           # 圖檔
    ├── events                               # 公開埋點
    ├── search                               # 全站搜尋（pg_trgm）
    ├── study/{queue, answer, stats}         # SRS
    └── cron/partman                         # Vercel Cron — 分區維護

components/
├── tuji/                     # Tuji 設計系統
│   ├── Shell.tsx             # sidebar + mobile tab bar + 吉祥物殼
│   ├── Mascot.tsx            # 6 姿勢吉祥物
│   └── ui.tsx                # WordTile / Card / Chip / Button / TUJI palette / shade()
├── AppScale.tsx              # font_size → 全站 zoom（root --app-scale）
├── CategoriesProvider.tsx
├── EventTracker.tsx
├── FavoriteButton.tsx
├── GoogleButton.tsx
├── HydrateUserState.tsx      # localStorage 與 server 收藏/已學 union
├── I18n.tsx                  # I18nProvider + useT()
├── PronunciationButton.tsx   # 走 user_settings.accent (US/UK)
├── SettingsProvider.tsx      # draft + save、reset on login change
├── UserProvider.tsx
├── useSearch.ts              # /api/search 客戶端 hook
├── WordCard.tsx
└── WordPeekModal.tsx         # 答題後浮層；Step 2/3 點錯也彈出

lib/                          # 純邏輯，沒有 React
├── db.ts                     # postgres-js（pooler:6543, prepare:false, max=15）
├── data.ts                   # 公開 read path：words + 4 子表 LATERAL jsonb_agg
├── words.ts                  # 105 字靜態 seed（legacyToV2 normalizer）
├── words-db.ts               # admin CRUD（server-only）
├── word-validate.ts
├── users-db.ts               # profiles + per-user 資料 + mastery + settings
├── current-user.ts           # cookie → Supabase user（server-only）
├── auth.ts                   # admin HMAC cookie
├── safe-redirect.ts          # 同源 next 驗證
├── settings.ts               # UserSettings 型別 + normalize / clamp / 預設值
├── cards-db.ts               # SRS 卡片 + user_card；attachChoices；attachMasteryAndSort
├── srs.ts                    # 排程演算法（重來 / 困難 / 穩定 / 熟練）
├── scheduling.ts             # computeNewLimit() + BACKLOG_THRESHOLDS（自適新卡上限）
├── distractors.ts            # MCQ 乾擾項 metadata-aware 評分（同分類 / 詞性 / 字長）
├── misspellings.ts           # Step 3 拼字題的演算法錯拼產生器
├── mastery.ts                # EMA + 遺忘曲線（lazy decay）
├── categories.ts             # 分類靜態（client-safe，含 zodiac）
├── categories-db.ts          # DB-aware loader（server-only）
├── supabase/{client,server,middleware}.ts   # SSR 三 clients
├── analytics.ts              # client sendBeacon
├── speech.ts                 # Web Speech API + 口音切換
├── storage.ts                # localStorage + dual-write to server
├── i18n.ts                   # UI 字典 zh-Hant / zh-Hans / ja
├── word-localize.ts          # 單字內容語系 fallback：word_localized_texts → 基底欄位
├── study-localize.ts         # 學習介面字串 + 卡片內容語系化
├── opencc.ts                 # 繁→簡即時轉換（zh-Hans 自動衍生）
├── enrich.ts                 # AI 補齊（etymology / forms / chinese_def / note）
├── translate.ts              # AI 翻譯 helper（給 npm run translate）
├── avatars.ts                # 6 姿勢吉祥物（暱稱對應）
└── supplemental-words.json   # 363 字補充字庫（IPA + 富資料）

scripts/
├── migrate.ts                # DDL + seed + 卡片 generator；vercel-build 自動跑
├── enrich.ts                 # 批次：撈 etymology IS NULL → AI gateway → 寫回
├── translate.ts              # 批次翻譯：缺少語系的 word_definitions / category_translations
├── translate-list.ts         # 列出待翻譯項目
├── translate-apply.ts        # 套用人工翻譯回 DB
├── upload-local-images.ts    # public/word-images/*.png → Supabase Storage
├── upload-images.ts          # 一次性外連 → Supabase Storage
└── fetch-wiki-images.mjs     # legacy

middleware.ts                 # /admin/* 守門 + Supabase session 刷新
types/index.ts                # 共用型別
```

---

## 4. 頁面路由

### 公開頁

| Route | 渲染 | 用途 |
|---|---|---|
| `/` | SSR + ISR 60s | Today：問候 / 連勝 / 每日 5 字 / 主題入口 / 今日任務進度 |
| `/cards` | Dynamic | 全部單字（PAGE_SIZE=60，「顯示更多」），分類晶片 |
| `/category/[id]` | SSG + ISR 60s | 分類圖鑑頁；`generateStaticParams` |
| `/word/[id]` | SSG + ISR 60s | 單字詳情；fires `view` event；登入用戶顯示熟練度條 |
| `/search` | Dynamic | 即時搜尋（中/英）；空狀態 → browse fallback |
| `/favorites` | Dynamic | 我的收藏 + 分類晶片 + 排序（新/舊/A–Z） |
| `/progress` | Dynamic | 圖鑑完成度 / 連勝 / 6 週熱力圖（Asia/Taipei） |
| `/study` | Dynamic（登入） | SRS 入口（landing → answer → review → done） |

### 用戶 / Admin

| Route | 守門 | 用途 |
|---|---|---|
| `/register` `/signin` | 無 | 帳號註冊 / 登入 |
| `/settings` | server-side 檢查 | 學習偏好 / 顯示 / 發音 / 帳號 / 資料 |
| `/me` | server-side 檢查 | Profile hero + Top 5 + 需要加強 + 入口 |
| `/login` | 無 | Admin 單一密碼登入 |
| `/admin/*` | `middleware.ts` 攔截 | Admin CRUD + 統計 + AI 補齊 |

> 舊版 `/quiz` 已退場（PRODUCT_MODULES §「明確不做」），不在主導航。

---

## 5. API endpoints

### 公開

| Method | Path | Runtime | 用途 |
|---|---|---|---|
| POST | `/api/events` | edge | view / favorite / pronounce / quiz_attempt；IP SHA-256 前 8 bytes |
| GET | `/api/search?q=...` | node | pg_trgm 模糊查詢 words.word + word_definitions |

### 使用者帳號 + per-user 資料

| Method | Path | 公開？ | 用途 |
|---|---|---|---|
| GET | `/api/users/me` | 自動帶 cookie | 取個人 bundle |
| PATCH | `/api/users/profile` | 需登入 | 暱稱 / 頭像 |
| GET / PUT | `/api/users/settings` | 需登入 | `user_settings`：dailyGoal / accent / showZh / studyCategories / studyDecks / uiLang / fontSize |
| GET / POST | `/api/users/favorites` | 需登入 | 我的收藏 |
| POST | `/api/users/learned` | 需登入 | 標記已學 |
| POST | `/api/users/sync` | 需登入 | localStorage → server 合併 |
| GET | `/api/users/progress` | 需登入 | 連勝 / 熱力圖 / 圖鑑完成度 |
| POST | `/api/users/delete-account` | 需登入 | 永久刪除（CASCADE）+ 二次確認 |

> Supabase Auth 走 `@supabase/ssr`：`signUp`、`signInWithPassword`、`signInWithOAuth({provider:"google"})` 由 client SDK 直打，不再有 `/api/users/register|login|logout` 路由。

### SRS

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/study/queue?mode=new\|review&limit=...[&cats=...][&decks=...]` | 取到期 + 新卡；附 MCQ `choices`（4 選 1）與 `spellingChoices`（Step 3 候選詞）；按 `user_settings.studyCategories / studyDecks` 過濾；mastery ASC 排弱字優先 |
| POST | `/api/study/answer` | `{cardId, rating}` → 排下次複習 + 更新 mastery + 寫 study_logs |
| GET | `/api/study/stats` | 30d 趨勢 / today 已學 / 完成率 |

### Admin

| Method | Path | 守門 | 用途 |
|---|---|---|---|
| POST | `/api/auth/login` | 公開（middleware 例外） | 設 admin cookie |
| POST | `/api/auth/logout` | — | 清 cookie |
| GET / POST | `/api/admin/words` | middleware | CRUD |
| GET / PATCH / DELETE | `/api/admin/words/[id]` | middleware | CRUD |
| POST | `/api/admin/words/[id]/enrich` | middleware | 單字 AI 補齊；走 AI Gateway |
| POST | `/api/admin/upload` | middleware | multipart；寫入 `word-images` bucket |
| POST | `/api/admin/fetch-image` | middleware | server-side 抓 URL → bucket（繞家用 IP 限流） |

### Cron

| Method | Path | 排程 | 用途 |
|---|---|---|---|
| GET | `/api/cron/partman` | Vercel Cron | events 表分區維護（未來保留） |

---

## 6. Database schema

> 2026 上半年的改動：拉出 `user_settings`、`study_logs`，導入 `word_media` / `word_categories`（M:N） 與
> `category_translations` / `word_localized_texts` 兩張 overlay 表，外加 `pg_trgm` 模糊索引。
> 詳細歷史見 `scripts/migrate.ts` 內注解。

### 內容核心

```
categories
  id TEXT PK                  -- 'kitchen' | 'bathroom' | 'zodiac' | …
  name, name_zh, emoji, description, color, image_url, sort_order, created_at

category_translations         -- 名稱多語 overlay（zh-Hans 由 OpenCC 即時轉，不存）
  category_id TEXT FK CASCADE
  language    TEXT             -- 'ja' | 'en' | …
  name        TEXT
  PK (category_id, language)

words
  id TEXT PK
  word TEXT, also_known_as TEXT[], part_of_speech TEXT,
  category TEXT NOT NULL REFERENCES categories(id)  ON DELETE RESTRICT  -- legacy FK；reads still use
  pronunciation TEXT, audio_url TEXT NULL,
  image_url TEXT,                                    -- 預設圖片（word_media 中 is_primary 的 image kind）
  image_source_url, image_license, image_credit,     -- 出處 audit
  cefr_level TEXT  CHECK IN ('A1'..'C2')  NULL,
  status TEXT NOT NULL DEFAULT 'published'
       CHECK IN ('draft','published','archived'),
  deleted_at TIMESTAMPTZ NULL,                       -- soft delete
  collocations TEXT[], note TEXT,
  etymology TEXT NULL,                               -- AI 富化「來源故事」
  forms JSONB NOT NULL DEFAULT '[]'::jsonb,          -- [{label,value}]，AI 富化
  chinese_definition TEXT NULL,                      -- 中文釋義（與英文釋義對齊深度）
  created_at, updated_at
  INDEX words_category_idx, words_word_idx (lower(word))
  GIN  words_word_trgm_idx  USING pg_trgm WHERE deleted_at IS NULL AND status='published'

word_categories               -- 多分類關係（is_primary 從 words.category 回填）
  word_id, category_id, is_primary, created_at
  PK (word_id, category_id)
  UNIQUE INDEX (word_id) WHERE is_primary

word_definitions              -- 多語言義項
  id BIGSERIAL PK, word_id FK CASCADE
  language TEXT                -- 'zh-Hant' | 'zh-Hans' | 'ja' | 'en'
  definition TEXT
  cefr_level TEXT NULL, sort_order INT
  UNIQUE (word_id, language, sort_order)
  INDEX (word_id, language), (language, word_id)
  GIN  word_defs_text_trgm_idx USING pg_trgm

word_examples
  id BIGSERIAL PK, word_id FK CASCADE
  sentence TEXT                -- 英文原句
  cefr_level TEXT NULL, sort_order INT
  INDEX (word_id, sort_order)

word_example_translations
  example_id BIGINT FK CASCADE, language TEXT, translation TEXT
  PK (example_id, language)

word_localized_texts          -- etymology / note 多語 overlay
  word_id FK CASCADE
  field    CHECK IN ('etymology','note')
  language, value
  PK (word_id, field, language)

word_media                    -- 圖 / 音 / AI 記憶圖（多筆同 kind 用 is_primary 挑預設）
  id BIGSERIAL PK, word_id FK CASCADE
  kind CHECK IN ('image','audio','ai_memory','video')
  url, storage_path, mime_type, width, height, duration_ms,
  source_url, license, credit, prompt, model,
  is_primary BOOL, sort_order INT, metadata JSONB
  UNIQUE INDEX (word_id, kind) WHERE is_primary

tags / word_tags              -- 自由 tag
word_relations                -- 6 種強型別關係（synonym / antonym / hypernym / hyponym / confusing / see-also）
                                 source 必為真實字、target 容許概念字（不加 FK）
```

### 使用者帳號 + 偏好 + 學習

```
auth.users        ← Supabase GoTrue（密碼、cookie、OAuth 都由 Supabase 管）
profiles          id (UUID PK → auth.users CASCADE), username UNIQUE, created_at
                  INDEX profiles_username_lc_idx (lower(username))

user_settings     -- 一個 user 一列；首次保存才寫進來
  user_id   UUID PK FK auth.users CASCADE
  daily_goal INT  DEFAULT 12          -- 同時是「今天的新學上限」
  accent    TEXT DEFAULT 'us'         -- 'us' | 'uk'
  show_zh   BOOL DEFAULT TRUE
  study_category   TEXT DEFAULT 'all' -- 舊版單值；保留供 rollback
  study_categories TEXT DEFAULT ''    -- 多選：comma-joined ids，'' = 未挑
  study_decks      TEXT DEFAULT ''    -- comma-joined deck_key；'' = 全 deck
  ui_lang   TEXT DEFAULT 'zh-Hant'    -- 'zh-Hant' | 'zh-Hans' | 'ja'
  font_size TEXT DEFAULT 'md'         -- 'sm' | 'md' | 'lg'
  updated_at

user_favorites    user_id FK CASCADE, word_id FK CASCADE, created_at  PK (user_id, word_id)
user_learned      user_id FK CASCADE, word_id FK CASCADE, learned_at   PK 同
user_quiz_results id BIGSERIAL PK, user_id FK CASCADE, quiz_type, total, correct, created_at

cards
  id BIGSERIAL PK, word_id FK CASCADE
  card_type TEXT, front TEXT, back TEXT, explanation TEXT, tags TEXT[]
  deck_key  TEXT             -- 目前只有 'image-en'（看圖選英文）
  UNIQUE (word_id, deck_key)

user_cards
  user_id FK CASCADE, card_id FK CASCADE, PK (user_id, card_id)
  status TEXT                 -- 新卡 | 學習中 | 複習中 | 穩定
  interval_days NUMERIC(10,4), next_review_at TIMESTAMPTZ
  review_count, mistake_count, last_rating, last_reviewed_at,
  created_at, updated_at
  INDEX user_cards_due_idx (user_id, next_review_at)
  INDEX user_cards_created_idx (user_id, created_at)

user_words                    -- 單字熟練度（跨卡型；EMA + lazy decay）
  user_id, word_id, mastery NUMERIC(5,2),
  last_reviewed_at, review_count, updated_at
  PK (user_id, word_id), INDEX (user_id, mastery)

study_logs                    -- append-only：每次答題的完整快照
  id BIGSERIAL PK, user_id FK CASCADE, word_id FK CASCADE
  activity CHECK IN ('flashcard','mcq','typing','listening','image_recall','reading')
  rating SMALLINT CHECK IN (0,1,2,3)
  is_correct BOOL, response_ms INT
  interval_before / interval_after / ease_before / ease_after
  mastery_before / mastery_after
  client_session_id TEXT, metadata JSONB
  INDEX (user_id, created_at DESC)
```

### 事件

```
events                        -- 公開埋點（匿名）；與 study_logs 互不重疊
  id BIGSERIAL PK
  type TEXT CHECK IN (view, favorite, pronounce, quiz_attempt)
  word_id, category, quiz_type, correct,
  session_id, ip_hash (SHA-256 前 8 bytes), created_at
  INDEX (type), (word_id), (created_at DESC)
```

### 關鍵 FK 鏈

- 刪 `auth.users` 一個 row → `profiles` + 所有 `user_*` + `study_logs` cascade 清空
- 刪 `words` 一個 row → `cards`、`word_definitions`、`word_examples` (→ translations)、`word_tags`、`word_relations`(source 端)、`word_media`、`word_categories`、`word_localized_texts`、`user_favorites`、`user_learned`、`user_words`、`user_cards`（透過 cards）、`study_logs` 全部 cascade
- 生產上不再 hard delete word — `words-db.softDeleteWord()` 改打 `status='archived'` + `deleted_at`，公開 read path 過濾 `WHERE deleted_at IS NULL AND status='published'`
- 刪 `categories` 一個 row → `RESTRICT`（避免誤刪一整個分類）

### RLS 概要

| 表 | SELECT | INSERT / UPDATE |
|---|---|---|
| `words`、`categories`、`category_translations`、`tags`、`word_tags`、`word_definitions`、`word_examples`、`word_example_translations`、`word_relations`、`word_media`、`word_categories`、`word_localized_texts`、`cards` | 公開 `USING(true)` | service-tier only |
| `events` | 公開 `USING(true)` | anon `WITH CHECK(true)` |
| `profiles` | 公開 `USING(true)` | self UPDATE `auth.uid()=id` |
| `user_settings / user_favorites / user_learned / user_cards / user_words` | self ALL `auth.uid()=user_id` | 同 |
| `study_logs` | self SELECT `auth.uid()=user_id` | self INSERT `auth.uid()=user_id` |

> **重要**：`lib/db.ts` 用 `DATABASE_URL` 直連 Supabase pooler，那條路徑跑的是 service-tier 角色，RLS **不會生效**。所有 user-scoped 查詢必須在 SQL 自己帶 `WHERE user_id = ${userId}`。Supabase JS SDK 路徑（`@supabase/ssr`）才會走 RLS。

---

## 7. Auth & Sessions

### Admin（單一密碼）

```
POST /api/auth/login {password}
  ↓ timingSafeEqual(password, ADMIN_PASSWORD)
  ↓ mintAdminToken() → "<expiryMs>.<hmac_b64url>"
  ↓ Set-Cookie eepd_admin=...; HttpOnly; Secure; SameSite=Lax; 7d

middleware.ts on /admin/* | /api/admin/*:
  verifyAdminToken(cookie)  — HMAC over expiry
    key = ADMIN_SECRET (preferred) || ADMIN_PASSWORD (fallback)
  通過 → next()
  失敗 + HTML → 302 /login?next=...
  失敗 + JSON → 401
```

設 `ADMIN_SECRET` 之後密碼與簽章金鑰解耦，rotate 密碼不會把 session 全踢出。

### User accounts（Supabase Auth）

密碼、Session、Google OAuth、email confirmation 全由 Supabase 的 GoTrue 處理。Cookie 由 `@supabase/ssr` 寫入（`sb-<project>-auth-token`），refresh 由 middleware 每次請求觸發。

```
RegisterForm / SigninForm (browser)
  → supabase.auth.signUp / signInWithPassword
  → GoTrue 寫 cookie；trigger handle_new_user() 建 profiles row

Server: lib/current-user.ts
  → createClient() → supabase.auth.getUser()  (讀 cookie 驗 token)
  → 返回 user.id → 查 profiles + per-user 表
```

熱路徑（`/api/study/queue` 等高頻 API）會避免重複 `getUser()`，改帶 `userId` 進子 helper。

### Google OAuth（透過 Supabase）

```
signInWithOAuth({provider:'google', options:{redirectTo:'/auth/callback?next=...'}})
  → Supabase 302 → Google → /auth/callback?code=...
  → exchangeCodeForSession(code) → 設 cookie
  → safe-redirect 驗證後 302 → nextPath
```

設定：Supabase Dashboard → Authentication → Providers → Google 貼 Client ID/Secret；Google Cloud Console 把 Supabase 的 callback URL 加入 redirect；專案網域加進 Supabase Redirect URLs 白名單。

---

## 8. Word data flow

```
DB
words + 4 LATERAL 子查詢 ─────┐                cache key:  "all-words-v3"
  word_definitions           │                unstable_cache
  word_examples + transl.    ├─► lib/data.ts  tag "words"
  word_relations             │   getAllWords()  revalidate 60s
  word_tags                  │
                             │
                             ▼
                  app/layout.tsx (async server)
                             │
                             ▼
                  <WordsProvider> + <CategoriesProvider>
                             │
                             ▼
                  useWords() / useWord(id) / useSearchWords(q)
                             │
                             ▼
              SearchBar / DailyWords / SearchClient / FavoritesClient
              StudyClient（landing 用）/ ProgressClient / WordCard / …

lib/words.ts（fallback）   ── 105 字靜態 seed；DATABASE_URL 沒設時填充
```

**為什麼這樣設計：**
- Admin 改完字 → `revalidateTag("words")` → 60 秒內整站看到
- Client 元件不需自行 fetch；server-side 拉好放 context
- Build 不需 DB（fallback 確保 type-check + page generation 可離線跑）
- **一次 SQL** — 用 `(SELECT jsonb_agg(...) FROM child WHERE word_id = w.id)` 在主查詢內 aggregate，不是 N+1

### 語系化（runtime）

- **介面字串** — `lib/i18n.ts` 字典 + `useT()`；`<html lang>` 與 `--app-scale` 從 `user_settings` 推導
- **單字內容** — `lib/word-localize.ts` 對 etymology / note 採 `word_localized_texts → 基底欄位` fallback；definitions 直接挑語系（zh-Hans 沒命中時呼叫 `lib/opencc.ts` 從 zh-Hant 即時轉換）
- **學習介面** — `lib/study-localize.ts` 處理 rating 文案、explanation、提示

### Word 物件 shape

```ts
interface Word {
  id, word, alsoKnownAs?, category, partOfSpeech, pronunciation, audioUrl?, imageUrl
  cefrLevel?: 'A1'|...|'C2'
  status: 'draft' | 'published' | 'archived'
  definitions: Array<{ language, definition, cefrLevel?, sortOrder }>
  chinese: string                    // = primaryChinese(definitions) 便利欄位
  examples: Array<{
    en: string, zh: string,          // zh = translations['zh-Hant']
    translations: Record<string,string>, cefrLevel?, sortOrder
  }>
  relations: Array<{ wordId, type, note? }>
  tags: string[]
  collocations?, note?
  etymology?, forms?                 // AI 富化欄位
  chineseDefinition?                 // 中文釋義（與 englishDefinition 對齊深度）
}
```

---

## 9. 每用戶資料同步

```
未登入：localStorage 是唯一 source of truth（favorites / learned）

登入：
  1. layout.tsx 拉 getCurrentUserBundle() → {user, favorites, learned, settings}
  2. <HydrateUserState> useEffect 將 server 資料 union 進 localStorage
  3. <SettingsProvider> 用 server settings 當 initial；改動先存 draft，按「保存」才 PUT
  4. 之後 toggleFavorite / markLearned：
       - 寫 localStorage（立刻）
       - POST /api/users/{favorites|learned}（fire-and-forget）
  5. 註冊/登入成功時送一次 POST /api/users/sync 把 localStorage 上傳合併
```

**設計準則**：localStorage = 即時無延遲；server = 跨裝置真相。網路抖動不掉資料（下次 sync 補）。

---

## 10. SRS 系統

### 單一 deck：`image-en`（看圖選英文）

歷史上有 `recall-zh-en` / `recall-en-zh` / `cloze-1` 三 deck，2026 收斂成單一 **image-en**：圖片本身就是題目，選 4 選 1 英文答案。`scripts/migrate.ts:cardsForWord()` 每個 word 產一張：

```
deck_key="image-en"  card_type="回想卡"
  front=""                       // 題面是圖（StudyClient WordTile 渲染）
  back=word                      // 正解
  explanation="word [pron] — chinese"
```

`ON CONFLICT (word_id, deck_key) DO NOTHING` 達成冪等；增字 → 自動補卡；停用字 → CASCADE 清。

### MCQ 乾擾項評分（`lib/distractors.ts`）

不再單純 `ORDER BY random()`：先抽一批同 deck 候選字，依以下訊號評分排序，取頂端 3 個（保留少量隨機抖動，避免每次都一樣）：

- 同 category 加分（情境相似）
- 同 part_of_speech 加分
- 字長相近加分
- 顯著「無關」（跨類 + 詞性差很多）扣分

目標：不要再出現「明顯一眼就排除」的選項。

### 拼字題候選（`lib/misspellings.ts`）

`/api/study/queue` 同時附 `spellingChoices` — 正確拼法 + 3 個演算法錯拼（換字母 / 漏字母 / 重複字母 / 換相近鍵位）。Step 3 用這份。

### 排程演算法（`lib/srs.ts`）

```
新卡（status="新卡" 或 interval=0）— 固定步進：
  重來 → 10 min,  學習中
  困難 → 1 day,   學習中
  穩定 → 3 days,  複習中
  熟練 → 7 days,  複習中

已複習過：
  重來 → 重設 10 min, 學習中
  困難 → × 1.3 × penalty
  穩定 → × 2.4 × penalty
  熟練 → × 3.8 × penalty

封頂 5 年。humanizeInterval() 把小數天轉成「N 分鐘 / 小時 / 天 / 週 / 月 / 年」。
mistakePenalty = max(0.5, 1 − (mistakes / reviews) × 0.5)
```

### 自適新卡上限（`lib/scheduling.ts`）

`computeNewLimit(dailyGoal, dueCount)` 依 backlog band 動態縮 / 放新卡額度：

```
BACKLOG_THRESHOLDS（節錄）
  due ≤ 20   → full (= dailyGoal)
  due ≤ 50   → 75%
  due ≤ 100  → 50% (quartered)
  due > 100  → paused → landing 顯示警告 banner + 點 新學 跳確認 modal
```

Today / Settings / Study landing 都會共用這個來計算「今天還能新學幾張」。

### `/study` 入口（landing → answer → review → done）

```
landing
  顯示 stats（total / seen / due / new / todayNew）+ 兩顆按鈕：
    新學 (mode="new")     ── 今天可新學額度 = computeNewLimit(dailyGoal, due) − todayNew
    複習 (mode="review")  ── 最多一次 REVIEW_BATCH (50) 張

→ /api/study/queue?mode=...   先到期 + 補新卡到上限
   附 choices (image-en MCQ) + spellingChoices (Step 3) + mastery
```

#### 新學（mode="new"）三步微課程

每張新卡在「進 SRS 之前」走 3 步，整個 queue 過完才換下一步：

```
Step 1 認識（寫 SRS）
  顯示 圖 + 英文 + KK 音標 + 中文釋義
  2 顆按鈕：認識 / 知道
    認識 → rate 困難（拉進學習中，1 天後再看）
    知道 → rate 穩定（拉進複習中，3 天後再看）

Step 2 辨認（不寫 SRS）
  圖 + 4 選 1 英文（同 image-en choices）
  答錯 → 彈 WordPeekModal 給看完整單字頁；關閉後維持目前卡推進
  答錯的卡會 requeue 到尾巴，直到答對才離開 Step 2

Step 3 拼字（不寫 SRS）
  圖 + 一個候選英文（50% 真拼、50% 拿 spellingChoices 中的錯拼）
  使用者按 對 / 錯 判斷
  錯判 → 同樣彈 WordPeekModal；requeue 到尾巴
```

Step 1 是唯一寫 SRS / mastery 的步驟；Step 2/3 純練習，不會把熟練度刷飛。done 畫面顯示「今天學會的字」格狀。

#### 複習（mode="review"）

```
image-en MCQ 1 張：
  點錯 → 自動 rate "重來" → 0.6s 進下一張（同時彈 WordPeekModal 看單字）
  點對 → 顯示 4 顆按鈕（重來 / 困難 / 穩定 / 熟練）細分難度 → 0.6s 進下一張
```

#### 答題速度建議

`performance.now()` 記從卡顯示到點選的毫秒；答對後高亮**建議**的按鈕（不強制）：

```
<3s → 熟練，<7s → 穩定，>7s → 困難
```

Server 完全不知道這個 elapsed — 純 UX 提示。

### 答題副作用（`/api/study/answer`）

`Promise.all` 同時：
1. `upsert user_cards`（schedule(prev, rating)）
2. `upsert user_words`（mastery EMA + lazy decay）
3. `insert study_logs`（含 before/after 快照）

Response：`{ srs: {…}, mastery: { before, after, delta, level } }`。失敗時 client 保留原卡並顯示錯誤，不靜默掉。

### 效能護欄

- `lib/db.ts` `max=15`（之前 5 會在多人同時跑 queue 時 deadlock → 504）
- `/api/study/queue` 把 4 個子查詢 fan out 跑 `Promise.all`，3–5 s → ~1 s
- 熱路徑跳過第二次 `supabase.auth.getUser()`（呼叫端帶 `userId` 進來）

---

## 10b. 單詞熟練度（Mastery）

獨立於卡片 SRS 的第二層追蹤。**卡片 SRS** 決定「什麼時候再看到這張卡」；**單詞熟練度** 衡量「整體上你對這個字有多熟」，跨同字所有卡型共用。

### 表現分對應 + EMA

```
重來 → 0    困難 → 30    穩定 → 70    熟練 → 100
α = 0.3
mastery_decayed = applyDecay(prev, last_reviewed_at, now)
mastery_new     = 0.3 × score + 0.7 × mastery_decayed
```

### 遺忘曲線（lazy decay）

不跑批次 / trigger。每次讀取時才套用：

```
days_since   = (now − last_reviewed_at) / 1 day
half_life    = max(1, mastery / 5)      -- 100→20d, 20→4d
mastery_now  = mastery × 2^(−days_since / half_life)
```

### 暴露點

- `lib/mastery.ts` — `applyDecay`, `applyAnswer`, `masteryLevel`
- `lib/users-db.ts` — `getMasteryRow`, `upsertMastery`, `getAllMastery`
- `lib/cards-db.ts` — `attachMasteryAndSort(userId, queue)` 弱字優先
- 頁面：`/study` 顯示 delta；`/me` Top 5 + Needs Work；`/word/[id]` 登入用戶顯示熟練度條

---

## 11. 事件追蹤

```
公開頁 client:
  EventTracker (server-passed wordId/category)
    useEffect → track({type:"view", wordId, category})
  FavoriteButton click → track({type:"favorite"})  (only on add)
  PronunciationButton click → optional track
  StudyClient 答題 → 同時走 /api/study/answer（會寫 study_logs）

lib/analytics.ts: sessionId in localStorage (UUID); navigator.sendBeacon
/api/events (edge): validate type, hash IP, INSERT

/admin/stats: 並發 6 個 aggregate (30d 事件分佈 / top viewed / 分類熱度 /
              最難的字 / 14d 趨勢 / 7d unique sessions)
```

`events` 表處理匿名公開行為；`study_logs` 處理登入後的學習快照。兩者目的不同、互不重疊。

---

## 12. 部署（Vercel）

### `package.json` scripts

```
dev           next dev
build         next build
vercel-build  tsx scripts/migrate.ts && next build
start         next start
migrate       tsx scripts/migrate.ts
enrich        tsx scripts/enrich.ts                # 撈 etymology IS NULL → AI
translate     tsx scripts/translate.ts             # 缺少語系翻譯
translate:list / translate:apply                   # 人工翻譯 round-trip
upload:images / upload:local-images                # 圖檔批次上傳
```

### Build 流程

```
Vercel 偵測 Next.js → npm run vercel-build
  ↓
tsx scripts/migrate.ts        # DDL idempotent + seed + cards generator
                              # 用 DATABASE_URL 連 Supabase pooler
  ↓
next build                    # SSG + ISR + Node functions
  ↓ Deploy → READY
```

Fluid Compute 預設 Node 24 / timeout 300 s；無需 edge runtime 即可吃滿 Node API。

### 環境變數（Production）

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # 僅 server；繞 RLS
DATABASE_URL                  # Postgres pooler (6543) → lib/db.ts

# Admin
ADMIN_PASSWORD
ADMIN_SECRET                  # 選填；admin cookie HMAC 簽章金鑰

# AI（admin / scripts only — runtime 不打）
AI_GATEWAY_API_KEY            # Vercel AI Gateway
ENRICH_MODEL                  # 選填；預設 anthropic/claude-sonnet-4-6
TRANSLATE_MODEL               # 選填；預設 anthropic/claude-sonnet-4-6
```

> Google OAuth 的 client_id / secret 設在 **Supabase Dashboard**，不是專案環境變數。

### `next.config.js` 圖片白名單

僅 Supabase Storage host（從 `NEXT_PUBLIC_SUPABASE_URL` 推導）。所有外部 host 已移除 — admin 不小心貼外部 URL 會直接被 `next/image` 拒絕。

---

## 13. 外部整合

### 圖片儲存（自家託管，runtime 無外部依賴）

所有產品圖片都在 Supabase Storage 的 `word-images` public bucket。

```
admin 上傳 1：file picker
  WordForm <input type="file"> → /api/admin/upload (multipart)
    驗 MIME (jpeg|png|webp|gif)、≤ 5 MB、id kebab-case
    supabase.storage.from('word-images').upload({id}.{ext}, ..., upsert)
    return public URL  → 寫入 image_url

admin 上傳 2：URL 抓取（家用 IP 被限流時用）
  /api/admin/fetch-image  POST { id, sourceUrl }
    server fetch（Vercel 出口 IP 不同 bucket）→ 同樣寫 Storage
    更新 image_url + image_source_url + image_license

backfill scripts：
  upload-local-images.ts   public/word-images/*.png → bucket（本地圖）
  upload-images.ts         外連一次性遷移（idempotent）
  fetch-wiki-images.mjs    legacy
```

### Google OAuth（透過 Supabase）

整套 OAuth 由 Supabase 的 GoTrue 處理，不是 DIY。設定點：
- **Supabase Dashboard → Authentication → Providers → Google** 貼 Client ID/Secret
- **Google Cloud Console** 把 `https://<project>.supabase.co/auth/v1/callback` 加入授權 redirect
- 前端 `redirectTo` 必須是專案網域，且加進 **Supabase → URL Configuration → Redirect URLs** 白名單
- `/auth/callback` 自己會驗證 `next` 是同源路徑（`lib/safe-redirect.ts`）

### AI Gateway（admin / scripts only）

所有 AI 呼叫透過 Vercel AI Gateway（`ai` SDK v6 + 字串 `"creator/model"` 路由），預設 `anthropic/claude-sonnet-4-6`。Runtime 公開頁面不會打 AI。三個入口：

```
/api/admin/words/[id]/enrich   單字頁「AI 補齊」鈕
npm run enrich                 批次：撈 etymology IS NULL 的字補完
npm run translate              批次：缺少語系的 word_definitions / category_translations
```

僅需 `AI_GATEWAY_API_KEY`，不必各別接 provider package。

---

## 14. 路徑慣例 / 常見陷阱

- **Server-only 模組**用 `import "server-only"` 標註（`lib/words-db.ts`, `lib/users-db.ts`, `lib/current-user.ts`），誤匯入 client 端會 build error。
- **Edge routes**（middleware、登入登出、events）不能用 `cookies()` from `next/headers`，要從 `req.cookies` 讀。
- **`unstable_cache` tag**：admin 寫完叫 `revalidateTag("words")`，ISR 自動失效。
- **Supabase pooler (transaction mode)** 不支援跨 statement 的 prepared statement，所以 `lib/db.ts` 用 `prepare:false`；migrate 也沒包 BEGIN/COMMIT，每個 statement 獨立 idempotent。
- **連線池 `max=15`** 是踩過 504 後調出來的。`/api/study/queue` peak 內並發約 7，max=5 兩人同時跑就 deadlock。
- **`lib/db.ts` 直連繞過 RLS**：所有 user-scoped 查詢都必須**顯式**帶 `WHERE user_id = ${userId}` — 這是真正的防線，RLS 只在 supabase-js 路徑生效。
- **`DISTINCT` + `ORDER BY random()`** 在 PG 違法。乾擾項那邊改成過量抽 + JS dedupe（且現在改走 `lib/distractors.ts` 評分）。
- **`vercel env pull` 拉不到 Marketplace 注入的 Sensitive 值**（DATABASE_URL 等顯示空字串）— 只能在 build/runtime 取得。本地開發若要 DB 連線，得從 Vercel dashboard 手動拷貝。
- **deck_key 只剩 `image-en`**。任何引用 `recall-zh-en` / `recall-en-zh` / `cloze-1` 的舊程式都已下架；migrate 對舊資料無破壞，但乾擾項池會空 — 一定要走 image-en 才有 4 選 1 可挑。
- **zh-Hans 不存進 DB**。`word_definitions` / `category_translations` 只填 zh-Hant / ja 等；簡體由 `lib/opencc.ts` 在 read 時即時轉。
- **熱路徑避免 `supabase.auth.getUser()` 連打**。`/api/study/queue` / `/answer` 已改成「驗一次拿 userId，往下傳」。新寫類似熱路 API 時遵循同模式。
- **新學三步不寫 SRS**：只有 Step 1 寫；Step 2/3 是純練習。改 StudyClient 時別不小心把 `/api/study/answer` 串到 Step 2/3 — mastery 會被刷飛。
