// Local files only. No Storage uploads or database mutations.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const base='output/concert-fan-support-2026-10',prep='output/concert-fan-support-publish-prep';
const read=p=>JSON.parse(fs.readFileSync(p));const hash=b=>createHash('sha256').update(b).digest('hex');
const candidate=read('data/concert-fan-support-series-2026-10.json');
const decisions=read('data/concert-fan-support-visual-review-2026-10.json').items;
const ids=[...candidate.entries.map(e=>e.id),'category-concert-fan-support'];
if(decisions.length!==ids.length||new Set(decisions.map(d=>d.id)).size!==ids.length)throw Error('visual review coverage mismatch');
const images=[],reviews=[];fs.mkdirSync(`${base}/images`,{recursive:true});fs.mkdirSync(prep,{recursive:true});
for(const id of ids){
 const sourceFile=`${base}/sources/${id}.png`,original=fs.readFileSync(sourceFile),decision=decisions.find(d=>d.id===id);
 if(decision?.decision!=='pass'||!decision.reason?.trim()||decision.sourceSha256!==hash(original))throw Error(`${id}: missing or stale individual visual review`);
 const bytes=await sharp(original).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90,effort:6}).toBuffer();
 const contentSha256=hash(bytes),localFile=`${base}/images/${id}-v1-${contentSha256.slice(0,12)}.webp`;
 const storagePath=`concert-fan-support-2026-10/${id}-v1-${contentSha256.slice(0,12)}.webp`;
 fs.writeFileSync(localFile,bytes);const meta=await sharp(bytes).metadata();
 if(meta.format!=='webp'||meta.width<768||meta.height<768||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw Error(`${id}: invalid WebP`);
 const image={id:id.startsWith('category-')?'category:concert-fan-support':id,sourceFile,sourceSha256:hash(original),localFile,contentSha256,bytes:bytes.length,width:meta.width,height:meta.height,mimeType:'image/webp',bucket:'word-images',storagePath,url:`https://img.nexflow.team/word-images/${storagePath}`,license:'AI-generated for Tuji',credit:'Tuji'};
 images.push(image);reviews.push({id:image.id,decision:'pass',reason:decision.reason,localFile,contentSha256,sourceSha256:hash(original)});
}
const categoryImage=images.pop(),canonical=read('lib/image-urls.json');
if(new Set(images.map(i=>i.storagePath)).size!==candidate.entries.length)throw Error('duplicate image paths');
for(const entry of candidate.entries){const image=images.find(i=>i.id===entry.id);entry.imageUrl=image.url;canonical[entry.id]=image.url;}
candidate.category.imageUrl=categoryImage.url;candidate.state='reviewed-local-candidate';
for(const[file,value]of [['data/concert-fan-support-series-2026-10.json',candidate],['lib/image-urls.json',canonical],[`${prep}/image-manifest.json`,{schemaVersion:1,series:'concert-fan-support',images,categoryImage}],[`${prep}/visual-review.json`,{schemaVersion:1,series:'concert-fan-support',summary:{passedWordImages:images.length,failedWordImages:0,passedCategoryImages:1},reviews}]])fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
console.log({wordImages:images.length,categoryImages:1});
