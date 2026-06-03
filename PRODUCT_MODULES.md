# Tuji — 產品功能模塊地圖（0 → 1）

> 把整個 App 拆解成完整功能模塊，從一級模塊往下展開到二級子功能。每項都標明：
> - **MVP**：上線/可用前必須做。
> - **P1**：MVP 後第一輪迭代要做，影響留存與口碑。
> - **P2**：等規模/資源到位再做，不影響核心體驗。
>
> 已實作的項目用 ✅ 標示；視覺/原型已有但尚未真實上線用 🚧；尚未開始用 ⬜。

---

## 1. 用戶系統 Account & Identity

負責人是誰、怎麼進來、怎麼出去、怎麼刪除。所有 per-user 資料的根。

- **1.1 註冊 / 登入**
  - 1.1.1 Email + 密碼註冊  ✅ MVP
  - 1.1.2 Email + 密碼登入  ✅ MVP
  - 1.1.3 Google OAuth 登入  ✅ MVP
  - 1.1.4 登出  ✅ MVP
  - 1.1.5 找回密碼 / 重設密碼  ⬜ P1
  - 1.1.6 Email 驗證信  ⬜ P1
  - 1.1.7 其他 OAuth（Apple / Facebook / LINE）  ⬜ P2
  - 1.1.8 Magic Link / 一次性碼登入  ⬜ P2

- **1.2 帳號資料**
  - 1.2.1 `@username` handle（唯讀）  ✅ MVP
  - 1.2.2 顯示名稱 `nickname` 編輯  ✅ MVP
  - 1.2.3 頭像（吉祥物 6 姿勢任選）  ✅ MVP
  - 1.2.4 個人簡介 / bio  ⬜ P2
  - 1.2.5 自訂頭像上傳  ⬜ P2

- **1.3 帳號生命週期**
  - 1.3.1 永久刪除帳號（CASCADE 清空，二次確認）  ✅ MVP
  - 1.3.2 匿名訪客模式（無帳號用 localStorage）  ✅ MVP
  - 1.3.3 訪客→帳號的進度搬遷  ✅ MVP（hydrate-on-login）
  - 1.3.4 凍結 / 停用帳號（非刪除）  ⬜ P2

- **1.4 安全 / 隱私**
  - 1.4.1 密碼雜湊（Supabase Auth）  ✅ MVP
  - 1.4.2 Session cookie + middleware 保護  ✅ MVP
  - 1.4.3 修改密碼  ⬜ P1
  - 1.4.4 啟用 2FA / TOTP  ⬜ P2
  - 1.4.5 登入裝置列表 / 強制登出  ⬜ P2

---

## 2. 內容系統 Vocabulary Content（圖鑑核心）

App 的內容資產：單字 + 圖 + 分類 + 例句。沒有這層就什麼都沒有。

- **2.1 單字資料模型**
  - 2.1.1 v2 Word schema（id / word / chinese / pos / pron / imageUrl / examples / collocations / related / confusing / forms / etymology / note）  ✅ MVP
  - 2.1.2 多義字標記與關鍵特徵描述  ✅ MVP
  - 2.1.3 多語系釋義（zh-Hant / zh-CN / ja）  🚧 MVP（部分翻譯）
  - 2.1.4 CEFR 等級欄位  ✅ MVP
  - 2.1.5 詞性變化 forms（複數 / 過去式 / 形容詞變化）  ✅ MVP
  - 2.1.6 詞源 etymology  ✅ MVP

- **2.2 圖片管理**
  - 2.2.1 本地生圖（AI prompt 規範，§9）  ✅ MVP
  - 2.2.2 Supabase Storage 託管 + 公開 CDN URL  ✅ MVP
  - 2.2.3 `upload-local-images.ts` 批次回填腳本  ✅ MVP
  - 2.2.4 `image_source_url` / `image_license` 出處紀錄  ✅ MVP
  - 2.2.5 圖片版本管理 / 更新通知  ⬜ P2
  - 2.2.6 多解析度 / WebP 自動轉檔  ⬜ P2

- **2.3 單字庫瀏覽**
  - 2.3.1 `/cards` 全部單字格狀瀏覽  ✅ MVP
  - 2.3.2 分類晶片篩選（9 大主題）  ✅ MVP
  - 2.3.3 漸進式分頁（PAGE_SIZE=60，「顯示更多」）  ✅ MVP
  - 2.3.4 卡片上顯示熟練度徽章  🚧 P1
  - 2.3.5 排序（新／舊／A–Z／熟練度）  🚧 P1（收藏頁已有）
  - 2.3.6 進階篩選（CEFR / 詞性 / 已學/未學）  ⬜ P1

- **2.4 單字詳情頁** `/word/[id]`
  - 2.4.1 大圖、KK 音標、詞性、中文釋義  ✅ MVP
  - 2.4.2 例句（關鍵字 highlight）  ✅ MVP
  - 2.4.3 搭配詞 collocations  ✅ MVP
  - 2.4.4 同主題單字  ✅ MVP
  - 2.4.5 關聯詞 / 易混淆詞  ✅ MVP
  - 2.4.6 熟練度環  ✅ MVP
  - 2.4.7 詞形變化 / 詞源  ✅ MVP
  - 2.4.8 記憶撇步 note  ✅ MVP
  - 2.4.9 「看完整單字頁」浮層 `WordPeekModal`  ✅ MVP

- **2.5 分類**
  - 2.5.1 `/category/[id]` 主題頁  ✅ MVP
  - 2.5.2 9 大分類定義（廚房／浴室／臥室／客廳／辦公室／街上／超市／交通／調味料）  ✅ MVP
  - 2.5.3 使用者自訂分類 / 牌組  ⬜ P2

- **2.6 搜尋** `/search`
  - 2.6.1 中／英互查  ✅ MVP
  - 2.6.2 即時下拉建議  ✅ MVP
  - 2.6.3 空狀態 → 主題瀏覽 fallback  ✅ MVP
  - 2.6.4 模糊搜尋 / 容錯  ⬜ P1
  - 2.6.5 搜尋歷史記錄  ⬜ P2

---

## 3. 學習系統 Study / SRS

把「看」變成「會」。所有真正的學習機制都在這。

- **3.1 SRS 排程**
  - 3.1.1 間隔複習演算法（mastery decay + 評分推進）  ✅ MVP
  - 3.1.2 `user_words` mastery 落地  ✅ MVP
  - 3.1.3 `user_cards` per-deck 排程  ✅ MVP
  - 3.1.4 自訂演算法參數（強迫間隔等）  ⬜ P2

- **3.2 卡片類型**
  - 3.2.1 中→英 看中文選英文  ✅ MVP
  - 3.2.2 英→中 看圖選中文  ✅ MVP
  - 3.2.3 拼字 type-in  ✅ MVP
  - 3.2.4 聽寫 dictation（TTS）  ⬜ P1
  - 3.2.5 句子填空 cloze  ⬜ P1
  - 3.2.6 配對遊戲 matching  ⬜ P2

- **3.3 答題流程**
  - 3.3.1 從 queue 抽下一題（`/api/study/queue`）  ✅ MVP
  - 3.3.2 自評四階（重來／困難／穩定／熟練）  ✅ MVP
  - 3.3.3 答錯改自評（不自動「重來」）  ✅ MVP
  - 3.3.4 答後彈窗看單字 `WordPeekModal`  ✅ MVP
  - 3.3.5 干擾項生成（`lib/distractors.ts`）  ✅ MVP
  - 3.3.6 SRS 「💡 提示」鈕  ⬜ P1

- **3.4 學習設定**
  - 3.4.1 每日目標題數  ✅ MVP
  - 3.4.2 學習卡片類型 multi-select  ✅ MVP
  - 3.4.3 學習主題限制  ✅ MVP
  - 3.4.4 Today 篩選晶片（全部／弱字／新字）  ⬜ P1

- **3.5 效能/可靠**
  - 3.5.1 `/api/study/answer` 併發化（3 寫入 Promise.all）  ✅ MVP
  - 3.5.2 進入下一題加速（450ms 預算 + 重疊）  ✅ MVP
  - 3.5.3 失敗保留原卡 + 錯誤提示  ✅ MVP
  - 3.5.4 離線排隊 / 之後同步  ⬜ P2

---

## 4. 進度與儀表板 Progress

讓使用者「看見自己變強」。連勝、熱力圖、目標。

- **4.1 今天頁** `/`
  - 4.1.1 連勝顯示 streak  ✅ MVP
  - 4.1.2 已學單字數  ✅ MVP
  - 4.1.3 每日 5 字（`pickDailyFrom`）  ✅ MVP
  - 4.1.4 主題入口  ✅ MVP
  - 4.1.5 今日任務進度條 + 達標旗  ✅ MVP

- **4.2 Dashboard** `/progress`
  - 4.2.1 圖鑑完成度  ✅ MVP
  - 4.2.2 連勝（current / longest）  ✅ MVP
  - 4.2.3 收藏 / 已學數  ✅ MVP
  - 4.2.4 各主題進度  ✅ MVP
  - 4.2.5 清除進度（保留收藏）  ✅ MVP
  - 4.2.6 6 週活動熱力圖（Asia/Taipei）  ✅ MVP
  - 4.2.7 最近活動時間軸  ❌（已決定不做）
  - 4.2.8 連勝起始日字串  ⬜ P2

- **4.3 個人頁** `/me`
  - 4.3.1 Profile hero（暱稱 / 頭像 / 加入日 / 完成度條）  ✅ MVP
  - 4.3.2 連勝 + 已學數 chips  ✅ MVP
  - 4.3.3 Top 5 最熟單字  ✅ MVP
  - 4.3.4 Needs work 弱字  ✅ MVP
  - 4.3.5 我的收藏入口（→ /favorites）  ✅ MVP
  - 4.3.6 設定入口  ✅ MVP

- **4.4 學習統計 API**
  - 4.4.1 `/api/study/stats`  ✅ MVP
  - 4.4.2 全站學習曲線 / 流失分析  ⬜ P2（產品 owner 用）

---

## 5. 收藏 Favorites

- **5.1 收藏動作**
  - 5.1.1 卡片上心型按鈕  ✅ MVP
  - 5.1.2 即時樂觀更新 + 同步 `/api/users/favorites`  ✅ MVP
  - 5.1.3 訪客 localStorage  ✅ MVP

- **5.2 收藏頁** `/favorites`
  - 5.2.1 全部收藏單字格狀瀏覽  ✅ MVP
  - 5.2.2 分類晶片篩選  ✅ MVP
  - 5.2.3 排序（新 / 舊 / A–Z）  ✅ MVP
  - 5.2.4 空狀態 → 去單字庫瀏覽  ✅ MVP

- **5.3 收藏入口**（不在 sidebar，刻意維持入口少而精準）
  - 5.3.1 `/me` 一行小連結  ✅ MVP
  - 5.3.2 `/cards` header 文字連結  ✅ MVP

---

## 6. 個人化設定 Settings

「我」的偏好統一管理。`user_settings` + `SettingsProvider`，草稿+保存模式。

- **6.1 學習偏好**
  - 6.1.1 每日目標題數  ✅ MVP
  - 6.1.2 學習主題  ✅ MVP
  - 6.1.3 學習卡片類型  ✅ MVP

- **6.2 顯示**
  - 6.2.1 介面語言（zh-TW / zh-CN / ja）  ✅ MVP
  - 6.2.2 字級（zoom）  ✅ MVP
  - 6.2.3 顯示中文翻譯 toggle  ✅ MVP
  - 6.2.4 深色模式  ⬜ P1
  - 6.2.5 高對比 / 無障礙模式  ⬜ P2

- **6.3 發音**
  - 6.3.1 美音 / 英音口音選擇  ✅ MVP
  - 6.3.2 語速調整  ⬜ P1
  - 6.3.3 TTS 引擎選擇 / 自訂 voice  ⬜ P2

- **6.4 帳號**
  - 6.4.1 編輯暱稱 + 頭像  ✅ MVP
  - 6.4.2 刪除帳號  ✅ MVP
  - 6.4.3 修改密碼  ⬜ P1

- **6.5 資料**
  - 6.5.1 清除快取 / localStorage  ✅ MVP
  - 6.5.2 清除學習進度  ✅ MVP
  - 6.5.3 匯出個人單字 CSV  ⬜ P1
  - 6.5.4 匯出 Anki `.apkg`  ⬜ P2

---

## 7. 內容後台 Admin

只有管理員看得到。新增/編輯/補圖/補資料的所有工作流。

- **7.1 進入**
  - 7.1.1 `/login` 後台登入 + `eepd_admin` cookie  ✅ MVP
  - 7.1.2 Middleware gating  ✅ MVP
  - 7.1.3 多管理員角色 / 權限分級  ⬜ P2

- **7.2 單字管理**
  - 7.2.1 單字列表 + 搜尋（`/admin/words`）  ✅ MVP
  - 7.2.2 新增 / 編輯 / 刪除  ✅ MVP
  - 7.2.3 表單欄位驗證 `lib/word-validate.ts`  ✅ MVP
  - 7.2.4 圖片上傳 `/api/admin/upload`  ✅ MVP
  - 7.2.5 從 URL fetch 圖片 `/api/admin/fetch-image`  ✅ MVP
  - 7.2.6 批次 import CSV  ⬜ P1
  - 7.2.7 批次匯出 CSV  ✅ MVP

- **7.3 AI 內容豐富化**
  - 7.3.1 單字頁「AI 生成補齊」鈕（`/api/admin/words/[id]/enrich`）  ✅ MVP
  - 7.3.2 批次補齊 `npm run enrich`（撈 etymology IS NULL）  ✅ MVP
  - 7.3.3 自動觸發（新增單字後跑 enrich）  ⬜ P1
  - 7.3.4 多模型 fallback / 評分  ⬜ P2

- **7.4 站務監控**
  - 7.4.1 統計儀表板 `/admin/stats`（事件量 / Top 單字 / 最難的字）  ✅ MVP
  - 7.4.2 使用者列表 / 個別行為查詢  ⬜ P2
  - 7.4.3 異常告警  ⬜ P2

---

## 8. AI 內容生成管線 Content Pipeline

把「我們有 105 字」變成「我們有 2000+ 字」的工程線。

- **8.1 單字生圖**
  - 8.1.1 通用名詞 prompt 模板  ✅ MVP
  - 8.1.2 多義字必填關鍵特徵表  ✅ MVP
  - 8.1.3 動詞 / 形容詞吉祥物 prompt  ✅ MVP
  - 8.1.4 自動生圖排程（cron / queue）  ⬜ P1
  - 8.1.5 圖品質 QA（auto-reject 模糊 / 文字 / 多義）  ⬜ P2

- **8.2 單字 AI 文本**（`lib/enrich.ts`）
  - 8.2.1 同義／反義／相關詞生成  ✅ MVP
  - 8.2.2 詞形變化 forms  ✅ MVP
  - 8.2.3 記憶撇步 note  ✅ MVP
  - 8.2.4 詞源 etymology  ✅ MVP
  - 8.2.5 例句多樣化  ⬜ P1
  - 8.2.6 多語系釋義 auto-translate  ⬜ P1

- **8.3 工具腳本**
  - 8.3.1 `migrate.ts`：seed → DB  ✅ MVP
  - 8.3.2 `enrich.ts`：AI 補齊  ✅ MVP
  - 8.3.3 `translate.ts` / `translate-list.ts` / `translate-apply.ts`  ✅ MVP
  - 8.3.4 `fetch-wiki-images.mjs`（legacy）  ✅
  - 8.3.5 `upload-images.ts`（外連 → Supabase）  ✅
  - 8.3.6 `upload-local-images.ts`（本地 → Supabase）  ✅ MVP

---

## 9. 國際化 i18n

- **9.1 介面字串**
  - 9.1.1 字典 `lib/i18n.ts`（zh-TW / zh-CN / ja）  ✅ MVP
  - 9.1.2 `useT` hook  ✅ MVP
  - 9.1.3 `<html lang>` + 字級 zoom  ✅ MVP
  - 9.1.4 已翻譯：sidebar / 首頁 / settings / study / word / cards / progress / me / favorites  ✅ MVP
  - 9.1.5 待翻譯：search / auth / not-found / metadata title  🚧 P1
  - 9.1.6 英文介面（給海外使用者反向學中文）  ⬜ P2

- **9.2 內容多語**
  - 9.2.1 zh-Hant 釋義  ✅ MVP
  - 9.2.2 zh-CN（OpenCC 簡繁轉）  ✅ MVP
  - 9.2.3 日文釋義  🚧 P1
  - 9.2.4 其他語系（韓 / 越 / 印尼）  ⬜ P2

---

## 10. 系統基礎 Platform / Infra

看不見但所有東西都靠它。

- **10.1 部署**
  - 10.1.1 Vercel Fluid Compute  ✅ MVP
  - 10.1.2 Preview deploy per PR  ✅ MVP
  - 10.1.3 自動 promote production  ✅ MVP
  - 10.1.4 Rolling release / canary  ⬜ P2

- **10.2 資料庫**
  - 10.2.1 Neon Postgres  ✅ MVP
  - 10.2.2 Connection pool（postgres.js, max=5）  ✅ MVP
  - 10.2.3 Cron partition manager `/api/cron/partman`  ✅ MVP
  - 10.2.4 自動備份 / PITR  ⬜ P1（取決於 Neon plan）

- **10.3 快取**
  - 10.3.1 `unstable_cache` 公開讀取（tag `words`, 60s）  ✅ MVP
  - 10.3.2 寫入時 `revalidateTag`  ✅ MVP
  - 10.3.3 Vercel Edge Cache 命中率調優  ⬜ P1

- **10.4 儲存**
  - 10.4.1 Supabase Storage 圖片 bucket  ✅ MVP
  - 10.4.2 公開 URL + cacheControl 1y  ✅ MVP
  - 10.4.3 多區域 / CDN 拷貝  ⬜ P2

- **10.5 事件 / 分析**
  - 10.5.1 自家 `events` 表 + `/api/events`  ✅ MVP
  - 10.5.2 study_logs 全紀錄  ✅ MVP
  - 10.5.3 Vercel Analytics / Web Vitals  ⬜ P1
  - 10.5.4 第三方分析（GA / PostHog）  ⬜ P2

- **10.6 安全**
  - 10.6.1 Middleware auth gate  ✅ MVP
  - 10.6.2 service-role key 僅後端  ✅ MVP
  - 10.6.3 CSP / 安全 headers  🚧 P1（見 `SECURITY_FIXES.md`）
  - 10.6.4 Rate limit / Bot 防護  ⬜ P1
  - 10.6.5 Vercel BotID / Firewall WAF  ⬜ P2

---

## 11. 通知 / Re-engagement

讓使用者「想起來回來學」。目前完全沒做。

- **11.1 Email** ⬜ P1
  - 11.1.1 連勝快斷提醒
  - 11.1.2 每週進度週報
  - 11.1.3 新單字上架通知
- **11.2 Web Push** ⬜ P2
- **11.3 Mobile push（PWA）** ⬜ P2
- **11.4 In-app inbox** ⬜ P2

---

## 12. 遊戲化 Gamification（已決定暫不做）

原型有過，目前刻意精簡。日後若要做：

- 12.1 XP / Level 系統  ⬜ Later
- 12.2 勳章 / 成就（24 個成就定義 + 判定引擎 + `user_achievements`）  ⬜ Later
- 12.3 連勝起始日字串（「🔥 自 5/11 起」）  ⬜ Later
- 12.4 排行榜 / 朋友比較  ⬜ Later
- 12.5 Tuji 吉祥物個性 / 出現頻率調整  ⬜ Later

---

## 13. 進階學習功能（候選 Roadmap）

把「圖鑑」升級成「真的能學會」。

- **13.1 牌組 / 個人化** ⬜ P1
  - 13.1.1 自訂牌組（從圖鑑挑單字組成）
  - 13.1.2 公開牌組 / 訂閱他人牌組
- **13.2 聽力** ⬜ P1
  - 13.2.1 聽寫題型（接 SRS）
  - 13.2.2 句子聽辨
- **13.3 口說** ⬜ P2
  - 13.3.1 跟讀（Web Speech recognition）
  - 13.3.2 評分（音素比對）
- **13.4 對話練習** ⬜ P2
  - 13.4.1 AI 對話夥伴（情境腳本）
- **13.5 PWA / 離線** ⬜ P1
  - 13.5.1 Service Worker + 離線 cache
  - 13.5.2 安裝到桌面

---

## 14. 商業化 Monetization（如要做）

目前 100% 免費。若決定走商業：

- 14.1 訂閱制（每日題數無上限 / 進階題型 / 進階分析）  ⬜ Later
- 14.2 Stripe / RevenueCat 整合  ⬜ Later
- 14.3 一次性買斷（特定主題包）  ⬜ Later
- 14.4 教師方案 / 課堂模式  ⬜ Later

---

## 摘要矩陣

| 一級模塊 | MVP 狀態 | P1 / P2 重點 |
| --- | --- | --- |
| 1. 用戶系統 | ✅ 完成 | 找回密碼、Email 驗證、改密碼 |
| 2. 內容系統 | ✅ 完成 | 卡片熟練度徽章、進階篩選、模糊搜尋 |
| 3. 學習系統 | ✅ 完成 | 聽寫、cloze、提示鈕、Today 篩選 |
| 4. 進度儀表板 | ✅ 完成 | 連勝起始日（小） |
| 5. 收藏 | ✅ 完成 | — |
| 6. 設定 | ✅ 完成 | 深色模式、改密碼、CSV / Anki 匯出 |
| 7. 後台 | ✅ 完成 | 批次 import、自動 enrich |
| 8. 內容生成管線 | ✅ 完成 | 自動排程生圖、例句多樣化、auto-translate |
| 9. i18n | 🚧 大致完成 | search / auth / metadata 補齊、日文釋義 |
| 10. 平台基礎 | ✅ 完成 | CSP / 安全 headers、rate limit、analytics |
| 11. 通知 | ⬜ 未做 | Email 提醒（P1） |
| 12. 遊戲化 | 不做 | — |
| 13. 進階學習 | ⬜ 未做 | 自訂牌組、聽寫、PWA |
| 14. 商業化 | ⬜ 未做 | 看商業決定 |
