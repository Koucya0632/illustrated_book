# 手機與網路：正式發布與驗證

日本時間2026-10-26。已新增26詞、78筆釋義、52句三語例句、104組英日句子詞塊、26張詞圖、1張封面及234段發音。正式主詞由1201增為1227。

正式分類：[手機與網路](https://tuji.nexflow.team/category/phone-internet)。

| English | 日本語 | 繁中 |
|---|---|---|
| phone case | スマホケース | 手機殼 |
| screen protector | 画面保護フィルム | 螢幕保護貼 |
| charging cable | 充電ケーブル | 充電線 |
| wireless charger | ワイヤレス充電器 | 無線充電器 |
| phone stand | スマホスタンド | 手機支架 |
| SIM card | SIMカード | SIM卡 |
| SIM eject tool | SIMピン | 退卡針 |
| mobile Wi-Fi router | モバイルルーター | 行動Wi-Fi路由器 |
| Ethernet cable | LANケーブル | 網路線 |
| wireless earbuds | ワイヤレスイヤホン | 無線耳機 |
| phone strap | スマホストラップ | 手機掛繩 |
| car phone mount | 車載スマホホルダー | 車用手機架 |
| selfie stick | 自撮り棒 | 自拍棒 |
| USB hub | USBハブ | USB集線器 |
| USB-C Ethernet adapter | USB-C LANアダプター | USB-C網路轉接器 |
| card reader | カードリーダー | 讀卡機 |
| microSD card | microSDカード | microSD記憶卡 |
| Wi-Fi extender | Wi-Fi中継機 | Wi-Fi訊號延伸器 |
| app | アプリ | 應用程式 |
| notification | 通知 | 通知 |
| password | パスワード | 密碼 |
| verification code | 認証コード | 驗證碼 |
| screenshot | スクリーンショット | 螢幕截圖 |
| airplane mode | 機内モード | 飛航模式 |
| personal hotspot | インターネット共有 | 個人熱點 |
| mobile data | モバイルデータ通信 | 行動數據 |

既有智慧型手機、充電器、行動電源、家用路由器及頭戴式耳機保留原分類。未修改自訂或收藏詞。

## 正式操作

- 261個全新素材以create-only上傳，0覆寫；上傳後、DB交易前及發布後均完整下載核對大小、MIME與SHA-256。
- 先預留52個正式例句ID並寫入恢復manifest，再解析例句音檔路徑。
- 在單一DB交易中新增全部相依資料及發布26詞，沒有提交半套可公開子資料。
- 發布後以READ ONLY交易逐欄比對主詞、釋義、日文詞頭及讀音、例句、翻譯、詞塊、三語gloss、分類、卡片與媒體，均與封存計畫一致。
- 圖鑑資料快取的實際更新窗為3600秒；API路由設定為300秒。本次只針對words標籤進行1次stale失效及1次刪除快取，使一般URL與避快取URL收斂；未清除其他快取，未手動部署。

## 驗證結果

| 層級 | 結果 |
|---|---|
| 全庫DB基本一致性 | 1227詞通過。 |
| 全庫例句結構 | 2454句及英日詞塊機械檢查通過；全庫語意未重新審閱。 |
| 本批語意 | 26詞／52句皆有具體理由與精確來源hash；正式資料逐欄相符後沿用已完成判定。 |
| 全庫發音資料列 | 3681段詞頭、7362段例句的locale覆蓋與資料契約通過。 |
| 本批遠端圖片 | 27張皆為1024×1024有效WebP，MIME、大小與hash與逐張審閱的素材相同。 |
| 本批遠端發音 | 詞頭78段、例句156段分開，文字、owner、locale、完整MP3 frames、MIME、大小與hash通過；未宣稱逐段主觀聽審。 |
| 英日API／iOS形狀 | iOS設定網域與網站網域、兩方向一般及避快取共8個主詞探針皆為1227詞，完整包含26個新詞；CardWord形狀與主詞音檔投影通過。未做iOS實機測試。 |
| 詳情、分類、網頁 | 共164個探針通過，包含52組兩方向詞條詳情的普通及避快取查詢、三語分類API，以及分類和26個詞條網頁的普通及避快取URL。 |
| main整合 | 以最新origin/main的獨立目錄只納入本系列；型別、Next build、943項測試中932通過、11依既有條件略過、0失敗；169項隔離PostgreSQL測試通過。476詞／952句frozen eval機械檢查100%，與baseline相同。 |
| 一般部署防護 | 每個新ID與分類均受seed防護；公開備援與同步helpers排除；分類只有全部計畫主詞均已發布才顯示。 |

未將本批驗證擴大宣稱為全庫語意、全庫圖片或主觀聽審全部通過。

## 計畫與恢復證據

- 計畫檔SHA-256：`bd7738f8553cbd941d6be44d7aea5edda53fa5972a891729dd287c1579641330`。
- Plan digest：`1ec886934368a0dfbc4d479f3d241ae8f69c1582c3cc503126f0af570e8d0815`。
- Apply manifest：`apply-manifest-2026-10-25T17-38-31-935Z.json`，狀態applied，SHA-256 `f6cd4e7c13a4e0a37d269170c895bd49588547e8a0c114950afb940526644b2e`。
- [可攜式發布與驗證清單](releases/phone-internet-series-2026-10.json)：含52個真實例句ID映射、261個物件的鍵、URL、大小、MIME、hash及上傳狀態，並保留各層驗證證據。
- [不可變發布計畫](releases/phone-internet-publish-plan-bd7738f8553cbd941d6be44d7aea5edda53fa5972a891729dd287c1579641330.json)。
- 本機完整證據：output/phone-internet-post-release；中斷恢復先檢查原manifest及來源hash，不另啟第二次apply。
