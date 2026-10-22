// Evidence-bound local release ledger. No production writer.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const out='output/bank-preparation',prep='output/bank-publish-prep';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
if(fs.readdirSync(prep).some(file=>file.startsWith('apply-manifest-')&&read(`${prep}/${file}`).status==='applied'))throw Error('Bank series already published; do not overwrite its production report with a preparation report. Use the post-release audit artifacts.');
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(`${prep}/publish-plan.json`),plan=JSON.parse(bytes);
const candidate=read('data/bank-series-2026-10.json');
const audio=read('output/bank-audio-candidates/verification-report.json');
const visual=read(`${prep}/visual-review.json`),semantic=read(`${prep}/semantic-review.json`);
const preview=read(`${out}/preview-verification.json`),query=read(`${out}/category-query-probe.json`);
const tests=fs.readFileSync(`${out}/final-tests.log`,'utf8'),types=fs.readFileSync(`${out}/typecheck.log`,'utf8');
const build=fs.readFileSync(`${out}/build.log`,'utf8'),dry=fs.readFileSync(`${out}/publisher-dry-run.log`,'utf8');
const count=Number(tests.match(/tests (\d+)/)?.[1]);
if(!count||!tests.includes(`pass ${count}`)||!tests.includes('fail 0'))throw Error('test evidence incomplete');
if(types.trim()||!build.includes('Compiled successfully')||!build.includes('/word/[id]'))throw Error('type/build evidence incomplete');
if(!dry.includes('"mode": "dry-run"')||!dry.includes('"writeReady": true'))throw Error('default publisher preflight incomplete');
if(!audio.passed||audio.clipsVerified!==plan.summary.audioClips||visual.summary.passedWordImages!==plan.summary.words||visual.summary.passedCategoryImages!==1||semantic.summary.passed!==plan.summary.words*3)throw Error('review/media coverage incomplete');
if(!preview.passed||preview.cards!==plan.summary.words||preview.loadedImages!==plan.summary.words+1||!query.passed)throw Error('preview/query evidence incomplete');
for(const {file,sha256}of Object.values(plan.sources))if(sha(fs.readFileSync(file))!==sha256)throw Error(`stale source: ${file}`);
const immutable=`${prep}/publish-plan-${sha(bytes)}.json`;
if(!fs.existsSync(immutable)||!fs.readFileSync(immutable).equals(bytes))throw Error('sealed plan missing');
const images=read(`${prep}/image-manifest.json`);
const finalImages=[...images.images,images.categoryImage].map(meta=>{
 const r=visual.reviews.find(r=>r.id===meta.id);
 if(!r||r.contentSha256!==sha(fs.readFileSync(meta.localFile)))throw Error(`image review stale: ${meta.id}`);
 return{id:meta.id,verdict:'pass',reason:r.reason,localFile:meta.localFile,contentSha256:meta.contentSha256};
});
fs.writeFileSync(`${out}/final-image-review.json`,JSON.stringify({reviewer:'Codex',checkedAt:new Date().toISOString(),method:'All original PNGs inspected individually; all final word WebPs inspected in contact sheet and final category WebP individually.',contactSheetSha256:sha(fs.readFileSync(`${out}/contact-sheet.png`)),items:finalImages},null,2)+'\n');
const layers=[
 ['Published baseline','passed',`${plan.databasePreflight.publishedCount} published non-deleted main words read with SELECT. This does not audit the existing catalog.`],
 ['Candidate/category collisions','passed','No live ID, English/Japanese headword, category/translation or sentence-span collisions. Required tables present.'],
 ['Individual semantic review','passed',`${plan.summary.words} concepts and ${plan.summary.examples} examples have individual reasons bound to exact source snapshots. A2 then B1; Codex editorial review, no independent human review claimed.`],
 ['Sentence annotations','passed',`${plan.summary.spanSentences} English/Japanese sentences reconstruct exactly; all tappable spans have three-language glosses and all Japanese taps have complete kana readings.`],
 ['Local images','passed',`${plan.summary.wordImages} word images and ${plan.summary.categoryImages} cover reviewed individually. Real 1024×1024 WebP bytes, unique immutable paths, sizes and hashes checked. Prompts and selected original PNGs preserved.`],
 ['Local headword audio','passed',`${plan.summary.words*3} clips, one per en-US/en-GB/ja-JP word owner.`],
 ['Local example audio','passed',`${plan.summary.examples*3} clips, with separate example owners and exact source text. Candidate owner keys are not production example IDs.`],
 ['MP3 integrity','passed',`${audio.clipsVerified} files checked for source/locale, size, SHA-256 and complete ffmpeg decode. No complete listening audit claimed.`],
 ['Ordinary migration/fallback protection','passed','Tests exercise absent/draft/partial/deleted/wrong-category publication states, no-DB/DB-error fallbacks and synchronous helpers. Actual category SELECT executed in a read-only transaction; unreleased bank category absent.'],
 ['Tests/types/build','passed',`${count} related tests, TypeScript, Next.js build and whitespace checks passed. Ordinary production migration was not run.`],
 ['Local preview','passed',`${preview.cards} cards, ${preview.loadedImages} loaded images, ${preview.audioControls} audio controls and ${preview.tappableSpans} contextual spans verified in the browser; screenshot saved.`],
 ['Sealed publish plan / default publisher','passed','Exact source/content/media digests sealed. Default publisher performed SELECT-only preflight and matched logical database and physical R2 target fingerprints. writeReady is readiness, not authorization.'],
 ['Production publication','pending','Separate explicit Storage and DB authorization required. Reserve real example IDs in original recoverable manifest before resolving audio paths; create-only uploads and full remote byte verification precede one transaction publishing all content.'],
 ['Remote WebP/MP3 objects','pending','Nothing uploaded. Every remote object must be downloaded and hash-verified before publication and in the post-release audit.'],
 ['Both learning-direction APIs / iOS decoding','pending','New series has no live payload yet. Current iOS CardWord model inspected; no iOS source change or device test in this task.'],
 ['Category/detail routes and cache convergence','pending','After publication compare ordinary and cache-busting responses, both learning directions and routes within configured revalidation window.'],
 ['Commit/deployment','not checked','Neither performed; each requires separate authorization.'],
].map(([layer,status,detail])=>({layer,status,detail}));
const artifacts={preview:`${out}/preview.html`,screenshot:`${out}/preview-screenshot.png`,contactSheet:`${out}/contact-sheet.png`,catalogBefore:`${out}/catalog-before.json`,categoryQuery:`${out}/category-query-probe.json`,previewVerification:`${out}/preview-verification.json`,candidate:'data/bank-series-2026-10.json',spans:'data/example-spans-bank-2026-10.json',semanticReview:'data/bank-semantic-review-2026-10.json',visualReview:'data/bank-visual-review-2026-10.json',finalImageReview:`${out}/final-image-review.json`,imagePrompts:'data/bank-image-prompts-2026-10.json',imageSources:'output/bank-2026-10/sources',versionedImages:'output/bank-2026-10/images',imageManifest:`${prep}/image-manifest.json`,audioManifest:'output/bank-audio-candidates/generated-manifest.json',audioVerification:'output/bank-audio-candidates/verification-report.json',publishPlan:immutable,dryRun:`${out}/publisher-dry-run.log`,tests:`${out}/final-tests.log`,typecheck:`${out}/typecheck.log`,build:`${out}/build.log`};
for(const f of Object.values(artifacts))if(!fs.existsSync(f))throw Error(`missing ${f}`);
const ledger={schemaVersion:1,series:'bank',status:'local-preparation-complete-awaiting-production-authorization',checkedAt:new Date().toISOString(),summary:plan.summary,publishedCatalogBefore:plan.databasePreflight.publishedCount,planDigest:plan.planDigest,planFileSha256:sha(bytes),immutablePlan:immutable,applyManifest:null,productionActions:{storageUploads:0,databaseContentWrites:0,exampleIdsReserved:0,commits:0,deployments:0},layers,artifacts,references:candidate.references};
fs.writeFileSync(`${out}/release-ledger.json`,JSON.stringify(ledger,null,2)+'\n');
const link=(label,p)=>`[${label}](/Users/rex/Desktop/tuji/tuji-web/${p})`;
const doc=`# 銀行系列：本機準備完成，尚未正式發布

日期：2026-10-22（Asia/Tokyo）。正式詞庫唯讀基準為 ${plan.databasePreflight.publishedCount} 詞。

候選共 ${plan.summary.words} 詞、${plan.summary.definitions} 筆釋義、${plan.summary.examples} 個三語例句、${plan.summary.spanSentences} 條英日句子詞塊、${plan.summary.wordImages} 張詞圖、${plan.summary.categoryImages} 張分類封面、${plan.summary.audioClips} 段發音。正式發布預計建立 ${plan.summary.storageObjects} 個素材物件。

${link('本機預覽',artifacts.preview)} · ${link('圖片總覽',artifacts.contactSheet)} · ${link('瀏覽器畫面',artifacts.screenshot)}

| ID | English | 日本語 | 繁中 |
|---|---|---|---|
${candidate.entries.map(e=>`| ${e.id} | ${e.word} | ${e.ja} | ${e.chinese} |`).join('\n')}

既有 bank／銀行、bank-teller／銀行窓口係、convenience-store-atm／コンビニATM 保留。新分類不重新建立或搬移這些詞。提款卡不當成信用卡；匯款申請書與存款單分開；姓名章與既有辦公室橡皮章分開。入金伝票的名稱與格式依銀行而異，紙本存摺及印章也不是所有銀行帳戶的必要條件。

圖片使用內建 image_gen，每個資產分別生成。原始 PNG、提示全文、個別審閱理由與正式候選 WebP 分別保存；姓名章印面另做方向修正。表格圖片僅示意文件類型，鈔票僅為示意，不用於教學現行鈔票版面。所有發音使用 Chirp 3 HD，主詞與例句 owner 分開；完整解碼不等於逐段人工聽審。

## 檢查狀態與限制

| 層級 | 狀態 | 證據與限制 |
|---|---|---|
${layers.map(l=>`| ${l.layer} | ${l.status} | ${l.detail} |`).join('\n')}

## 發布與恢復清單

- ${link('封存發布計畫',immutable)}
- Plan digest: \`${plan.planDigest}\`
- 計畫檔 SHA-256: \`${ledger.planFileSha256}\`
- ${link('機器可讀狀態表',`${out}/release-ledger.json`)}

目前 apply manifest 為空，正式例句 ID 尚未預留。例句音檔路徑中的 \`{exampleId}\` 必須在取得授權後，先預留真實 ID 並寫入原始 manifest 才能解析。正式操作必須重跑唯讀預檢、比對 DB 與實體 Storage 指紋、create-only 上傳及下載全部素材驗證，最後以單一交易插入並發布整批。失敗時沿原始 manifest 恢復，不另啟不受控 apply。

## 正式操作與授權邊界

Storage 上傳 0、資料庫內容寫入 0、例句 ID 預留 0、提交 0、部署 0。僅有本機檔案製作、TTS 產生與資料庫唯讀查詢。未執行一般 migration；未修改 iOS、自製或收藏內容。工作區原有美容院、寵物用品與其他修改保留。

依 [add-tuji-atlas-series 技能](/Users/rex/.codex/skills/add-tuji-atlas-series/SKILL.md) 的明文要求："Ask for separate explicit authorization immediately before each production-changing phase." 下一階段需要授權上傳 ${plan.summary.storageObjects} 個素材並寫入／發布 ${plan.summary.words} 詞與銀行分類；提交與部署各自另行授權。正式 API、遠端素材、iOS payload、路由及快取收斂仍待發布後驗證。

## 素材與證據

${Object.entries(artifacts).map(([k,p])=>`- ${link(k,p)}`).join('\n')}

## 日本用語與外觀參考

以三菱 UFJ 的[臨櫃開戶說明](https://www.bk.mufg.jp/kouza/order/)、[振込規定](https://www.bk.mufg.jp/regulation/furikomi.html)及[表單範例](https://www.bk.mufg.jp/houjin/chohyo_kinyu.html)核對通帳、キャッシュカード、印鑑及振込依頼書用語；以製造商[ダイト紙幣計數機](https://www.daito-inc.co.jp/products_cat/note/)核對設備類型。具體圖片是否符合概念與風格，另由逐張視覺判斷記錄支持。
`;
fs.writeFileSync('docs/BANK_SERIES_2026_10.md',doc);
console.log({report:'docs/BANK_SERIES_2026_10.md',ledger:`${out}/release-ledger.json`,plan:immutable,summary:plan.summary,tests:count,productionActions:ledger.productionActions});
