# Tuji Web Product Modules

更新日期：2026-07-01

## 1. 模組總覽

| 模組 | Web 角色 | iOS 依賴 |
|---|---|---|
| Catalog | 詞庫、分類、搜尋、單字頁 | 高 |
| Study | queue、answer、stats、reports | 高 |
| Progress | progress、mastery、top words | 高 |
| User | settings、profile、delete account、sync | 高 |
| Atlas | 自製圖鑑、AI、公開分享 | 高 |
| Admin | 內容與 UGC 管理 | 中 |
| Auth | Web cookie + iOS bearer 支援 | 高 |
| Events | 輕量埋點 | 中 |

## 2. Catalog

Endpoint：

- `/api/words`
- `/api/words/:id`
- `/api/categories`
- `/api/search`
- `/api/users/custom-words`

iOS 對應：

- `CatalogRepository`
- `WordsStore`
- `CategoriesStore`
- Search/Word/Cards/Category views

規則：

- 公共詞庫可 public cache。
- 自製詞與使用者資料不可 public cache。

## 3. Study

Endpoint：

- `/api/study/queue`
- `/api/study/answer`
- `/api/study/stats`
- `/api/study/reports`
- `/api/atlas/study/queue`
- `/api/atlas/study/answer`

iOS 對應：

- `StudyRepository`
- `StudyQueueStore`
- `StudyStatsStore`
- `StudyWriteDrain`
- New/Review coordinators

規則：

- answer 必須驗證 card ownership/visibility。
- report/log failure 不應破壞核心答題。
- stats/progress 更新要避免過度重打。

## 4. Progress

Endpoint：

- `/api/users/progress`
- `/api/users/mastery`
- `/api/users/top-words`
- `/api/users/favorites`
- `/api/users/learned`
- `/api/users/sync`

iOS 對應：

- `ProgressRepository`
- `ProgressStore`
- `MasteryStore`
- `LocalCache`

規則：

- iOS 可以 optimistic update 收藏/已學。
- 後端仍是最終權威。

## 5. User

Endpoint：

- `/api/users/me`
- `/api/users/settings`
- `/api/users/profile`
- `/api/users/delete-account`
- `/api/users/push-token`

iOS 對應：

- `UserRepository`
- `LiveProfileModule` / `AuthorProfileModule`
- `AuthService`
- `SettingsStore`
- Settings/Me/Onboarding

審核注意：

- `/api/users/profile` 是暱稱、簽名與頭像的唯一編輯入口；公開作者資料由同一投影產生。
- 刪除帳號必須可用。
- Push token endpoint 不等於 Push 已可上架，iOS entitlement/profile 也要完整。

## 6. Atlas

Endpoint：

- `/api/atlas/images`
- `/api/atlas/images/:id`
- `/api/atlas/images/:id/recognize`
- `/api/atlas/images/:id/confirm`
- `/api/atlas/items/:id/cards`
- `/api/atlas/items/:id/detail`
- `/api/atlas/items/:id/enrich`
- `/api/atlas/sync`
- `/api/atlas/public/*`

iOS 對應：

- `AtlasRepository`
- `AtlasStore`
- `AtlasCaptureQueue`
- Atlas feature views

待補：

- quota/entitlement。
- idempotency。
- 使用者端檢舉入口。

## 7. Admin

Admin 是內部工具，不是一般產品頁。

必須保證：

- 不能被一般使用者誤入。
- 管理 API 有權限檢查。
- Atlas 公開內容可被下架。

## 8. Events

`/api/events` 用於輕量產品事件。它是 private/no-store。

不要記：

- token
- email
- 圖片 URL
- 自由輸入全文
- 未脫敏錯誤 payload
