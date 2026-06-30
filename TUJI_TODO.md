# Tuji Web TODO

更新日期：2026-07-01

## P0

- [ ] 確認所有新增 user/study API 都套 `private, no-store`。
- [ ] Atlas 公開內容補使用者端檢舉入口。
- [ ] Atlas AI 加 quota/rate limit/idempotency。
- [ ] 確認刪除帳號 cascade 與 iOS 流程。
- [ ] 準備 App Review 測試帳號與 UGC moderation 說明。

## P1

- [ ] 做 iOS bootstrap bundle endpoint，減少冷啟動多 API 集中請求。
- [ ] Study answer/progress stats 減少重複刷新。
- [ ] Catalog/Search response shape 加 contract 測試。
- [ ] Admin report 狀態標準化。
- [ ] 公共 Atlas 頁補 SEO/分享 metadata。

## P2

- [ ] Pro entitlement/quota API。
- [ ] StoreKit server verification 配套。
- [ ] 更多詞庫導入 tooling。
- [ ] AI enrich pipeline 成本觀測。
- [ ] Dashboard 化 API latency/error。

## 不做或暫緩

- Web 外部付款。
- 宣稱 Universal Links 完成。
- 沒有 moderation 的公開 UGC。
- 把 iOS 專用流程做成 WebView 包殼。
