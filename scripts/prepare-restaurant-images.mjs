// Local encoding only. Accepted original images remain separate from formal WebP files.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const output = 'output/restaurant-publish-prep';
const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => readFileSync(path.join(root, file));
const candidateFile = 'data/restaurant-series-2026-10.json';
const reviewFile = 'data/restaurant-semantic-review-2026-10.json';
const candidate = JSON.parse(read(candidateFile));
const semantic = JSON.parse(read(reviewFile));
const decisions = JSON.parse(read('data/restaurant-visual-review-2026-10.json')).items;
mkdirSync(path.join(root, output), {recursive:true});
mkdirSync(path.join(root, 'output/restaurant-series-2026-10/images'), {recursive:true});
const images = [], reviews = [];
const canonical = JSON.parse(read('lib/image-urls.json'));
for (const entry of candidate.entries) {
  const decision = decisions.find(d => d.id === entry.id);
  const sourceFile = `output/restaurant-series-2026-10/sources/${entry.id}.png`;
  const original = read(sourceFile);
  if (decision?.decision !== 'pass' || !decision.reason?.trim() || decision.sourceSha256 !== sha(original)) {
    throw new Error(`${entry.id}: selected original needs matching individual visual review`);
  }
  const semanticReview = semantic.entries.find(d => d.kind === 'word' && d.wordId === entry.id);
  if (semanticReview?.sourceSha256 !== sha(JSON.stringify(entry))) throw new Error(`${entry.id}: semantic source changed`);
  const bytes = await sharp(original).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90,effort:6}).toBuffer();
  const contentSha256 = sha(bytes);
  const localFile = `output/restaurant-series-2026-10/images/${entry.id}-v1-${contentSha256.slice(0,12)}.webp`;
  writeFileSync(path.join(root,localFile),bytes);
  const meta = await sharp(bytes).metadata();
  if(meta.format!=='webp'||meta.width<768||meta.height<768)throw new Error(`${entry.id}: format/dimensions`);
  const storagePath = `restaurant-2026-10/${entry.id}-v1-${contentSha256.slice(0,12)}.webp`;
  const url = `https://img.nexflow.team/word-images/${storagePath}`;
  const image = {id:entry.id,sourceFile,sourceSha256:sha(original),localFile,contentSha256,bytes:bytes.length,width:meta.width,height:meta.height,mimeType:'image/webp',bucket:'word-images',storagePath,url,license:'AI-generated for Tuji',credit:'Tuji'};
  images.push(image);
  reviews.push({id:entry.id,decision:'pass',reason:decision.reason,localFile,contentSha256,sourceSha256:sha(original)});
  entry.imageUrl = url;
  semanticReview.sourceSha256 = sha(JSON.stringify(entry));
  canonical[entry.id] = url;
}
// The category cover deliberately reuses the accepted booth illustration at its own immutable object path.
const booth=images.find(i=>i.id==='restaurant-booth');
const categoryImage={...booth,id:'category:restaurant',storagePath:`restaurant-2026-10/category-restaurant-v1-${booth.contentSha256.slice(0,12)}.webp`};
categoryImage.url=`https://img.nexflow.team/word-images/${categoryImage.storagePath}`;
reviews.push({id:categoryImage.id,decision:'pass',reason:'相向長椅與餐桌表達餐廳用餐區，作為餐廳分類封面與單詞卡座共用同一已檢查插圖；沒有店名或不相關物件。',localFile:categoryImage.localFile,contentSha256:categoryImage.contentSha256,sourceSha256:categoryImage.sourceSha256});
candidate.category.imageUrl=categoryImage.url;
candidate.state='reviewed-local-candidate';
writeFileSync(path.join(root,candidateFile),JSON.stringify(candidate,null,2)+'\n');
writeFileSync(path.join(root,reviewFile),JSON.stringify(semantic,null,2)+'\n');
writeFileSync(path.join(root,'lib/image-urls.json'),JSON.stringify(canonical,null,2)+'\n');
writeFileSync(path.join(root,output,'image-manifest.json'),JSON.stringify({schemaVersion:1,series:'restaurant',images,categoryImage},null,2)+'\n');
writeFileSync(path.join(root,output,'visual-review.json'),JSON.stringify({schemaVersion:1,series:'restaurant',summary:{passedWordImages:images.length,failedWordImages:0,passedCategoryImages:1},reviews},null,2)+'\n');
const categoriesPath=path.join(root,'lib/categories.ts');
const categories=readFileSync(categoriesPath,'utf8');
const start=categories.indexOf('    id: "restaurant",');
const end=categories.indexOf('\n  },',start);
if(start<0||end<0)throw new Error('restaurant category source not found');
const block=categories.slice(start,end).replace(/imageUrl: "[^"]*"/,`imageUrl: "${categoryImage.url}"`);
writeFileSync(categoriesPath,categories.slice(0,start)+block+categories.slice(end));
console.log(JSON.stringify({wordImages:images.length,categoryImages:1,physicalStorageObjects:images.length+1}));
