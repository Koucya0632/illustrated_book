// Verify portable historical evidence; optionally restore exact bytes under ignored output/.
// No database client, publisher, migration, model API or upload path is imported.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const insist=(ok,message)=>{if(!ok)throw new Error(message);};
const args=new Set(process.argv.slice(2));
insist([...args].every(a=>['--restore','--media'].includes(a)),'Supported flags: --restore [--media]');
insist(!args.has('--media')||args.has('--restore'),'--media requires --restore');
const index=JSON.parse(fs.readFileSync(path.join(root,'docs/releases/winter-postal-2026-10/restoration-index.json')));
const within=(relative,prefix)=>{
  insist(typeof relative==='string'&&relative.startsWith(prefix)&&!relative.includes('..')&&!path.isAbsolute(relative),'Unsafe restoration path');
  const absolute=path.resolve(root,relative);insist(absolute.startsWith(root+path.sep),'Path escapes checkout');return absolute;
};
const check=(bytes,item)=>insist(bytes.length===item.bytes&&sha(bytes)===(item.sha256??item.contentSha256),`Historical evidence bytes differ: ${item.originalPath??item.localFile}`);
// Validate all portable files before restoring any of them.
for(const item of index.artifacts){
  check(fs.readFileSync(within(item.portablePath,'docs/releases/winter-postal-2026-10/evidence/')),item);
  const destination=within(item.originalPath,'output/winter-postal-2026-10/');
  if(args.has('--restore')&&fs.existsSync(destination))check(fs.readFileSync(destination),item);
}
let restored=0,downloaded=0;
const create=(destination,bytes)=>{
  if(fs.existsSync(destination))return;
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes,{flag:'wx'});restored++;
};
if(args.has('--restore'))for(const item of index.artifacts){
  create(within(item.originalPath,'output/winter-postal-2026-10/'),fs.readFileSync(within(item.portablePath,'docs/releases/winter-postal-2026-10/evidence/')));
}
if(args.has('--media'))for(const item of index.media){
  const destination=within(item.localFile,'output/winter-postal-2026-10/');
  if(fs.existsSync(destination)){check(fs.readFileSync(destination),item);continue;}
  const url=new URL(item.url);insist(url.protocol==='https:'&&url.hostname==='img.nexflow.team','Unexpected media host');
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  insist(response.ok,`Media HTTP ${response.status}`);
  insist(response.headers.get('content-type')?.split(';')[0].trim()===item.mimeType,'Media MIME mismatch');
  const bytes=Buffer.from(await response.arrayBuffer());check(bytes,item);create(destination,bytes);downloaded++;
}
console.log(JSON.stringify({mode:args.has('--restore')?'restored':'verified-only',verifiedArtifacts:index.artifacts.length,restoredFiles:restored,downloadedMedia:downloaded,productionWrites:0},null,2));
