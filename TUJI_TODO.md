# Tuji Web TODO

更新日期：2026-08-12

本清單只保留目前仍有價值的工程／營運工作；已完成項目列在後面，避免舊 TODO 被誤認為現況缺口。

## P0：發版與營運阻塞

- [ ] 用正式環境測試帳號驗證刪除帳號的資料 cascade、Storage 清理與 iOS session 清除。
- [ ] 準備每次 App Review 使用的測試帳號；帳號需有可見的公開合集、檢舉與封鎖情境。
- [ ] 在正式開啟前完成 Push entitlement／provisioning 與 Universal Links 的 Associated Domains／AASA。
- [ ] 對訂閱購買、restore purchases、手動 grant、到期與跨帳號 transfer 跑一次端到端回歸。

## P1：可靠性與效率

- [ ] 評估 iOS launch bootstrap bundle，減少冷啟動時集中發出的使用者／學習 API。
- [ ] 減少 Study answer 完成後對 Today、queue、progress、mastery 的重複刷新。
- [ ] 為 Catalog、Search、Study、Entitlement response shape 增加跨 iOS／Web contract 測試。
- [ ] 為公開項目、合集與作者頁補齊 SEO／分享 metadata。
- [ ] 將 API latency、error、AI 用量與 moderation queue 建成可日常使用的 dashboard／告警。
- [ ] 為 account deletion、entitlement transfer 與 collection batch learn 增加資料庫整合測試。

## P2：產品與營運深化

- [ ] 增加 AI enrich pipeline 的供應商、模式、成本與失敗率觀測。
- [ ] 建立更多詞庫導入、驗證與回滾 tooling。
- [ ] 為公開內容探索建立可解釋的排序品質指標，再決定是否加入熱門度訊號。
- [ ] 評估報告／封鎖後的申訴、通知與營運 SLA。

## 已完成的原清單項目

- [x] 使用者、學習、帳務與寫入 API 設為 private／no-store；公開 catalog／物見讀取才允許 CDN cache。
- [x] 公開項目、合集與作者的檢舉入口，以及作者封鎖／解除封鎖 API。
- [x] Atlas AI 的 tier quota、IP／全域 abuse backstop、容量檢查與可重試上傳去重。
- [x] Pro entitlement／quota API、StoreKit server verification 與交易帳號綁定／轉移規則。
- [x] 公開 Atlas 項目、合集、作者頁、收藏、批次加入學習與 moderation pipeline。
- [x] Admin report 狀態／動作，以及會員訂閱與手動 grant 管理。
- [x] Search 的明確語言方向、完整 cache identity，以及日文 reading segments／振假名資料。

## 不做或暫緩

- Web 外部付款。
- 在 Associated Domains／AASA 完成前宣稱 Universal Links 已啟用。
- 沒有 moderation、檢舉與封鎖的公開 UGC。
- 把 iOS 專用流程做成 WebView 包殼。
