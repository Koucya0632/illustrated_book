# Tuji UI/UX 改版 — 功能對應與待辦

把 `Tuji · Direction B` 互動原型套到現有 App。本檔記錄：哪些畫面已接上真實功能、哪些只是視覺（尚未串接資料），供後續討論。

最後更新：2026-05-28（第二輪：剩餘舊頁面已全部改成 Tuji）

---

## 1. 設計系統 / 共用元件（已完成）

- `tailwind.config.ts`：Tuji 色票（teal `#006F72`、cream `#FFFCF5`、yellow `#FFD24A`、coral `#FF6F4D`、ink `#0F1A1A`…）、`shadow-card/cardHover/soft`、字體變數。舊色票（`sky`/`mint`/`cream`/`ink`/`muted`）暫時保留，給尚未改版的頁面用。
- 字體：`Plus Jakarta Sans` + `Noto Sans TC` + `JetBrains Mono`（`next/font`，在 `app/layout.tsx`）。
- `components/tuji/Mascot.tsx`：黑貓吉祥物 SVG（poses：face / peek / wave / cheer / sleep / think）。
- `components/tuji/Shell.tsx`：全站外框 — 桌面深色左側欄（今天 / 單字庫 / 玩法 / 進度 / 我 + 帳號卡），手機底部 Tab Bar + 頂部 Header。已取代舊 `Navbar`。
- `components/tuji/ui.tsx`：`StreakChip`、`ProfRing`、`WordTile`、`MascotSay`、`scoreTier`、`shade`、`TUJI` 色票常數。

---

## 2. 各畫面 — 已接上真實資料

| 畫面 | 路由 | 對應到的既有功能 |
| --- | --- | --- |
| 今天 Today | `/` | 連勝（`getStudyStreak`）、已學數、每日 5 字（`pickDailyFrom`）、主題分類 |
| 學習 / 複習 SRS | `/study` | 完整 SRS：看圖選字 / 拼字、四個評分（重來/困難/穩定/熟練）、熟練度變化、下次複習時間（`/api/study/*`）。側欄項已從「玩法」改名「學習」 |
| 單字庫 Cards | `/cards`（新路由） | 分類篩選 + 全部單字卡、收藏 |
| 單字詳情 Detail | `/word/[id]` | 圖、KK 音標、詞性、釋義、例句（關鍵字 highlight）、搭配詞、標籤、關聯詞、熟練度環、同主題、`note` 當記憶撇步 |
| 進度 Dashboard | `/progress` | 圖鑑完成度、已學/連勝/收藏、各主題進度、清除進度 |
| 我 Me | `/me` | 個人資料、完成度、連勝/已學、平均熟練度、最熟/需加強、收藏、登出 |
| 設定 Settings | `/settings`（新路由） | 僅「登出」已接；其餘為預覽 |

---

## 3. 原型有、但「尚未實作」的功能（待討論）

這些目前在畫面上是**視覺佔位**或**暫時關閉**，需要決定要不要做、怎麼做：

### 遊戲化 — 已決定暫不做（視覺佔位已移除）
- **XP / 等級系統**：原型的 `LV 8 · 探索家`。從未實作真正 LV/XP（hero 一律用「圖鑑完成度」真實數字）；側欄帳號卡的「圖鑑探索中」殘留標語也已移除。日後若要做需 `user_xp` / 等級規則。
- **勳章 / 成就**（24 個成就）：`/progress`、`/me` 的「即將推出」假卡片**已移除**。日後若要做需成就定義 + 判定引擎 + `user_achievements`。

### 活動數據
- **活動熱力圖（過去 6 週）**：✅ 已接 `study_logs` 真實每日複習數（`getActivityHeatmap`，Asia/Taipei，6 週 Sunday-aligned）。
- **最近活動時間軸**：已決定**不做**。
- **連勝起始日**（原型「🔥 自 5/11 起」）：目前只顯示 current / longest，沒有起始日字串。

### 設定（全部尚未持久化）
- 目前 `/settings` 的開關 / 下拉**都不會儲存**。→ 需要 `user_settings` 表 + API。項目：每日目標、提醒時間、發音口音、自動播放發音、顯示中文翻譯、難度自動調整、介面語言、字級、深色模式、Tuji 出現頻率。
- **通知 / 推播**：推播通知、每日複習提醒、連勝即將中斷提醒、Email 週報 — 無通知基礎建設。
- **資料**：雲端同步狀態、**匯出（CSV / Anki `.apkg`）**、清除快取。（Admin 後台已有「匯出單字 CSV」，但使用者個人單字 / Anki 匯出尚未做。）
- **刪除帳號**：目前點了只跳 alert。
- **編輯個人資料**（Me / Settings 的「編輯」鈕）：尚未接。

### 學習流程細節
- **記憶撇步自動生成**：目前只在 `word.note` 有值時顯示，沒有自動產生。
- **SRS「💡 提示」鈕**（原型問題頁）：尚未做。
- **Today 篩選晶片（全部 / 弱字 / 新字）**：原型有，目前 Today 只顯示每日 5 字。queue API 其實支援 new/due，可延伸。
- **「今日任務」數字**：Today hero 寫死 `5`（= 每日 5 字）。若要顯示真正「今日到期 SRS 數」，需在 server 端先查 queue。
- **單字卡上的熟練度徽章（穩/熟/弱）+ 進度條**：原型每張卡都有；目前 Today/Cards 格狀卡未顯示（client 端未載入每字熟練度）。→ 可預先 hydrate 每字 mastery。
- **Tuji 出現頻率 / 個性**、**深色模式**、**介面語言切換 / 字級**：皆未做。

---

## 4. 頁面改版狀態

已全部改成 Tuji 風格（第二輪）：
- `/search`（搜尋）、`/category/[id]`（分類）、`/favorites`（收藏）
- `/signin`、`/register`、`/login`（登入/註冊/後台登入）— 改成**無側欄精簡版面**（`Shell` 對 auth 路由 early-return）+ Tuji 卡片
- `/not-found`
- 共用 `components/WordCard.tsx` 已換成 `WordTile` 版（search / category / favorites 共用）

已**整套移除**（第三輪）：
- 測驗 Quiz 功能全刪：`/quiz`、`/quiz/[type]`、`lib/quiz.ts`、`/api/users/quiz-results`、`users-db` 的 quiz 函式、`types` 的 `QuizType/QuizResult`、`storage` 的 `recordQuiz/quizHistory`、`analytics`/`events` 的 `quiz_attempt`、admin 測驗統計。
- DB：`migrate.ts` 改為 `DROP TABLE IF EXISTS user_quiz_results CASCADE`（下次 prod build 生效）。
- 側欄/底部 Tab「玩法」→「學習」。
- `events` 表的 `quiz_type` / `correct` 欄位刻意保留（停用，不再寫入）。

仍維持原樣：
- `/admin/*`（後台管理 — 內部工具，僅移除測驗統計）

---

## 5. 清理（已完成）

以下無人 import 的舊元件已刪除（typecheck / build 通過）：
`Navbar`、`Footer`、`UserNav`、`SearchBar`、`CategoryCard`、`MasteryBar`、`DailyWords`。

---

## 6. 待你決定的方向題

1. ~~遊戲化（XP / 等級 / 勳章）要做到什麼程度？~~ → **已決定：暫不做**，純走「圖鑑完成度」，視覺佔位已移除。
2. 設定頁要先接哪幾項持久化？（建議優先：每日目標、發音口音、顯示中文翻譯、深色模式）
3. 熱力圖 / 活動時間軸 是否要從 `study_logs` 接真實資料？（熱力圖示意圖目前保留）
4. 登入/註冊頁要不要獨立成無側欄版面？（已做：auth 走無側欄）
