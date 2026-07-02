# Tuji Web

更新日期：2026-07-01

`tuji-web` 是 Tuji 的 Next.js 後端與 Web 管理/公開頁。iOS App 是主要產品面，Web 主要提供 API、資料管理、公開分享與後台。

## 1. 技術

- Next.js 14.2
- React 18
- Supabase Auth/Postgres/Storage
- Vercel
- Tailwind
- Vercel AI SDK / OpenAI gateway

## 2. 常用命令

```bash
npm install
npm run dev
npm run build
npm run vercel-build
npm run migrate
npm run verify:atlas
```

## 3. 主要路徑

| 路徑 | 用途 |
|---|---|
| `app/api` | iOS/Web API |
| `app/admin` | 管理後台 |
| `app/atlas` | Atlas Web/公開頁 |
| `app/word`, `app/category`, `app/search` | 公開詞庫頁 |
| `lib` | DB/domain/cache/auth |
| `scripts` | migration/seed/enrich |

## 4. iOS 合約

iOS 透過 Repository 層依賴這些 API：

- Catalog
- User
- Progress
- Study
- Atlas

改 response shape 時要同步 iOS model 與文檔。

## 5. Cache

- 公共：`/api/words`、`/api/words/:id`、`/api/categories`。
- 私有：`/api/users/*`、`/api/study/*`、`/api/events`。

不要讓使用者資料進 CDN/shared cache。

## 6. 安全

- service role 只能在 server side。
- user-scoped API 必須驗證 token/cookie。
- Atlas/UGC 公開能力必須有管理與下架路徑。
- AI 功能必須有成本限制。
