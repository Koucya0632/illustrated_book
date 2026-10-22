// A local review document; no network, uploads or database writes.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const candidate=read('data/emergency-kit-series-2026-10.json');
const media=read('output/emergency-kit-publish-prep/image-manifest.json');
const audio=read('output/emergency-kit-audio-candidates/generated-manifest.json');
const output='output/emergency-kit-preparation';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageById=new Map(media.images.map(i=>[i.id,i]));
const imagePath=id=>path.relative(output,imageById.get(id).localFile);
const clips=(kind,owner)=>['ja-JP','en-US','en-GB'].map(locale=>{
 const clip=audio.generated[`${kind}|${owner}|${locale}`];
 const src=path.relative(output,path.join('output/emergency-kit-audio-candidates',clip.file));
 return `<label>${{'ja-JP':'日語','en-US':'美式英語','en-GB':'英式英語'}[locale]}<audio controls preload="none" src="${escape(src)}"></audio></label>`;
}).join('');
const cards=candidate.entries.map((e,index)=>`<article><img class="word-image" src="${escape(imagePath(e.id))}" alt="${escape(e.chinese)}"><div><small>${index+1} / ${candidate.entries.length}</small><h2>${escape(e.chinese)}</h2><h3>${escape(e.ja)} <small>${escape(e.jaReading)}</small></h3><p>${escape(e.word)} <small>${escape(e.pronunciation)}</small></p><p>${escape(e.chineseDefinition)}</p><div class="audio">${clips('headword',e.id)}</div>${e.examples.map((ex,slot)=>`<section><b>${slot?'進階例句 · B1':'簡單例句 · A2'}</b><p lang="ja">${escape(ex.ja)}</p><p>${escape(ex.en)}</p><p>${escape(ex.zh)}</p><div class="audio">${clips('example',`${e.id}:${slot}`)}</div></section>`).join('')}</div></article>`).join('');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(`${output}/preview.html`,`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>防災包系列 · 本機預覽</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#183b40;background:#f6faf9;margin:0}header,main{max-width:1200px;margin:auto;padding:32px}header img{width:220px;float:right;border-radius:16px}h1{font-size:38px}small{font-size:13px;color:#657f81}article{background:white;border:1px solid #e0eae7;border-radius:20px;padding:24px;display:grid;grid-template-columns:280px 1fr;gap:30px;margin:24px 0;break-inside:avoid}.word-image{width:100%;position:sticky;top:16px}h2{margin:0}h3{margin:8px 0}section{border-top:1px solid #e0eae7;padding:18px 0}p{margin:7px 0}.audio{display:flex;gap:12px;flex-wrap:wrap}label{font-size:12px;color:#657f81}audio{display:block;width:220px;height:32px}@media(max-width:750px){article{display:block}.word-image{position:static;width:220px}header img{float:none}}</style><header><img alt="防災包封面" src="${escape(path.relative(output,media.categoryImage.localFile))}"><h1>防災包</h1><p>${candidate.entries.length} 個詞目 · ${candidate.entries.length*2} 句三語例句 · ${Object.keys(audio.generated).length} 段日語／美式／英式發音</p><p>本機候選預覽。尚未上傳或正式發布。</p><p>避難攜行用品與日本常見防災用品；保留既有毛毯、罐頭及一般手套詞目。</p></header><main>${cards}</main></html>`);
const cellW=260,cellH=310,columns=5;
const layers=[];
for(const[eIndex,e]of candidate.entries.entries()){
 const left=(eIndex%columns)*cellW,top=Math.floor(eIndex/columns)*cellH;
 const png=await sharp(imageById.get(e.id).localFile).resize(240,240).png().toBuffer();
 layers.push({input:png,left:left+10,top});
 const label=Buffer.from(`<svg width="260" height="65"><rect width="260" height="65" fill="white"/><text x="130" y="22" text-anchor="middle" font-family="Arial" font-size="14" fill="#183b40">${eIndex+1}. ${escape(e.id)}</text><text x="130" y="46" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#183b40">${escape(e.ja)}</text></svg>`);
 layers.push({input:label,left,top:top+240});
}
await sharp({create:{width:cellW*columns,height:cellH*Math.ceil(candidate.entries.length/columns),channels:3,background:'white'}}).composite(layers).png().toFile(`${output}/contact-sheet.png`);
console.log({preview:`${output}/preview.html`,contactSheet:`${output}/contact-sheet.png`});
