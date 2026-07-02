# Tuji Web Architecture

更新日期：2026-07-01

## 1. 定位

`tuji-web` 是 Tuji 的後端與 Web 面：

- Next.js 14 route handlers。
- Vercel 部署。
- Supabase Auth/Postgres/Storage。
- Web 公開頁與管理後台。
- iOS App 的主要 API provider。

iOS 是主產品端；Web 代碼不需要提交給 App Store，但正式 API 必須穩定、可審核、可測。

## 2. 技術棧

| 層 | 技術 |
|---|---|
| Framework | Next.js 14.2 |
| Runtime | Node route handlers on Vercel |
| DB | Supabase Postgres |
| Auth | Supabase Auth + cookie/Bearer |
| Storage | Supabase Storage |
| AI | Vercel AI SDK / OpenAI gateway |
| Styling | Tailwind |

## 3. 主要目錄

| 目錄 | 職責 |
|---|---|
| `app` | Pages 與 API routes |
| `app/api` | iOS/Web 共用 API |
| `app/admin` | 管理後台 |
| `components` | Web UI components |
| `lib` | DB、auth、cache、domain logic |
| `scripts` | migration、seed、enrich、圖片處理 |

## 4. API 分組

| 分組 | 代表 endpoint |
|---|---|
| Catalog | `/api/words`, `/api/words/:id`, `/api/categories`, `/api/search` |
| User | `/api/users/me`, `/api/users/settings`, `/api/users/profile`, `/api/users/delete-account` |
| Progress | `/api/users/progress`, `/api/users/mastery`, `/api/users/top-words`, `/api/users/favorites`, `/api/users/learned` |
| Study | `/api/study/queue`, `/api/study/answer`, `/api/study/stats`, `/api/study/reports` |
| Atlas | `/api/atlas/images`, `/api/atlas/sync`, `/api/atlas/items/*`, `/api/atlas/study/*`, `/api/atlas/public/*` |
| Admin | `/api/admin/*` |
| Infra | `/api/events`, `/api/cron/*`, `/api/test_smoke/whoami` |

## 5. Auth

Web 同時支援：

- Web cookie session。
- iOS Bearer access token。

所有 user-scoped route 必須從 server side 驗證 user，不能相信 client 傳來的 user id。

## 6. Cache

目前 `next.config.js` 集中設 HTTP header：

- Public cache：`/api/words`、`/api/words/:id`、`/api/categories`。
- Private/no-store：`/api/users/:path*`、`/api/study/:path*`、`/api/events`。

新增 endpoint 時必須明確選擇 cache 類型。

## 7. Atlas

Atlas 涉及：

- 使用者圖片。
- AI 識別。
- 自製卡片。
- 公開分享。
- 管理/下架。

風險：

- AI 成本。
- UGC 審核。
- 圖片隱私。
- 重複生成/重複識別。

需要的後端能力：

- upload size/type limit。
- image hash 去重。
- quota/entitlement。
- idempotency。
- report/moderation。

## 8. 與 iOS 的合約

iOS 現在透過 Repository 呼叫 Web API：

- `CatalogRepository`
- `UserRepository`
- `ProgressRepository`
- `StudyRepository`
- `AtlasRepository`

改 API response shape 前，必須同步 iOS model。

## 9. Build

```bash
npm run build
```

Vercel build 會跑：

```bash
npm run vercel-build
```

其中包含 migration script，migration 必須 idempotent。
