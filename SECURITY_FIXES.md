# 登入板塊安全修復紀錄

> 日期：2026-05-25
> 範圍：使用者登入 / 註冊（Supabase Auth）+ 後台 admin 登入

---

## 1. 已修

### 1.1 Open redirect — `/signin`、`/register`、`/login`（🔴 高）

**問題**
三個表單頁的 `next` 參數從 URL `searchParams.next` 直接傳給表單，登入成功後執行 `window.location.href = next`。攻擊者可發送 `/signin?next=https://evil.com/phish`，受害者登入後瀏覽器跳到外部站做釣魚。

**修法**
- 新增 `lib/safe-redirect.ts`，提供 `safeNextPath(next, fallback)`，只允許 `/...` 同源路徑，拒絕 `//`、`/\\`、含協議字串、非字串輸入。
- `app/signin/page.tsx`、`app/register/page.tsx`、`app/login/page.tsx` 都在 server-side 走過 `safeNextPath` 之後才把字串交給 form / `GoogleButton`。

**為什麼放在 page 而不是 form 內**
Server component 比較早接觸 URL 參數；早一層清掉後，下游所有 client 元件（含 `GoogleButton` 傳給 OAuth）拿到的就是安全字串。`/auth/callback/route.ts` 本來就會再驗一次，雙保險。

---

### 1.2 Admin login 強化 — `/api/auth/login`（🟠 中）

**問題**
- 密碼比對 `password !== expected` 不是 constant-time。雖然在 Edge + HTTP 環境下利用難度高，但跟同檔案的 HMAC 比對風格不一致。
- `ADMIN_PASSWORD` 同時當「比對的密碼」與「cookie 簽章 HMAC key」兩用 — 任一外洩會打穿另一個面向；rotate 密碼會把全部 admin session 立刻踢出（運維不便）。

**修法**
- `lib/auth.ts` 抽出 `timingSafeEqual(a, b)`，HMAC 驗證與密碼比對都改用它。
- 引入 `ADMIN_SECRET` 環境變數作為簽章金鑰。沒設時 fallback 用 `ADMIN_PASSWORD`，向後相容、現有部署不破。
- `/api/auth/login` 加上 `password.length > 256` 早期拒絕，避免攻擊者用超長字串拖長 compare 觀察 timing。

**部署 checklist**
- 在 Vercel Dashboard 新增 `ADMIN_SECRET`（任意 32+ char 隨機字串）。
- 設好後，rotate `ADMIN_PASSWORD` 時 admin session 不會被踢；如果連 secret 一起換才會。

---

### 1.3 API 大小上限 — `/api/users/sync`、`/api/users/quiz-results`（🟠 中）

**問題**
- `/api/users/sync` 收 `favorites`/`learned` 陣列，內部用迴圈逐筆 INSERT。沒有上限，登入後可送 `[1000000 個字串]` 把 DB 連線打滿。
- `/api/users/quiz-results` 的 `quizType` 是任意 TEXT、`total`/`correct` 沒有合理性檢查（可為負數、可遠超字典容量）。

**修法**
- `/api/users/sync`：抽出 `cleanIds()`，過濾 non-string，限制單一 id 長度 ≤ 64 字、總數 ≤ 2000 筆。超過直接砍。
- `/api/users/quiz-results`：`quizType` 長度 ≤ 32；`total` 必須是 0–1000 的整數；`correct` 必須是 0..total 的整數。

---

## 2. 文件更新

### `ARCHITECTURE.md`

第 7、12、13、14 節以前還是 Neon + DIY PBKDF2 + DIY Google OAuth 的舊文，跟現況不符。已改寫：

- **§7 Auth & Sessions**：admin section 改寫 HMAC key 來源（`ADMIN_SECRET || ADMIN_PASSWORD`）+ constant-time 比對。
- **§12 部署**：環境變數段改成 Supabase（`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DATABASE_URL`、`ADMIN_PASSWORD`、`ADMIN_SECRET`）；移除 `GOOGLE_CLIENT_ID/SECRET`（這兩個現在設在 Supabase Dashboard）。
- **§13 Google OAuth**：刪掉「DIY、`lib/google-oauth.ts`」整段；改寫成 Supabase GoTrue + Dashboard 設定流程，並說明 `/auth/callback` 與 `lib/safe-redirect.ts` 的 next 驗證。
- **§14 常見陷阱**：把「Neon serverless driver」改成「Supabase pooler (transaction mode) + `prepare:false`」；新增 RLS bypass 注意事項（`DATABASE_URL` 直連繞過 RLS，必須顯式帶 `WHERE user_id = ${userId}`）。

---

## 3. 已知但**沒修**（後續）

| 項目 | 嚴重度 | 為什麼還沒動 |
|---|---|---|
| `/api/auth/login`（admin）無 rate limiting | 🟠 中 | 需要存儲（KV / Upstash）。Supabase 用戶端登入有內建。建議裝 Upstash Ratelimit + 把 admin login 改成 Node runtime 接它。 |
| 註冊密碼最低長度只有 6 | 🟡 低 | Client-side 檢查。較合適的做法是去 **Supabase Dashboard → Authentication → Policies** 把 minimum length 提到 8+ 並啟用 leaked password protection；不是 code 改。 |
| `addLearned` / `addFavorite` 不驗 wordId 格式 | 🟡 低 | FK 保護擋住未知 id，try/catch 吞 FK violation 也算 OK。要更乾淨可加 length cap，但實務影響很小。 |
| RLS 在 `DATABASE_URL` 路徑被繞過 | 🟡 低（文件性質） | 不算 bug — 應用層每個 query 都有 `user_id = ${userId}` filter。已在 §14 加註，新人來碰要記得。 |

---

## 4. 驗證建議

```bash
# Open redirect — 三個都應該 404 / 留在原頁，不會跳到 evil.com
/signin?next=https://evil.com
/register?next=//evil.com
/login?next=javascript:alert(1)

# Admin login — 應該 401，不應該被 timing 區分
curl -X POST /api/auth/login -d '{"password":"a"}'
curl -X POST /api/auth/login -d '{"password":"'"$(python -c 'print("a"*1000)')"'"}'

# Sync size cap — 應該砍到 2000 筆，不會 5xx
curl -X POST /api/users/sync -H 'cookie: sb-...' \
  -d "{\"favorites\":$(python -c 'import json;print(json.dumps(["x"]*5000))')}"

# Quiz validation — 應該 400
curl -X POST /api/users/quiz-results -d '{"quizType":"x","total":-1,"correct":0}'
curl -X POST /api/users/quiz-results -d '{"quizType":"x","total":10,"correct":99}'
```
