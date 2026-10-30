# winter-2026-02 發布後獨立審查

結論：本批資料發布與使用者路徑驗證通過。產品程式尚未提交、推送或部署。

- 2新詞、4例句、8英日詞塊組及既有plastic-bag完整after-state與不可變計畫一致；袋詞僅別名與3語用法補充，原前綴、媒體、分類與權益保留。
- 20遠端物件逐一完整下載核對大小/SHA/MIME；2WebP有效且1254²，18MP3全frame與完整解碼通過。圖片與逐張獨審來源相同；音檔未主觀逐檔聆聽。
- 官方本批例句checker：2詞4例句mechanical+individual semantic通過，0問題。主詞iOS shape官方checker檢查8份捕獲雙方向清單，0問題。root另跑全庫機械DBaudit1245詞，0問題；不代表全庫語意/圖/音檔已稽核。
- 兩正式host、雙學習方向、一般與破快取共76唯一URL全部通過；30組JSON探針的本批payload相同。新詞詳細例句/詞塊、袋詞3UI語note、真正/api/search的レジ袋搜尋、分類API與HTML頁面皆驗證。
- cache先有一般URL舊資料，root僅words tag invalidate一次、delete一次；順序補查後收斂。初版審查Promise立即啟動造成過多併發風險，同時觀察到EMAXCONN/暫時500；已停止>=60秒並改最多2併發、最後順序重查，後續500消失，DBaudit恢復。未修改連線設定或終止session，無法獨立證明全域連線上限的單一成因。
- 本地程式diff符合已審補丁：2pairs/spans/2canonical keys/英文袋詞靜態note；發布fixture只補真實本批ID。restorer僅復原本地證據/選用下載公開媒體；隔離無env/DB/output目錄實測48份完整bytes復原、重跑0寫入、拒絕不同bytes覆寫。擴充便攜證據清單後由製作者再次核對。

主觀聆聽與裝置實測未檢查；正式Git canonical與部署整合待另行授權。審查agent正式寫入0。逐層狀態、manifest/hash與限制見 [完整結果](final-summary.json)；逐probe URL/status/精準內容與匹配理由見 [精簡HTTP證據](http-probes-compact.json)。
