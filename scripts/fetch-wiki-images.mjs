// One-shot script: look up each word in the Wikipedia REST API and record
// the canonical thumbnail URL. Output written to lib/image-urls.json.
//
//   node scripts/fetch-wiki-images.mjs
//
// Re-run any time you add a new word or want to refresh URLs.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "lib", "image-urls.json");

// id → Wikipedia article title. Picked to land on a canonical photo of the
// object (avoiding disambiguation pages / mismatches).
const WIKI_TITLES = {
  // Kitchen
  fridge: "Refrigerator",
  microwave: "Microwave_oven",
  oven: "Oven",
  stove: "Kitchen_stove",
  sink: "Sink",
  faucet: "Tap_(valve)",
  pan: "Frying_pan",
  pot: "Cookware_and_bakeware",
  "cutting-board": "Cutting_board",
  knife: "Kitchen_knife",
  bowl: "Bowl",
  plate: "Plate_(dishware)",
  chopsticks: "Chopsticks",
  spoon: "Spoon",
  mug: "Mug",
  // Bathroom
  toothbrush: "Toothbrush",
  toothpaste: "Toothpaste",
  towel: "Towel",
  soap: "Soap",
  shampoo: "Shampoo",
  shower: "Shower",
  mirror: "Mirror",
  toilet: "Toilet",
  comb: "Comb",
  "hair-dryer": "Hair_dryer",
  // Bedroom
  bed: "Bed",
  pillow: "Pillow",
  blanket: "Blanket",
  closet: "Closet",
  lamp: "Electric_light",
  "alarm-clock": "Alarm_clock",
  curtain: "Curtain",
  wardrobe: "Wardrobe",
  // Living Room
  sofa: "Couch",
  tv: "Television_set",
  remote: "Remote_control",
  "coffee-table": "Coffee_table",
  rug: "Carpet",
  clock: "Clock",
  "picture-frame": "Picture_frame",
  // Office
  desk: "Desk",
  laptop: "Laptop",
  keyboard: "Computer_keyboard",
  mouse: "Computer_mouse",
  monitor: "Computer_monitor",
  notebook: "Notebook",
  pen: "Pen",
  stapler: "Stapler",
  printer: "Printer_(computing)",
  // Street
  "traffic-light": "Traffic_light",
  crosswalk: "Pedestrian_crossing",
  sidewalk: "Sidewalk",
  "street-sign": "Street_name_sign",
  bench: "Bench_(furniture)",
  streetlight: "Street_light",
  "trash-can": "Waste_container",
  mailbox: "Letter_box",
  // Supermarket
  "shopping-cart": "Shopping_cart",
  basket: "Shopping_basket",
  cashier: "Cashier",
  receipt: "Receipt",
  aisle: "Aisle",
  shelf: "Shelf_(storage)",
  bag: "Plastic_bag",
  "price-tag": "Price_tag",
  // Transportation
  car: "Car",
  bus: "Bus",
  bicycle: "Bicycle",
  motorcycle: "Motorcycle",
  train: "Train",
  airplane: "Airplane",
  boat: "Boat",
  taxi: "Taxicab",
  subway: "Rapid_transit",
  // Seasonings
  salt: "Salt",
  sugar: "Sugar",
  pepper: "Black_pepper",
  "black-pepper": "Black_pepper",
  "white-pepper": "White_pepper",
  "soy-sauce": "Soy_sauce",
  vinegar: "Vinegar",
  "rice-vinegar": "Rice_vinegar",
  "chili-sauce": "Chili_sauce",
  "chili-powder": "Chili_powder",
  "chili-flakes": "Crushed_red_pepper",
  mustard: "Mustard_(condiment)",
  ketchup: "Ketchup",
  mayonnaise: "Mayonnaise",
  "oyster-sauce": "Oyster_sauce",
  "fish-sauce": "Fish_sauce",
  "sesame-oil": "Sesame_oil",
  "olive-oil": "Olive_oil",
  "cooking-wine": "Huangjiu",
  msg: "Monosodium_glutamate",
  "garlic-powder": "Garlic_powder",
  "onion-powder": "Onion_powder",
  "curry-powder": "Curry_powder",
  "five-spice-powder": "Five-spice_powder",
  cinnamon: "Cinnamon",
  cumin: "Cumin",
  cilantro: "Coriander",
  basil: "Basil",
  rosemary: "Salvia_rosmarinus",
  thyme: "Thyme",
  "bay-leaf": "Bay_leaf",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWikiImage(title, attempt = 1) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "EEPDImageScript/1.0 (educational; contact: local)" },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`HTTP ${res.status} after ${attempt} attempts`);
    const wait = 1500 * 2 ** (attempt - 1); // 1.5s, 3s, 6s, 12s
    await sleep(wait);
    return fetchWikiImage(title, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.originalimage?.source || data.thumbnail?.source || null;
}

async function main() {
  // Resume: keep URLs already saved, only re-fetch missing/empty entries.
  const result = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, "utf8"))
    : {};

  let ok = 0;
  let miss = 0;
  let skipped = 0;

  for (const [id, title] of Object.entries(WIKI_TITLES)) {
    if (result[id]) {
      skipped++;
      continue;
    }
    try {
      const url = await fetchWikiImage(title);
      if (url) {
        result[id] = url;
        ok++;
        console.log(`✓ ${id.padEnd(18)} → ${title}`);
      } else {
        miss++;
        console.log(`✗ ${id.padEnd(18)} (no image for "${title}")`);
      }
    } catch (err) {
      miss++;
      console.log(`✗ ${id.padEnd(18)} (${err.message})`);
    }
    // Save progress incrementally so partial runs are not lost.
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    // Pace ourselves — Wikipedia REST has aggressive rate limits.
    await sleep(500);
  }

  console.log(
    `\nWrote ${Object.keys(result).length} URLs to ${OUT_PATH}  (new=${ok}, miss=${miss}, kept=${skipped})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
