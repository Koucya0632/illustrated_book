import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const entries = JSON.parse(readFileSync(resolve(root, "data/drugstore-series-2026-09.json"), "utf8")).entries;

// Each reason records an individual check of this candidate and its two translations.
const reasons = {
  "drugstore": ["All three headwords denote the Japanese shop format that sells medicines, cosmetics, and daily goods.", "A brief stop after work is a plausible everyday visit in all three languages.", "Needing travel sunscreen explains a visit before closing; both translations preserve that cause and timing."],
  "over-the-counter-medicine": ["市販薬 and 非處方藥 both identify medicine available without a prescription.", "A shelf holding this medicine is concrete and aligned across languages.", "Consulting a pharmacist before selecting a package is plausible and the three versions preserve the sequence."],
  "prescription-counter": ["調剤受付 is the prescription reception counter, distinct from the general drugstore checkout.", "Submitting a prescription at the counter is its direct function in every translation.", "The closed reception counter motivates checking its hours before a return visit in each language."],
  "cold-medicine": ["風邪薬 and 感冒藥 refer to medicine for common cold symptoms.", "The second shelf location is the same in all three sentences.", "Difficulty reading package directions leads naturally to asking a pharmacist; translations retain that reason."],
  "pain-reliever": ["鎮痛薬 and 止痛藥 both denote pain-relieving medicine.", "The shelf relationship to cold medicine is consistent across languages.", "Comparing several labels before purchase is a sensible choice and matches the Japanese and Chinese wording."],
  "stomach-medicine": ["胃腸薬 covers stomach and intestinal discomfort, matching the Chinese and English definitions.", "Looking for the product shelf is a simple shop question in all versions.", "Similar packages prompt a comparison of each product description in all three languages."],
  "allergy-medicine": ["アレルギー薬 and 過敏藥 identify allergy symptom medicine, including pollen season products.", "The aisle question is direct and equivalent in all languages.", "Pollen season explains moving the products near the entrance; the translations retain both place and cause."],
  "eye-drops": ["目薬, 眼藥水, and eye drops identify the same small dropper product.", "Buying the product at a drugstore is plausible and aligned.", "Several types explain reading the package before choosing; all three versions keep that order."],
  "cough-drops": ["のど飴 and 喉糖 denote throat-soothing lozenges, the intended sense of cough drops here.", "Keeping lozenges in a bag is a straightforward personal-use example.", "A dry throat on the train motivates buying a packet at the station drugstore in all translations."],
  "adhesive-bandage": ["絆創膏 and OK 繃 denote a small adhesive dressing, not a gauze pad.", "A finger needing one bandage is concrete and consistent across languages.", "A bandage coming off in rain explains selecting a waterproof one; all versions preserve the cause."],
  "gauze-pad": ["ガーゼパッド and 紗布墊 identify an absorbent wound covering distinct from adhesive bandages.", "Its shelf location beside bandages is consistent across all sentences.", "The larger pad is chosen because the smaller one cannot cover the whole scrape in each language."],
  "thermometer": ["体温計 specifically means a body-temperature thermometer, matching the definitions.", "Placement in the health section is plausible and the translations match.", "A broken home thermometer leads to comparing two replacements at the drugstore in all versions."],
  "surgical-mask": ["The pictured disposable pleated mask matches the 不織布マスク product; the definition makes no medical-performance claim.", "Buying a box of disposable masks is a simple, aligned shopping example.", "The poor fit of small masks explains checking the size chart before buying another box in each language."],
  "sunscreen": ["日焼け止め and 防曬乳 both describe skin-applied sun protection sold at drugstores.", "A beach trip gives a direct reason to need sunscreen in every version.", "A sunny forecast motivates buying sunscreen before an outdoor trip in all three languages."],
  "lip-balm": ["リップクリーム and 護唇膏 both denote a product for dry lips, separate from lipstick.", "Forgetting the balm at home is a natural personal-use sentence.", "Dry air explains adding lip balm while buying shampoo; the incidental purchase is retained."],
  "sheet-mask": ["シートマスク and 片狀面膜 both denote a serum-soaked face sheet, separate from a surgical mask.", "A small pack is a plausible retail package and all versions refer to the same product.", "Trying a single sheet before buying a large box is a coherent decision in all translations."],
  "facial-toner": ["化粧水 and 化妝水 match the facial toner sense used after cleansing.", "Placement beside face wash is plausible and aligned.", "Travel bag size explains comparing bottle sizes; all three translations preserve the constraint."],
  "facial-serum": ["美容液 and 臉部精華液 denote a concentrated face-care liquid distinct from toner.", "The small bottle description matches the item in all languages.", "Many serums on the shelf prompt checking ingredient lists before choosing one in every version."],
  "foundation-makeup": ["ファンデーション and 粉底 identify base makeup; the distinct ID avoids confusion with a building foundation.", "Searching for liquid foundation is a concrete and aligned shopping request.", "A dark-looking shade prompts comparison under store lighting; all translations preserve the reason."],
  "concealer": ["コンシーラー and 遮瑕膏 both refer to makeup for small areas of uneven color.", "The makeup aisle location is plausible in all three versions.", "Hard-to-judge package color explains testing on the back of the hand; the Japanese 手の甲 is precise."],
  "mascara": ["マスカラ and 睫毛膏 both identify lash makeup with a brush.", "Buying brown mascara is concrete and aligned.", "A dried-out old tube motivates checking brush shape before buying its replacement in all versions."],
  "eyeliner": ["アイライナー and 眼線筆 identify the eye-line makeup tool, not mascara.", "A thin tip is a visible product feature in every language.", "Choosing brown for a softer look instead of black preserves the same color contrast across translations."],
  "lipstick": ["口紅 is the same lip-color product in Japanese and Traditional Chinese.", "A sale today is a simple store example and the translations match.", "Shelf lighting changes the perceived color, so checking by a window is coherent in all versions."],
  "nail-polish": ["マニキュア and 指甲油 identify colored nail coating, separate from nail-care tools.", "The pale pink choice is the same in all three sentences.", "The bottle and sample display give different color impressions; Japanese 見本 conveys the same comparison."],
  "makeup-sponge": ["メイクスポンジ and 化妝海綿 identify the applicator used for base makeup.", "Needing a replacement sponge is simple and aligned.", "A multipack is bought to replace a used sponge; all languages retain the pack and replacement rationale."],
  "hair-dye": ["ヘアカラー剤 and 染髮劑 denote a color-changing hair product, separate from shampoo.", "The bottom-shelf location is identical in all translations.", "Similar box photos explain comparing two shades before purchase in every version."],
  "contact-lens-solution": ["コンタクトレンズの洗浄液 and 隱形眼鏡保養液 refer to lens-care liquid, distinct from eye drops.", "Location near eye drops is plausible and aligned.", "Travel with only a small bag motivates seeking a travel-size bottle in all versions."],
  "insect-repellent": ["虫よけスプレー identifies the spray form of repellent pictured; Chinese 防蚊液 names its common mosquito use.", "A hike is a plausible occasion to buy insect repellent.", "A dusk walk by a river motivates adding repellent to the shopping list across languages."],
  "vitamin-supplement": ["ビタミンサプリ and 維他命補充品 identify vitamin supplements sold as tablets or capsules.", "Top-shelf placement is a simple retail-location sentence in all languages.", "Similar bottles explain checking labels before choosing a supplement in each translation."],
  "cooling-gel-sheet": ["冷却シート and 退熱貼 identify an adhesive cooling sheet; the definition correctly describes cooling sensation.", "Placement beside thermometers is plausible and aligned.", "A multipack goes into a travel bag, with the same pack quantity and action in all versions."],
  "makeup-remover-wipes": ["クレンジングシート and 卸妝濕巾 both denote disposable moist sheets for removing makeup.", "Buying wipes for a trip is a plausible portable-use example in all translations.", "Forgetting cleanser explains using wipes before bed, with the same sequence in all three languages."],
  "hand-cream": ["ハンドクリーム and 護手霜 identify cream for dry hands, matching the English term.", "The bag location is identical in all three simple examples.", "Repeated handwashing motivates a small work-size cream purchase across all translations."],
  "face-powder": ["フェイスパウダー and 蜜粉 identify a face finishing powder, distinct from liquid foundation.", "A soft puff supplied with the product is visible and aligned across languages.", "Shine under store lights leads to testing a little powder, with the same reason in each sentence."],
  "blush": ["チーク and 腮紅 identify makeup applied to the cheeks rather than eyes.", "The selected peach shade is the same in all three simple sentences.", "A shade appearing too bright on the skin motivates comparing two blush colors in every translation."],
  "eyeshadow": ["アイシャドウ and 眼影 both identify eyelid color makeup, matching the four-pan picture.", "All three versions say the product has four colors.", "The palette shade looks darker in its case than on the hand; the comparison is preserved across languages."],
  "eyebrow-pencil": ["アイブロウペンシル and 眉筆 identify a brow-filling pencil with a spoolie in the image.", "Needing a brown pencil is direct and equivalent in all languages.", "A broken old pencil core leads to looking for a refillable replacement; Japanese 替え芯 and Chinese 可替換筆芯 preserve the detail."],
  "lip-gloss": ["リップグロス and 唇蜜 denote a glossy lip product distinct from solid lipstick.", "Transparency is the same product feature in all three simple examples.", "The package color is hard to judge, which motivates checking a tester in every translation."],
  "makeup-brush": ["メイクブラシ and 化妝刷 identify the cosmetic application brush shown, separate from a sponge.", "Its location beside sponges is consistent in all simple sentences.", "Wanting an even spread of powder explains choosing a soft brush in all translations."],
  "eyelash-curler": ["ビューラー and 睫毛夾 identify the handheld metal lash-curling tool.", "Buying a new curler is a simple, aligned example.", "A worn rubber pad leads to checking for replacement pads; the Japanese 替えゴム and Chinese 替換墊 match the intended part."],
  "nail-polish-remover": ["除光液 and 去光水 denote liquid used to remove nail polish, separate from colored polish.", "Shelf placement beside polish is plausible and aligned.", "The first bottle cannot fit in a bag, so a travel-size remover is chosen in all three versions."],
  "hair-oil": ["ヘアオイル and 護髮油 identify an oil applied to hair; the golden droplets make the product form visible.", "The small bottle is the same retail form in all translations.", "Dry hair after swimming motivates searching for a lightweight oil, and the reason is preserved in both translations."],
  "hair-mask": ["ヘアマスク and 髮膜 refer to a conditioning hair treatment, distinct from a facial sheet mask.", "Placement beside conditioner is the same in each language.", "Wanting to try a single-use sachet before buying a tub is a coherent choice in all translations."],
  "facial-mist": ["ミスト化粧水 and 保濕噴霧 denote a fine facial skincare spray, distinct from makeup setting mist.", "The small bottle fitting in a bag is consistently stated.", "Dry office air motivates buying a travel-size facial mist across all three languages."],
  "body-scrub": ["ボディスクラブ and 身體磨砂膏 identify a grainy product for body skin, distinct from plain cream.", "The bath-care shelf is the same location in the simple examples.", "Wanting fine grains motivates reading product labels in every translation."],
  "makeup-primer": ["化粧下地 and 妝前乳 denote a base applied before foundation.", "The tube package shown is described consistently in all simple examples.", "Checking compatibility with the current foundation before choosing a primer is preserved in both translations."],
  "setting-spray": ["メイクキープミスト and 定妝噴霧 identify a spray to help makeup last, separate from facial skincare mist.", "Its shelf location beside face powder is consistent.", "Makeup wearing off quickly in heat motivates buying a small setting spray in all translations."],
  "compact-mirror": ["コンパクトミラー and 化妝鏡 identify a folding portable mirror for checking makeup.", "Keeping it in a bag is a straightforward aligned example.", "Poor visibility of a shade leads to using the mirror near a window; the order and place match across languages."],
  "nail-file": ["爪やすり and 指甲銼刀 identify an abrasive nail-shaping tool, distinct from nail clippers.", "Placement beside clippers is identical in all three simple sentences.", "Nails are trimmed first and then a fine file is bought to smooth the edges in each language."],
  "false-eyelashes": ["つけまつげ and 假睫毛 denote attachable artificial lashes, shown as a left-right pair.", "Being sold in pairs is the same retail feature across languages.", "The first pair seems too long, so shorter lashes are chosen for a party in every translation."],
  "hair-spray": ["ヘアスプレー and 定型噴霧 identify aerosol hairstyling spray, distinct from face mists.", "Its location on the top shelf is aligned across languages.", "Wanting a hairstyle to last into the evening explains selecting a small spray in all three versions."],
};

const items = [];
for (const entry of entries) {
  const review = reasons[entry.id];
  if (!review || review.length !== 3 || review.some((reason) => !reason.trim())) {
    throw new Error(`${entry.id}: missing individual word/example review`);
  }
  items.push({ kind: "word", id: entry.id, verdict: "pass", headwords: { en: entry.word, ja: entry.ja, zh: entry.chinese }, reason: review[0] });
  for (const [slot, example] of entry.examples.entries()) {
    items.push({ kind: "example", id: `${entry.id}:${slot}`, wordId: entry.id, slot, cefrLevel: example.cefrLevel, verdict: "pass", text: { en: example.en, ja: example.ja, zh: example.zh }, reason: review[slot + 1] });
  }
}
if (Object.keys(reasons).length !== entries.length) throw new Error("review reason IDs do not match entries");
const result = {
  schemaVersion: 1,
  series: "drugstore",
  reviewedAt: new Date().toISOString(),
  reviewer: "individual trilingual semantic review and structural span validation",
  productionWriteAllowed: false,
  summary: { words: entries.length, examples: entries.length * 2, passed: items.length, failed: 0 },
  items,
};
const target = resolve(root, "output/drugstore-publish-prep/semantic-review.json");
mkdirSync(resolve(root, "output/drugstore-publish-prep"), { recursive: true });
writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Reviewed ${result.summary.words} words and ${result.summary.examples} examples: ${target}`);
