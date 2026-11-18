/** Destination-specific display copy for shared topics. IDs and content stay unchanged. */
import type {Category} from '@/types';
import type {LearningDirection,UiLang} from './settings';
import {toZhHans} from './opencc';

type Copy={en:{name:string;description:string};zh:{name:string;description:string};ja:{name:string;description:string}};
const australia:Record<string,Copy>={
 office:{en:{name:'Work and Office',description:'Workplace routines, employment and office essentials.'},zh:{name:'工作與辦公',description:'職場日常、工作安排與辦公用品。'},ja:{name:'仕事とオフィス',description:'職場での仕事、勤務の予定やオフィス用品。'}},
 restaurant:{en:{name:'Restaurant',description:'Ordering, dining and payment equipment.'},zh:{name:'餐廳',description:'點餐、用餐與結帳常見的用品和設備。'},ja:{name:'レストラン',description:'注文、食事や会計で使うもの。'}},
 campus:{en:{name:'School and Student Life',description:'Campus facilities, study and student services.'},zh:{name:'校園與學生生活',description:'校園設施、學習用品與學生服務。'},ja:{name:'学校と学生生活',description:'学校の施設、学習用品や学生向けサービス。'}},
 bank:{en:{name:'Banking and Superannuation',description:'Banking, accounts and retirement savings.'},zh:{name:'銀行與退休儲蓄',description:'銀行服務、帳戶與退休儲蓄相關詞彙。'},ja:{name:'銀行と退職年金',description:'銀行サービス、口座や退職後の積立に関する言葉。'}},
 'identity-documents':{en:{name:'Documents and Tax Numbers',description:'Identity documents, certificates and tax numbers.'},zh:{name:'證件與稅務號碼',description:'身分證件、證明文件與稅務號碼。'},ja:{name:'身分証明書と納税者番号',description:'身分証明書、各種証明書や納税者番号。'}},
};

/** `zh-en` is the current explicit Australia selection. Unscoped legacy and
 * Japan requests keep their existing copies and object identity. */
export function applyAustralianCategoryCopy(category:Category,lang:UiLang,direction?:LearningDirection):Category {
 if(direction!=='zh-en')return category;
 const copy=australia[category.id];if(!copy)return category;
 const display=lang==='en'?copy.en:lang==='ja'?copy.ja:copy.zh;
 return {...category,name:copy.en.name,nameZh:lang==='zh-Hans'?toZhHans(display.name):display.name,
  description:lang==='zh-Hans'?toZhHans(display.description):display.description,descriptionEn:copy.en.description};
}
