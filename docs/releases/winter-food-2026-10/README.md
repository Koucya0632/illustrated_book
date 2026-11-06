# 冬季第三批圖鑑發布證據

本批收錄關東煮、肉包、烤地瓜與五種關東煮食材，共八詞、十六組三語例句、八張 WebP 及七十二段音檔。原始發布計畫 `bdeb6d14…`、正式 manifest `a072e60a…`、獨立審查與正式驗證紀錄均以原位元組保存。 [證據索引](restoration-index.json) · [正式驗證](evidence/post-release-review/final-summary.md)

## 核對與復原

從專案根目錄執行下列指令。

```sh
node scripts/restore-winter-food-2026-10-evidence.mjs
node scripts/restore-winter-food-2026-10-evidence.mjs --restore
node scripts/restore-winter-food-2026-10-evidence.mjs --restore --media
```

預設核對封存檔案與計畫來源。`--restore` 將原始證據復原至 `output/winter-food-2026-10/`，現有檔案須符合封存雜湊。`--media` 再從已發布的公開網址依序下載缺少的八十個媒體檔案，並核對長度、雜湊及格式。原始 PNG 保存在製作工作區。

## 程式同步

程式整合登錄本批例句、詞塊及圖片網址。例句測試以正式 manifest 的八個詞條 ID 補足發布詞庫範圍，三語用法備註由正式資料投影。 [原始發布紀錄](../winter-food-2026-10.json)
