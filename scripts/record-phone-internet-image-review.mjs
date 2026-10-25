// Individual visual judgments recorded after inspecting all original source images.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const reasons={
'phone-case':'空殼的鏡頭開孔、包覆邊緣及按鍵位置清楚，沒有把手機本體當成殼；淺藍矽膠外觀可見於日本日常，白底無品牌。',
'screen-protector':'透明薄片、圓角、聽筒孔及掀起的背膜能辨識螢幕保護貼，沒有手機外框或厚殼；白底呈現反光與透明邊緣。',
'charging-cable':'單條灰色線材兩端皆為橢圓USB-C插頭，接頭與線身完整可見，與RJ45網路線和插牆充電器不同。',
'wireless-charger':'圓形低矮充電盤、頂面充電線圈示意、指示燈與供電線可辨識無線充電座；主體完整，沒有暗示充電座不需電源。',
'phone-stand':'空的桌上金屬支架有傾斜靠板、兩個底托、鉸鏈及穩定底座；不是自拍棒或平板本體，白底清楚。',
'sim-card':'實體小型晶片卡有切角、白色基底及分隔金色接點，沒有記憶卡的黑色外殼或eSIM圖示；可辨識SIM卡，非精密尺寸教材。',
'sim-eject-tool':'銀色橢圓握環延伸一根直的細針，沒有別針扣頭、縫針孔或多餘工具；形狀符合日本常見SIM取出工具。',
'mobile-wifi-router':'掌上圓角裝置有Wi-Fi、行動訊號與電池圖示及電源鍵，沒有手機應用圖示、家用外接天線或固定底座；可辨識可攜式熱點。',
'ethernet-cable':'藍色線兩端為透明RJ45接頭，八個金屬接點、卡扣及護套可辨識，與USB-C及較窄電話線接頭不同。',
'wireless-earbuds':'左右兩顆入耳式耳機與矽膠耳塞在開啟的充電盒中，沒有線材或頭戴支架，與既有headphones區分，無品牌文字。',
'phone-strap':'綠色編織手腕環、金屬扣與末端細繩均完整可見，可繫於手機殼；不是車廂吊環或長頸帶，白底無文字。',
'car-phone-mount':'黑色手機托架有左右夾爪、下托及後方出風口夾片，車載固定特徵清楚，與桌上支架不同。',
'selfie-stick':'伸出的多節金屬桿、握把按鍵及空手機夾均可見，整根棒及腕繩完整，沒有把三腳架誤作主體。',
'usb-hub':'四個USB-A母孔加短線USB-C公頭清楚，所有端點可見；沒有LAN孔或記憶卡插槽，能辨識USB集線器。',
'usb-c-ethernet-adapter':'短線一端USB-C公頭、另一端單一RJ45網路孔可見八接點及卡扣缺口，與集線器和網路線不同。',
'card-reader':'較大的SD槽插有記憶卡，旁有較小microSD槽及USB-C線，沒有付款螢幕、刷卡槽或信用卡。',
'microsd-card':'黑色小卡有microSD標準規格標示和階梯凹口，不是白色金接點SIM卡；無品牌、容量假字或轉接套。',
'wifi-extender':'插牆型白色裝置有雙天線、訊號燈及兩片平行扁插腳，符合日本A型插頭外觀；無電池螢幕，與行動分享器分開。',
'app':'修正版以九個通用圖示呈現主畫面，中央單一日曆圖示有清楚外框強調；移除初版近似品牌的圖示，無文字或商標。',
'notification':'手機上方只有一則帶鈴鐺與中性文字線的通知橫幅，與主畫面程式圖示及完整簡訊畫面區分，無可讀假字。',
'password':'登入欄位以八個遮蔽圓點及小鎖呈現秘密密碼，沒有六格驗證數字；手機完整、白底無帳號資料。',
'verification-code':'簡訊通知及六個輸入格均顯示相同示意碼482619，來源與輸入目標一致，與遮蔽密碼明確區分。',
'screenshot':'修正版左下小預覽只含同一葉片畫面、白色邊框及陰影，移除初版縮圖內的手機殼和瀏海，符合螢幕截圖預覽。',
'airplane-mode':'飛機符號、綠色開啟切換鈕及狀態列飛機圖示一致，沒有矛盾的行動訊號圖示；清楚代表飛航模式設定。',
'personal-hotspot':'手機和筆電呈相同分享連結符號，兩者間有無線連線示意，沒有另放路由器；代表手機分享網路而非購買熱點設備。',
'mobile-data':'手機顯示行動基地台、訊號格與上下傳箭頭，狀態列5G標記辨識行動回線；無Wi-Fi符號，與個人熱點區分。',
'category-phone-internet':'手機Wi-Fi圖示、可攜式分享器、USB-C線及SIM卡構成四件清楚物件，白底有留白，無多餘標籤或品牌，可代表手機與網路系列。'
};
const items=Object.entries(reasons).map(([id,reason])=>({id,decision:'pass',reason,sourceSha256:createHash('sha256').update(fs.readFileSync(`output/phone-internet-2026-10/sources/${id}.png`)).digest('hex')}));
fs.writeFileSync('data/phone-internet-visual-review-2026-10.json',JSON.stringify({schemaVersion:1,series:'phone-internet',reviewer:'Codex; every original source inspected individually',items},null,2)+'\n');
