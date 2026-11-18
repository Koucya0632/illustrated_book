import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {applyAustralianCategoryCopy} from '../lib/australian-category-copy';
import {localizeCategory} from '../lib/word-localize';
import type {Category} from '../types';
import type {UiLang} from '../lib/settings';
const ids=['office','restaurant','campus','bank','identity-documents'];
const base=(id:string):Category=>({id,name:`old English ${id}`,nameZh:`舊中文 ${id}`,description:`日本原描述 ${id}`,descriptionEn:`Japanese source ${id}`,emoji:'🏠',color:'blue',imageUrl:'https://example.invalid/a.webp'});
const expected:Record<UiLang,string[]>={
 'zh-Hant':['工作與辦公','餐廳','校園與學生生活','銀行與退休儲蓄','證件與稅務號碼'],
 'zh-Hans':['工作与办公','餐厅','校园与学生生活','银行与退休储蓄','证件与税务号码'],
 ja:['仕事とオフィス','レストラン','学校と学生生活','銀行と退職年金','身分証明書と納税者番号'],
 en:['Work and Office','Restaurant','School and Student Life','Banking and Superannuation','Documents and Tax Numbers'],
};
test('all five explicit Australian categories have four-language copy and preserve category identity',()=>{
 for(const lang of Object.keys(expected) as UiLang[])for(const [i,id] of ids.entries()){
  const input=base(id),out=applyAustralianCategoryCopy(input,lang,'zh-en');
  assert.equal(out.nameZh,expected[lang][i]);assert.ok(out.description);assert.doesNotMatch(out.description,/日本|Japan/i);
  for(const field of ['id','emoji','color','imageUrl'] as const)assert.equal(out[field],input[field]);
  assert.equal(out.name,expected.en[i]);assert.ok(out.descriptionEn);assert.equal(input.description,`日本原描述 ${id}`);
 }
});
test('Japan, unscoped, unknown IDs and invalid direction retain the exact baseline',()=>{
 const input=base('office');for(const direction of ['zh-ja',undefined,'invalid'] as const)assert.equal(applyAustralianCategoryCopy(input,'en',direction as never),input);
 const other=base('kitchen');assert.equal(applyAustralianCategoryCopy(other,'ja','zh-en'),other);
});
const src=ts.createSourceFile('categories-db.ts',fs.readFileSync(new URL('../lib/categories-db.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const decl=src.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='getCategoriesFromDb');assert(decl);
const js=ts.transpileModule(decl.getText(src).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function loader(db:'ok'|'absent'|'empty'|'failed'){
 const category=base('office');const row={id:'office',name:category.name,name_zh:category.nameZh,emoji:category.emoji,description:category.description,
 description_en:category.descriptionEn,color:category.color,image_url:category.imageUrl,translations:{ja:{name:'元の日本語',description:'日本の説明'}}};
 const deps={filterAustralianCategories:(cats:Category[])=>cats,variants:{},regionalCatalogueActive:false,staticCategories:[category],localizeCategory,applyAustralianCategoryCopy,
 getSql:()=>db==='absent'?null:{},readCatalogueTopics:async()=>{if(db==='failed')throw Error('db');return db==='empty'?[]:[row]}};
 return new Function(...Object.keys(deps),`${js}\nreturn getCategoriesFromDb`)(...Object.values(deps)) as (lang:UiLang,direction?:'zh-en'|'zh-ja')=>Promise<Category[]>;
}
test('DB and fallback loader apply scope after language localization without contaminating Japan',async()=>{
 for(const db of ['ok','absent','empty','failed'] as const){
  const f=loader(db),[au]=await f('zh-Hans','zh-en'),[jp]=await f('ja','zh-ja'),[legacy]=await f('zh-Hant');
  assert.equal(au.nameZh,'工作与办公');assert.equal(au.description,'职场日常、工作安排与办公用品。');
  assert.notEqual(jp.nameZh,'仕事とオフィス');assert.equal(legacy.description,'日本原描述 office');
 }
});
