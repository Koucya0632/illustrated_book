# Tuji Web Security Notes

更新日期：2026-07-01

## 1. 當前安全邊界

- Supabase service role 只允許 server side 使用。
- iOS 使用 Bearer access token。
- Web 使用 cookie session。
- user-scoped API 不相信 client 傳入的 user id。
- 使用者 API 與 study API 強制 `private, no-store`。

## 2. 必查項

| 範圍 | 檢查 |
|---|---|
| Auth | 每個 user route 都驗證 user |
| Ownership | favorites/learned/progress/atlas item 只能操作自己的資料 |
| Admin | admin route 與一般使用者分離 |
| Cache | 使用者資料不 public cache |
| Upload | 限制 type/size，避免任意檔案 |
| AI | quota/rate limit/cost guard |
| Logs | 不輸出 token、email、圖片 URL、自由輸入全文 |

## 3. Atlas/UGC

Atlas 是主要審核與安全風險：

- 使用者圖片可能包含個資。
- 公開圖鑑屬於 UGC。
- AI 輸出可能不準或不適合。

需要：

- 使用者刪除自己的內容。
- Admin 下架公開內容。
- 使用者端檢舉入口。
- AI 結果確認/校正。

## 4. 待補

- 更集中化的 rate limit。
- Atlas image hash 去重。
- idempotency key。
- Admin 操作 audit log。
- 自動化 API contract/security tests。
