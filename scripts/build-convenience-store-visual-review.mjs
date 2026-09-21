import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const prepRoot = path.join(root, "output/convenience-store-publish-prep");
const manifest = JSON.parse(fs.readFileSync(path.join(prepRoot, "image-manifest.json"), "utf8"));
const reasons = new Map(Object.entries({
  "convenience-store": "Existing catalog image clearly shows a small convenience-store exterior and remains tied to the unchanged published word.",
  "convenience-store-sign": "Freestanding illuminated sign has a generic red header and neutral blue face without brand-like stripe combinations or lettering.",
  "hot-food-display-case": "Glass heated case visibly contains fried counter snacks and is distinct from the steamed-bun and oden equipment.",
  "steamed-bun-warmer": "Compact glass steamer visibly holds round filled buns with condensation and a water reservoir.",
  "oden-warmer": "Divided stainless pot visibly holds broth and multiple oden ingredients with serving utensils.",
  "beverage-warmer": "Warm-lit enclosed cabinet holds plain cans and bottles and is visually distinct from the blue-lit refrigerator.",
  "convenience-store-coffee-machine": "Self-service bean-to-cup machine includes cup bay, dispensers, and a blank control area without branding.",
  "coffee-cup-dispenser": "Vertical holder clearly presents nested takeaway paper cups separately from the coffee machine.",
  "ice-cup": "Clear sealed cup filled with ice cubes is isolated and has no label or misleading beverage content.",
  "microwave-station": "Dedicated counter with two microwave ovens and a clean preparation surface reads as an in-store heating station.",
  "hot-water-dispenser": "Countertop insulated hot-water unit has a dispensing spout and drip tray and does not resemble the coffee machine.",
  "eat-in-area": "Small counter seating area with stools and divider clearly communicates in-store dining without people.",
  "convenience-store-atm": "Compact freestanding ATM has card, cash, and receipt openings with a blank screen and no bank branding.",
  "multifunction-copier": "Large floor copier visibly combines document feeder, platen, paper trays, and blank control panel.",
  "multimedia-kiosk": "Slim self-service terminal with blank touchscreen, printer slot, and contactless symbol is distinct from the ATM.",
  "parcel-counter": "Service counter includes a parcel scale and plain shipping boxes without carrier marks.",
  "payment-slip": "Single generic payment form has boxes and a barcode but no readable personal, merchant, or account text.",
  "prepaid-card-rack": "Counter rack contains plain color-blocked hanging cards without brands, denominations, or readable codes.",
  "tobacco-display": "Behind-counter grid holds uniformly sized blank cartons with no tobacco brands, warnings, or promotional copy.",
  "magazine-rack": "Tiered rack contains generic magazines distinguished only by solid colors and geometric cover art.",
  "newspaper-rack": "Low divided rack contains folded newspapers represented with gray layout rules and no readable headlines.",
  "umbrella-stand": "Entrance stand holds several closed wet umbrellas over a visible drip tray.",
  "sorting-bin": "Three-opening station uses only unambiguous waste, bottle-can, and paper pictograms without text.",
  "rice-ball-shelf": "Chilled case contains only triangular wrapped onigiri, clearly separated from other prepared-food shelves.",
  "bento-shelf": "Chilled case contains only compartmented meal trays with rice and side dishes under clear lids.",
  "sandwich-shelf": "Chilled case contains only triangular sandwich packs with visible egg, lettuce, and ham fillings.",
  "cup-noodle-shelf": "Selected second version shows wide sealed noodle bowls, visible curly noodles, and food illustrations rather than drink cups.",
  "chilled-food-case": "General refrigerated case combines salads, yogurt, desserts, chilled noodles, and dairy without duplicating a dedicated shelf.",
  "ice-cream-freezer": "Horizontal sliding-glass freezer visibly contains bars, cones, cups, and tubs in separate baskets.",
  "drink-refrigerator": "Tall glass-door case uses cool lighting and holds plain bottles, cartons, and cans, clearly indicating chilled drinks.",
  "wet-towel-dispenser": "Small countertop holder contains individually wrapped flat wet-towel packets with only a pale blue band.",
  "disposable-chopsticks-dispenser": "Counter holder contains individually wrapped pairs of visible wooden chopsticks and no other utensils.",
  "plastic-cutlery-dispenser": "Divided holder clearly separates wrapped plastic spoons and forks and contains no chopsticks.",
  "cash-register": "Complete POS setup includes blank displays, scanner, receipt printer, cash drawer, and payment terminal.",
}));

const reviews = [];
for (const image of manifest.images) {
  const reason = reasons.get(image.id);
  if (!reason) throw new Error(`${image.id}: missing concrete review reason`);
  const localFile = path.join(root, image.localFile);
  const metadata = await sharp(localFile).metadata();
  if (metadata.format !== "webp") throw new Error(`${image.id}: expected WebP`);
  if (image.mode === "new-ai-generated" && (metadata.width !== 1200 || metadata.height !== 1200)) {
    throw new Error(`${image.id}: new image must be 1200 x 1200`);
  }
  reviews.push({
    id: image.id,
    decision: "pass",
    conceptMatch: true,
    japanContextMatch: true,
    pureWhiteOrExistingBackgroundAccepted: true,
    noPeople: true,
    noBrandMarks: true,
    noReadableOrPseudoText: true,
    noCropping: true,
    reason,
    localFile: image.localFile,
    contentSha256: image.contentSha256,
  });
}

const categoryMetadata = await sharp(path.join(root, manifest.category.localFile)).metadata();
if (categoryMetadata.width !== 1200 || categoryMetadata.height !== 1200) {
  throw new Error("category image must be 1200 x 1200");
}

const review = {
  schemaVersion: 1,
  series: "convenience-store",
  state: "candidate-visual-review-complete",
  productionWriteAllowed: false,
  reviewedAt: new Date().toISOString(),
  summary: {
    passedWordImages: reviews.length,
    failedWordImages: 0,
    passedCategoryImages: 1,
    rejectedAttempts: manifest.rejectedAttempts.length,
  },
  reviews,
  category: {
    id: "convenience-store",
    decision: "pass",
    reason: "Selected second version is a sparse Japanese convenience-store equipment vignette with blank screens, plain bottles, empty accessory shelves, and no pseudo-text or brand-like signage.",
    noPeople: true,
    noBrandMarks: true,
    noReadableOrPseudoText: true,
    noCropping: true,
    localFile: manifest.category.localFile,
    contentSha256: manifest.category.contentSha256,
  },
  rejectedAttempts: manifest.rejectedAttempts,
};

const outputFile = path.join(prepRoot, "visual-review.json");
fs.writeFileSync(outputFile, `${JSON.stringify(review, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, ...review.summary }, null, 2));
