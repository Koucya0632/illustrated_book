# Tuji Web PR

## 改了什麼

-

## 類型

- [ ] API route
- [ ] DB/migration
- [ ] Admin
- [ ] Public Web page
- [ ] Atlas
- [ ] Auth/security
- [ ] Cache/performance
- [ ] Docs

## iOS 影響

- [ ] 沒有 iOS 影響
- [ ] 需要更新 iOS `Endpoint`
- [ ] 需要更新 iOS Repository
- [ ] 需要 iOS 與 Web 同時發布

## 安全/快取檢查

- [ ] 使用者資料 endpoint 是 `private, no-store`。
- [ ] 公共 GET 才使用 public/CDN cache。
- [ ] 沒有把 service role key 暴露到 client。
- [ ] Route handler 做了 auth/ownership check。
- [ ] Atlas/UGC 公開資料有 moderation/刪除路徑。
- [ ] 新 AI 功能有成本限制。

## 驗證

```bash
npm run build
```

- [ ] 本機或 staging 測過 API。
- [ ] 若改 cache，檢查 response headers。
- [ ] 若改 DB，migration 可重跑。

## 備註

-
