// Evidence-bound release ledger for the locally prepared series. No live writer.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const out='output/identity-documents-preparation',prep='output/identity-documents-publish-prep';
const deliver='/Users/rex/Documents/Codex/2026-10-23/new-chat/outputs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(fs.readdirSync(prep).some(p=>p.startsWith('apply-manifest-')))throw Error('An apply journal exists; inspect it before creating another preparation report.');
const planBytes=fs.readFileSync(`${prep}/publish-plan.json`),plan=JSON.parse(planBytes);
const candidate=read('data/identity-documents-series-2026-10.json');
const audio=read('output/identity-documents-audio-candidates/verification-report.json');
const frames=read('output/identity-documents-audio-candidates/mp3-frames-report.json');
const visual=read(`${prep}/visual-review.json`),semantic=read(`${prep}/semantic-review.json`);
const preview=read(`${out}/preview-verification.json`),query=read(`${out}/category-query-probe.json`);
const examples=read(`${out}/example-contract-check.json`);
const tests=fs.readFileSync(`${out}/full-tests.log`,'utf8'),types=fs.readFileSync(`${out}/typecheck.log`,'utf8');
const build=fs.readFileSync(`${out}/build.log`,'utf8'),dry=fs.readFileSync(`${out}/publisher-dry-run.log`,'utf8');
const count=Number(tests.match(/tests (\d+)/)?.[1]),passed=Number(tests.match(/pass (\d+)/)?.[1]),skipped=Number(tests.match(/skipped (\d+)/)?.[1]);
if(!count||passed+skipped!==count||!tests.includes('fail 0'))throw Error('test evidence incomplete');
if(types.trim()||!build.includes('Compiled successfully')||!build.includes('/word/[id]'))throw Error('type/build evidence incomplete');
if(!dry.includes('"mode": "dry-run"')||!dry.includes('"writeReady": true'))throw Error('default dry run incomplete');
if(!audio.passed||!frames.passed||audio.clipsVerified!==plan.summary.audioClips||frames.clips!==plan.summary.audioClips)throw Error('audio evidence incomplete');
if(visual.summary.passedWordImages!==plan.summary.words||visual.summary.passedCategoryImages!==1||semantic.summary.passed!==plan.summary.words*3)throw Error('review evidence incomplete');
if(!preview.passed||preview.cards!==plan.summary.words||preview.loadedImages!==plan.summary.words+1||!query.passed||examples.mechanical.length||examples.semantic.issues.length)throw Error('preview/annotation/category evidence incomplete');
for(const {file,sha256}of Object.values(plan.sources))if(sha(fs.readFileSync(file))!==sha256)throw Error(`stale plan source: ${file}`);
const immutable=`${prep}/publish-plan-${sha(planBytes)}.json`;
if(!fs.existsSync(immutable)||!fs.readFileSync(immutable).equals(planBytes))throw Error('immutable plan missing');
const images=read(`${prep}/image-manifest.json`);
const finalImages=[...images.images,images.categoryImage].map(meta=>{
 const review=visual.reviews.find(r=>r.id===meta.id);
 if(!review||review.contentSha256!==sha(fs.readFileSync(meta.localFile)))throw Error(`stale image review: ${meta.id}`);
 return{id:meta.id,verdict:'pass',reason:review.reason,sourceSha256:meta.sourceSha256,contentSha256:meta.contentSha256,localFile:meta.localFile};
});
fs.writeFileSync(`${out}/final-image-review.json`,JSON.stringify({reviewer:'Codex',checkedAt:new Date().toISOString(),method:'All 11 original PNGs viewed individually; all final word WebPs viewed in a contact sheet. Category WebP uses the individually reviewed source, resized and padded without changing its composition.',contactSheetSha256:sha(fs.readFileSync(`${out}/contact-sheet.png`)),items:finalImages},null,2)+'\n');
const layers=[
 ['正式主詞基準','passed',`SELECT 讀取 ${plan.databasePreflight.publishedCount} 個已發布未刪除主詞；基礎 DB 一致性稽核通過，不代表全庫語意或圖片已審閱。`],
 ['新增詞及分類衝突','passed','10 個 ID、英日詞頭、分類及翻譯、40 條英日句子無正式資料衝突；所需資料表存在。'],
 ['本批逐筆語意','passed','10 概念與20例句均有具體個別理由及精確來源 hash。Codex 自行編輯審閱，未聲稱獨立人員審稿。'],
 ['例句及點擊詞塊','passed','每詞 A2／B1 各一句；40 條英日句子可逐字重組，190 個詞塊有三語語境義；日文讀音完整。共用契約檢查器為0問題。'],
 ['本機圖片','passed','10張詞圖及1張分類封面均逐張檢視來源圖，最終WebP為1024×1024；版本路徑、ID、大小、SHA-256一一對應。圖為日本常見形式的教學示意，不是官方文件精確複製品。'],
 ['本機詞頭發音','passed','30段，en-US／en-GB／ja-JP各10段；與例句owner完全分開。'],
 ['本機例句發音','passed','60段，三locale各20段；逐筆文字、locale與owner核對；候選鍵不是正式例句ID。'],
 ['MP3完整性','passed','90段MP3完整frames解析、完整解碼、大小與SHA-256通過。未進行90段主觀聽審。'],
 ['一般部署與備援防護','passed','測試涵蓋未寫入、draft、部分、刪除、錯誤分類，及無DB／DB錯誤與同步helpers；實際分類SQL在READ ONLY交易通過，新分類不顯示。'],
 ['型別／測試／建置','passed',`${passed}項測試通過、${skipped}項依既有環境條件略過、0失敗；TypeScript、Next build及diff whitespace檢查通過。未執行一般migration。`],
 ['本機預覽','passed',`${preview.cards}張卡片、${preview.loadedImages}張已載入圖片、${preview.audioControls}個音訊控制及${preview.tappableSpans}個詞塊經瀏覽器確認。HTML已內嵌圖片與音檔，可離線開啟。`],
 ['本機英日卡片格式','passed','執行目前getAllCardWords投影，兩方向各10詞，CardWord必要／可選形狀與音檔locale投影通過。已閱讀目前iOS Codable模型，未修改iOS。這不是正式API證據。'],
 ['封存計畫與預設publisher','passed','完整內容及媒體hash封存；預設publisher只做SELECT預檢，邏輯DB與實體R2目標指紋一致，writeReady=true只表示準備狀態。'],
 ['正式Storage與資料庫發布','pending','尚未授權；0上傳、0DB內容寫入、0例句ID預留。需取得授權後重新預檢，先建立恢復manifest及例句ID映射。'],
 ['遠端WebP／MP3','pending','尚未上傳；發布前及發布後需完整下載全部101個物件並比對bytes／MIME／hash。'],
 ['正式雙向API／iOS形狀','pending','尚未發布，因此沒有本批正式payload；發布後需比對DB與英日API。'],
 ['分類／詳情路由與快取','pending','發布後比對一般與cache-busting URL並等待設定的revalidation窗口內收斂。'],
 ['iOS實機測試','not checked','本次未修改iOS，也未進行裝置測試。'],
 ['提交與部署','pending','均未執行，各需另行授權。'],
].map(([layer,status,detail])=>({layer,status,detail}));
const artifacts={candidate:'data/identity-documents-series-2026-10.json',spans:'data/example-spans-identity-documents-2026-10.json',semantic:'data/identity-documents-semantic-review-2026-10.json',visual:'data/identity-documents-visual-review-2026-10.json',prompts:'data/identity-documents-image-prompts-2026-10.json',imageManifest:`${prep}/image-manifest.json`,finalImageReview:`${out}/final-image-review.json`,audioManifest:'output/identity-documents-audio-candidates/generated-manifest.json',audioVerification:'output/identity-documents-audio-candidates/verification-report.json',audioFrames:'output/identity-documents-audio-candidates/mp3-frames-report.json',categoryQuery:`${out}/category-query-probe.json`,exampleContract:`${out}/example-contract-check.json`,previewVerification:`${out}/preview-verification.json`,publishPlan:immutable,defaultPublisher:`${out}/publisher-dry-run.log`,tests:`${out}/full-tests.log`,types:`${out}/typecheck.log`,build:`${out}/build.log`};
const ledger={schemaVersion:1,series:'identity-documents',state:'prepared-not-published',checkedAt:new Date().toISOString(),summary:plan.summary,publishedBaseline:plan.databasePreflight.publishedCount,projectRoot:process.cwd(),planDigest:plan.planDigest,planFileSha256:sha(planBytes),publishPlan:immutable,applyManifest:null,productionActions:{uploads:0,databaseContentWrites:0,exampleIdReservations:0,commits:0,deploys:0},layers,artifacts};
fs.writeFileSync(`${out}/release-ledger.json`,JSON.stringify(ledger,null,2)+'\n');
const doc=`# 證件系列：本機準備完成，尚未正式發布

日本時間2026-10-23。已準備${plan.summary.words}詞、${plan.summary.definitions}筆釋義、${plan.summary.examples}句三語例句、${plan.summary.spanSentences}條英日句子詞塊、${plan.summary.wordImages}張詞圖與${plan.summary.categoryImages}張分類封面，以及${plan.summary.audioClips}段日／美／英發音；正式發布預計新增${plan.summary.storageObjects}個素材物件。

| English | 日本語 | 繁中 |
|---|---|---|
${candidate.entries.map(e=>`| ${e.word} | ${e.ja} | ${e.chinese} |`).join('\n')}

既有employee-id-card／社員証留在辦公室分類；沒有新增重複詞、搬移舊詞或修改自訂／收藏內容。正式主詞目前${plan.databasePreflight.publishedCount}詞，若此批完整發布則預計增為${plan.databasePreflight.publishedCount+plan.summary.words}詞；這是預期值，不是已上線數量。

在留卡採2026年新版的淡粉色、左側照片與右側資格欄位示意；My Number卡與在留卡分開。健保項目使用現行資格確認書，與資格資訊通知書及舊健保證分開。住民票の写し指自治體核發的官方副本；印鑑登錄卡與印鑑證明書分別建詞。圖像以辨識文件類型為目的，個人欄位為無資訊灰線，不作為防偽或文件真偽教材。

## 檢查狀態

| 層級 | 狀態 | 證據與限制 |
|---|---|---|
${layers.map(l=>`| ${l.layer} | ${l.status} | ${l.detail} |`).join('\n')}

## 發布計畫與授權

- 不可變發布計畫：${immutable}
- 計畫檔SHA-256：${ledger.planFileSha256}
- Plan digest：${plan.planDigest}
- 恢復apply manifest：尚未建立；沒有正式操作。

依[add-tuji-atlas-series技能](/Users/rex/.codex/skills/add-tuji-atlas-series/SKILL.md)明文要求："Ask for separate explicit authorization immediately before each production-changing phase." 下一階段須取得正式Storage上傳與DB發布授權，提交與部署各自另行授權。正式操作前重跑唯讀預檢，確認邏輯DB及實體Storage目標；預留20個正式例句ID並先存入恢復manifest，才解析例句音檔路徑。以create-only上傳101個物件並完整下載核對後，再用單一資料庫交易插入全部內容並發布整批。任何中斷均沿原manifest恢復，不另啟第二次apply。

## 檔案與可重跑驗證

- 獨立離線預覽：identity-documents-preview.html（含全部圖片與90段發音）。
- 圖片總覽：identity-documents-contact-sheet.png。
- 圖片由內建image_gen逐項生成，提示全文保存在data/identity-documents-image-prompts-2026-10.json；原始PNG保存在output/identity-documents-2026-10/sources，版本WebP保存在images子目錄。
- 發音使用Google Chirp 3 HD，本機生成；未上傳正式Storage。
- npx tsx --env-file=.env.local scripts/verify-identity-documents-preparation.ts：唯讀實際分類查詢、本機雙向卡片投影與例句契約。
- npm run identity-documents:publish：預設唯讀預檢，沒有apply便不寫正式環境。
- 完整證據路徑見identity-documents-release-ledger.json，各路徑以${process.cwd()}為根。

## 官方參考

- [在留卡新版與既有卡並行說明](https://www.moj.go.jp/isa/tokutei)：Q4-1、Q4-2；新版一般在留卡與特定在留卡表面欄位相同，個人編號背面記載有別。
- [厚生勞動省新版券面示意，第3頁](https://www.mhlw.go.jp/content/11601000/001739201.pdf)：用來比對新版布局；教學圖仍為簡化示意。
- [厚生勞動省資格確認方式](https://www.mhlw.go.jp/stf/newpage_50657.html)、[資格確認書樣式例](https://www.mhlw.go.jp/content/10200000/001516101.pdf)：未沿用舊健保證。
- [My Number卡官方介紹](https://www.kojinbango-card.go.jp/kojinbango-/)。
- [警察廳駕照與My Number整合](https://www.npa.go.jp/bureau/traffic/r4kaisei_main.html)、[國外駕駛許可證申領概要](https://www.npa.go.jp/policies/policy/online-keikaku/20211004_kokugaiuntenmenkyoshou_gaiyou.pdf)。
- [新宿區印鑑登錄與證明](https://www.city.shinjuku.lg.jp/todokede/koseki03_000005.html)、[住民票等證明](https://www.city.shinjuku.lg.jp/todokede/koseki03_000009_f.html)。
`;
fs.writeFileSync('docs/IDENTITY_DOCUMENTS_SERIES_2026_10.md',doc);
fs.writeFileSync(`${deliver}/identity-documents-report.md`,doc);
for(const [source,name]of [[immutable,`identity-documents-publish-plan-${sha(planBytes)}.json`],[`${out}/release-ledger.json`,'identity-documents-release-ledger.json'],['data/identity-documents-series-2026-10.json','identity-documents-candidates.json'],['data/identity-documents-image-prompts-2026-10.json','identity-documents-image-prompts.json'],[`${out}/final-image-review.json`,'identity-documents-image-review.json'],['data/identity-documents-semantic-review-2026-10.json','identity-documents-semantic-review.json']])fs.copyFileSync(source,`${deliver}/${name}`);
console.log({state:ledger.state,summary:ledger.summary,tests:{count,passed,skipped},planFileSha256:ledger.planFileSha256,report:`${deliver}/identity-documents-report.md`});
