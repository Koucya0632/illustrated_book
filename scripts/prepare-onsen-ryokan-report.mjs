// Local evidence ledger only. Never changes production state.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p));
if(fs.readdirSync('output/onsen-ryokan-publish-prep').some(file=>/^apply-manifest-.*\.json$/.test(file)))throw Error('Publication manifest exists; preserve the release ledger instead of resetting preparation state');
const planFile='output/onsen-ryokan-publish-prep/publish-plan.json';
const plan=read(planFile),candidate=read('data/onsen-ryokan-series-2026-10.json');
const sha256=createHash('sha256').update(fs.readFileSync(planFile)).digest('hex');
const immutable=`output/onsen-ryokan-publish-prep/publish-plan-${sha256}.json`;
if(!fs.existsSync(immutable))throw Error('Missing immutable plan');
const audio=read('output/onsen-ryokan-audio-candidates/verification-report.json');
const preview=read('output/onsen-ryokan-preparation/preview-check.json');
const tests=fs.readFileSync('output/onsen-ryokan-preparation/full-tests.log','utf8');
const passed=Number(tests.match(/ℹ pass (\d+)/)?.[1]);
const skipped=Number(tests.match(/ℹ skipped (\d+)/)?.[1]);
const failed=Number(tests.match(/ℹ fail (\d+)/)?.[1]);
const build=fs.readFileSync('output/onsen-ryokan-preparation/build.log','utf8');
const dryRun=fs.readFileSync('output/onsen-ryokan-preparation/publisher-dry-run.log','utf8');
if(!audio.passed||preview.issues.length||!plan.databasePreflight.readyForGuardedApply||!passed||failed!==0||!build.includes('Compiled successfully')||!build.includes('/word/[id]')||!dryRun.includes('"writeReady": true')||!dryRun.includes('dry run only; no Storage or database changes'))throw Error('Missing successful preparation evidence');
const evidence={candidateCollisions:'output/onsen-ryokan-preparation/candidate-collisions.json',semanticReview:'data/onsen-ryokan-semantic-review-2026-10.json',visualReview:'data/onsen-ryokan-visual-review-2026-10.json',imageManifest:'output/onsen-ryokan-publish-prep/image-manifest.json',audioVerification:'output/onsen-ryokan-audio-candidates/verification-report.json',typecheck:'output/onsen-ryokan-preparation/typecheck.log',targetedTests:'output/onsen-ryokan-preparation/targeted-tests.log',fullTests:'output/onsen-ryokan-preparation/full-tests.log',build:'output/onsen-ryokan-preparation/build.log',dryRun:'output/onsen-ryokan-preparation/publisher-dry-run.log',preview:'output/onsen-ryokan-preparation/preview.html',contactSheet:'output/onsen-ryokan-preparation/contact-sheet.png',previewCheck:'output/onsen-ryokan-preparation/preview-check.json',screenshot:'output/onsen-ryokan-preparation/preview-screenshot.png'};
const layers={};
for(const key of ['candidateCollisions','twoExamplesAndSpans','individualEditorialReview','individualImageReview','localWebpBytesAndMapping','headwordAudio','exampleAudio','localMp3DecodeAndHash','typecheck','targetedTests','fullTests','webBuild','selectOnlyProductionPreflight','publisherDryRun','localPreview'])layers[key]='passed';
for(const key of ['productionDatabaseContent','remoteImageBytes','remoteAudioBytes','englishAndJapaneseApi','iosWireShape','ordinaryAndCacheBustingApi','categoryAndDetailRoutes','deployment'])layers[key]='pending';
for(const key of ['iosDevice','independentModelReview','subjectiveListeningQuality','fullCatalogSemanticReview','fullCatalogMediaAudit'])layers[key]='not checked';
const report={schemaVersion:1,series:'onsen-ryokan',preparedAt:new Date().toISOString(),status:'ready-for-separate-production-authorization',plan:{file:immutable,sha256,contentDigest:plan.planDigest},summary:plan.summary,layers,tests:{passed,skipped,failed,targeted:21},productionActions:{storageUploads:0,databaseWrites:0,commits:0,deployments:0},baseline:{publishedWords:plan.databasePreflight.publishedCount},evidence,notes:['No apply manifest exists because publication has not run.','The earlier b9aa3547 plan is superseded by the final plan after dictionary-based English IPA corrections. Its source guards reject current sources.','Kaiseki image v1 was rejected; all 21 selected originals and the final WebP contact sheet were visually reviewed.','All existing unrelated iOS edits were preserved, including a concurrent CONTEXT.md change.']};
fs.writeFileSync('output/onsen-ryokan-preparation/readiness.json',JSON.stringify(report,null,2)+'\n');
const table=candidate.entries.map((e,i)=>`| ${i+1} | ${e.chinese} | ${e.word} | ${e.ja} |`).join('\n');
const doc=`# 溫泉旅館系列：本機準備完成，尚未發布

2026-10-22（日本時間）。分類：onsen-ryokan／溫泉旅館／温泉旅館／Hot Spring Inns。

本批 **20 個新主詞、60 筆釋義、40 句三語例句、80 組英日句子詞塊、20 張詞圖、1 張分類封面與 180 段音檔**，共 201 個待上傳物件。現有浴衣、日式寢具、拖鞋、浴室工具及毛巾保持原樣。自訂與收藏詞不在範圍。

## 詞目

| # | 中文 | English | 日本語 |
| --- | --- | --- | --- |
${table}

## 已通過的檢查

- 正式資料庫 SELECT-only 快照與預檢：目前 ${plan.databasePreflight.publishedCount} 個已發布且未刪除主詞；新 ID、英日詞頭、分類與句子詞塊均無衝突。
- 20 主詞及 40 例句逐筆編輯覆核，60 筆具體理由綁定當前內容及詞塊雜湊。每詞有 A2 簡單句及 B1 複雜句；80 句英日詞塊可精確重組原句，三語語境義及日文讀音完整。這是 Codex 的逐筆判斷，未另呼叫獨立審核模型。
- 全部 21 張選用原圖逐張檢視，最終 WebP 總覽也已檢視。均為 1024×1024 WebP，來源、內容雜湊、ID、路徑一對一。會席料理第一版太像一般定食而淘汰；第二版顯示八件器皿的多道小份料理總覽。
- 使用內建 imagegen；22 次生成的完整提示詞保存在 data/onsen-ryokan-image-prompts-2026-10.json。原圖在 output/onsen-ryokan-2026-10/sources，轉製 WebP 在 images。沒有使用替代 API 圖像生成。
- 主詞音檔 60 段、例句音檔 120 段，分別覆蓋 ja-JP、en-US、en-GB。來源文字、owner/locale、大小、SHA-256、ffprobe 與完整 ffmpeg 解碼均通過；未逐段主觀聽音。例句 ownerKey 仍是候選參照，正式 example ID 必須在受控發布時解析，不能直接當正式路徑。
- 型別檢查、21 項針對性系列測試、全套測試 ${passed} 通過／${skipped} 項既有跳過／${failed} 失敗、網站建置。
- 一般 seed 同時防護所有新 ID 與分類；無資料庫、資料庫故障備援及同步助手不顯示這批詞。分類查詢需完整 20 詞已發布且未刪除才顯示分類。
- 發布器預設唯讀；SELECT-only dry run 已核對邏輯 DB 與實體 R2 目標，無上傳或資料列變動。
- 本機預覽 20 張詞卡、180 個音訊播放器；全部 201 個素材連結存在且 HTTP 200，瀏覽器畫面已確認。

## 發布計畫與證據

- 最終不可覆寫計畫：${immutable}
- 計畫檔案 SHA-256：${sha256}
- 計畫內容摘要：${plan.planDigest}
- 機器可讀狀態：output/onsen-ryokan-preparation/readiness.json
- 本機預覽：output/onsen-ryokan-preparation/preview.html
- 圖片總覽：output/onsen-ryokan-preparation/contact-sheet.png
- 逐項證據路徑見 readiness.json 的 evidence。
- 前一版 b9aa3547 計畫已由最終版取代：兩個英文借詞的 IPA 經字典核對後修正，舊計畫會因來源雜湊不同而拒絕套用。

## 待授權與發布後檢查

尚未上傳媒體、寫入正式資料庫、提交或部署；正式環境動作數均為零，也尚無 apply manifest。上傳 201 個素材及單一交易發布 20 詞須分別明確授權，提交與部署另行授權。

受控套用須重新預檢，解析正式例句 ID，保存原始 manifest，以 create-only 上傳新物件，完整重下載驗證 bytes 後才在單一交易中插入並發布整批內容。若中斷，沿同一 manifest 恢復。

發布後仍需比對正式 DB 全欄位、遠端 WebP/MP3 bytes、兩方向普通與 cache-busting API、iOS 解碼形狀、分類／詳情路由及快取收斂；這些層目前均 pending。iOS 實機、全庫語意與全庫媒體未於本次檢查。iOS 原有 project.pbxproj、Localizable.xcstrings 及本次期間出現的 CONTEXT.md 修改均保留；未修改 iOS。

## 用語與外觀參考

${candidate.references.map(url=>`- [${new URL(url).hostname}](${url})`).join('\n')}
`;
fs.writeFileSync('docs/ONSEN_RYOKAN_SERIES_2026_10.md',doc);
console.log(JSON.stringify({plan:immutable,sha256,summary:plan.summary,tests:report.tests},null,2));
