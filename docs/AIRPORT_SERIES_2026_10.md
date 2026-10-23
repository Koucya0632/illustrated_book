# 機場系列：正式發布與驗證

2026-10-24（日本時間）。使用者已授權上傳、正式資料庫寫入、提交及推送main。

新增20詞、60筆釋義、40句三語例句、80組英日點擊詞塊、20張詞圖、1張分類封面及180段發音。正式主圖鑑由1181增至1201詞；兩學習方向的一般與避快取API均已可見完整系列。

| 繁中 | English | 日本語 |
|---|---|---|
| 航廈 | airport terminal | 空港ターミナル |
| 報到櫃檯 | check-in counter | チェックインカウンター |
| 登機證 | boarding pass | 搭乗券 |
| 安檢處 | security checkpoint | 保安検査場 |
| 登機口 | boarding gate | 搭乗口 |
| 行李轉盤 | baggage carousel | ターンテーブル |
| 行李推車 | baggage cart | 手荷物カート |
| 行李領取憑證 | baggage claim tag | 手荷物引換証 |
| 行李箱 | suitcase | スーツケース |
| 自助報到機 | self-service check-in kiosk | 自動チェックイン機 |
| 自助行李託運機 | self-service bag drop | 自動手荷物預け機 |
| 航班資訊看板 | flight information display | フライト案内板 |
| 登機空橋 | jet bridge | ボーディングブリッジ |
| 護照查驗櫃檯 | passport control counter | 出入国審査カウンター |
| 海關櫃檯 | customs counter | 税関カウンター |
| 免稅店 | duty-free shop | 免税店 |
| 機場貴賓室 | airport lounge | 空港ラウンジ |
| 機場接駁巴士 | airport shuttle bus | 空港シャトルバス |
| 跑道 | runway | 滑走路 |
| 航空管制塔 | control tower | 管制塔 |


既有護照、飛機、車站發車案內板與相關職業保留原分類；未修改自訂詞及收藏詞。自助報到機與行李託運機、護照查驗與海關分開；跑道圖的白色邊燈與16/34反向號已修正並逐張審閱。

## 正式操作與恢復

- 201個全新素材以create-only上傳，0覆寫；上傳後與DB交易前均完整下載核對MIME、大小及SHA-256，發布後再次核對全部201個遠端物件。
- 先預留40個Postgres例句ID並寫入恢復manifest，再解析例句音檔路徑。詞頭與例句owner分開。
- 單一資料庫交易插入全部相依內容並發布20詞，沒有提交可公開的半套子資料。
- 發布後以READ ONLY交易逐欄比對主詞、釋義、日文讀音分段、例句及翻譯、詞塊與三語gloss、分類、卡片與媒體；與不可變計畫完全一致。
- 1次words快取標籤失效；沒有手動部署、rollback或刪除舊物件。推送main後由既有平台流程處理。
- 保留原工作目錄與所有其他既有變更；以最新origin/main（2220f78）的獨立目錄只整合機場內容。

## 驗證

| 層級 | 結果 |
|---|---|
| 全庫DB基礎一致性 | 1201詞通過。 |
| 全庫例句結構 | 2402句及英日詞塊機械檢查通過；全庫逐筆語意未重審。 |
| 本批逐筆語意 | 20詞與40句均有個別具體理由及來源hash；正式內容全欄與計畫一致後沿用。為Codex審閱，非獨立人工審核。 |
| 圖片 | 21張有效1024×1024 WebP，逐張原圖與總覽審閱完成；正式bytes、MIME、大小與hash全部相同。 |
| 發音 | 詞頭60段、例句120段；三種locale、source text、owner、MP3 frames、MIME、大小與hash通過。未宣稱逐段主觀聽審。 |
| API／iOS資料形狀 | 92個英日主詞、詳情及多語分類API探針通過目前CardWord必要與可選欄位契約。未做iOS實機測試。 |
| 頁面與快取 | 42個一般／避快取分類與詞條頁探針通過；兩方向主詞集合皆1201，普通與避快取已收斂。 |
| main整合檢查 | TypeScript、922項測試通過，11依現有條件略過，0失敗；169項隔離PostgreSQL測試通過；Webpack build通過；476詞／952句frozen eval機械100%，與baseline相同。 |
| 一般本機建置 | 原目錄前次有Google字型解析錯誤；獨立目錄一般Turbopack因node_modules指向外部的symlink而拒絕。本機未確認預設方式，遠端CI將以正常安裝依賴檢查。 |
| 部署防護 | 每個新ID與分類受seed防護；公開fallback與同步helpers排除；分類僅全批已發布時顯示。 |

全庫API仍有picnic-sheet、superball-scooping、chocolate-banana、ramune四筆既有純假名書寫差異，各在普通與避快取探針出現。本批沒有這些問題。沒有宣稱全庫語意、圖片或主觀聽審已全量通過。

## 不可變計畫與恢復證據

- Plan digest：d00b3e9ceef5015d4361016b31d5a238a269a4c901d6c775cab2a6162994a398
- 計畫檔：publish-plan-ba01bc76b237432afb14f0b13d07532c62c917dbf60328be8616f29b39c13d34.json
- 計畫檔SHA-256：ba01bc76b237432afb14f0b13d07532c62c917dbf60328be8616f29b39c13d34
- Apply manifest：apply-manifest-2026-10-23T15-26-13-823Z.json，狀態applied，SHA-256：f1b03e265d90279a945c715685f8ae9841cd99c06f39abd7ae51729d566d5803
- [可攜式發布與恢復清單](releases/airport-series-2026-10.json)：完整40個例句ID映射、201個物件的鍵、URL、大小、MIME、hash、上傳及驗證狀態。
- 詳細驗證證據：output/airport-post-release。中斷先比對原manifest，禁止另開第二次apply。

正式分類：[機場](https://tuji.nexflow.team/category/airport)。本機預覽與內建imagegen精確提示詞及來源素材保留在原交付目錄。
