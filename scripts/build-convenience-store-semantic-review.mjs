import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const entries = ["a", "b"].flatMap((batch) =>
  JSON.parse(fs.readFileSync(path.join(root, `data/convenience-store-series-2026-09-batch-${batch}.json`), "utf8")).entries,
);

const evidence = {
  "convenience-store": ["The English, Japanese コンビニ, and Traditional Chinese headwords all denote the same long-hours neighborhood retail format.", "Buying water is a natural quick visit; the closed station cafe gives a clear reason to buy breakfast there."],
  "convenience-store-sign": ["All definitions identify the illuminated exterior or roadside marker used to find the store.", "Seeing it from the road is an A2 recognition task; its light making the entrance easy to find supplies a coherent B1 cause."],
  "hot-food-display-case": ["The definitions consistently describe a heated glass case for visible counter snacks such as fried chicken and croquettes.", "Locating fried chicken is simple and concrete; choosing a croquette upon reaching the counter matches the fixture's actual use."],
  "steamed-bun-warmer": ["The concept is a steam-heated glass cabinet for nikuman and anman, not a generic oven or hot-food case.", "Its position by the register is plausible; cold weather naturally motivates buying a pork bun from it."],
  "oden-warmer": ["Each language describes the divided heated broth pot used to hold oden ingredients at the counter.", "Daikon simmering identifies the equipment; ordering egg and konjac after looking inside reflects normal service."],
  "beverage-warmer": ["The definitions agree on a heated cabinet for canned or bottled drinks and distinguish it from refrigeration.", "Taking warm tea is direct; cold hands motivate selecting hot canned coffee."],
  "convenience-store-coffee-machine": ["All languages define the self-service machine used after purchasing a dedicated cup.", "Placing the cup is the essential first action; paying first and selecting iced coffee gives the correct sequence."],
  "coffee-cup-dispenser": ["The headwords and definitions consistently identify a holder that stores and dispenses takeaway cups.", "Finding small cups there is concrete; an empty dispenser reasonably leads to asking for a medium cup."],
  "ice-cup": ["The concept is a sealed cup prefilled with ice for making a cold drink, not a cup of finished coffee.", "Buying it for iced coffee states its purpose; removing the lid before placing it under the machine preserves the real workflow."],
  "microwave-station": ["The definitions identify the customer heating area with convenience-store microwave ovens and a counter.", "Heating lunch is the primary use; waiting when one microwave is occupied adds a realistic B1 condition."],
  "hot-water-dispenser": ["All definitions identify the self-service hot-water unit used for cup noodles or drinks.", "Filling a cup is clear; opening the noodle lid halfway before dispensing water captures the normal preparation step."],
  "eat-in-area": ["The concept is the small seating area where customers consume store purchases on site.", "Eating lunch is direct; rain explains drinking coffee there before leaving."],
  "convenience-store-atm": ["Each definition describes an in-store automated banking terminal for withdrawals and supported deposits.", "Withdrawing cash is the basic function; a closed bank motivates using the store ATM to deposit money."],
  "multifunction-copier": ["The definitions consistently cover the large self-service copier that can print documents and other media.", "Printing one document is simple; a broken home printer motivates transferring a file by USB."],
  "multimedia-kiosk": ["All languages identify the in-store reservation and ticket-service terminal, distinct from an ATM or copier.", "Reserving a ticket is central; entering a reservation number and taking the printed slip to the register gives the expected sequence."],
  "parcel-counter": ["The concept is the staffed convenience-store counter accepting parcels for delivery.", "Taking a box there is concrete; writing the address on the shipping label beforehand is the correct preparatory action."],
  "payment-slip": ["The definitions agree on a barcode-bearing bill or payment form that can be paid at the register.", "Handing it to the clerk is the core interaction; a same-day due date motivates paying on the way home."],
  "prepaid-card-rack": ["The English term maps to Japan's POSA card sales area and the definitions explain register activation.", "Its position near the register is plausible; selecting a card and asking for activation at a gift amount reflects variable-value cards."],
  "tobacco-display": ["All definitions identify the numbered behind-counter fixture for tobacco packs without promoting tobacco use.", "Its location behind the counter is factual; the clerk checks a number before retrieving the requested pack."],
  "magazine-rack": ["The concept is a tiered retail rack for magazines and is distinct from the lower newspaper rack.", "A travel magazine on the rack is clear; browsing new titles while waiting is a natural store action."],
  "newspaper-rack": ["The definitions consistently describe the divided entrance-area fixture for folded newspapers.", "Taking one newspaper is simple; a sold-out morning edition explains an empty compartment."],
  "umbrella-stand": ["All languages identify the drip-catching entrance stand for customers' wet umbrellas.", "Putting in a wet umbrella states the purpose; checking for the blue umbrella brought earlier prevents taking the wrong one."],
  "sorting-bin": ["The concept is the multi-opening waste and recycling station used to separate cups, bottles, and other trash.", "Discarding an empty bottle is direct; checking the sorting labels before throwing away a cup shows the intended behavior."],
  "rice-ball-shelf": ["All definitions identify the refrigerated shelf dedicated to wrapped onigiri.", "Choosing salmon is concrete; sold-out tuna motivates looking for another filling along the same shelf."],
  "bento-shelf": ["The concept is the chilled shelf holding packaged complete meals, not the general chilled-food case.", "Locating curry bento is simple; comparing two meals and selecting grilled fish is a realistic choice."],
  "sandwich-shelf": ["All languages identify the refrigerated shelf for packaged sandwiches.", "Finding an egg sandwich is direct; wanting a light breakfast explains checking sandwiches instead of bento."],
  "cup-noodle-shelf": ["The definitions consistently identify the dry-goods shelf for sealed instant noodle cups.", "Locating curry noodles is simple; choosing noodles before using the nearby hot-water dispenser gives the correct sequence."],
  "chilled-food-case": ["The concept is the general refrigerated case for salads, yogurt, desserts, and other chilled foods.", "Yogurt placement is direct; noticing a same-day use-by date explains returning a dessert to the case."],
  "ice-cream-freezer": ["All definitions identify the horizontal frozen case for ice-cream bars, cups, and tubs.", "Taking a popsicle is clear; finding a flavor that was sold out the prior week creates a coherent B1 event."],
  "drink-refrigerator": ["The concept is the cool-lit glass-door case for chilled bottled and canned drinks, not the beverage warmer.", "Taking cold water states its purpose; choosing a bottle from the colder back row is plausible restocking behavior."],
  "wet-towel-dispenser": ["All languages identify the checkout holder for individually wrapped oshibori packets.", "Taking one packet is simple; buying fried chicken provides a natural reason to take a wet towel before leaving."],
  "disposable-chopsticks-dispenser": ["The definitions agree on a holder for individually wrapped pairs of disposable wooden chopsticks.", "Taking chopsticks is direct; noodles in the bento motivate taking one pair."],
  "plastic-cutlery-dispenser": ["The concept is a divided checkout holder for wrapped plastic spoons and forks, distinct from chopsticks.", "Spoons being stored there is clear; buying soup motivates checking the holder and taking a wrapped spoon."],
  "cash-register": ["All languages identify the POS checkout system used to scan goods, total purchases, and accept payment.", "Scanning a drink is the basic action; the displayed total prompts tapping a transit card on the payment terminal."],
};

const items = [];
for (const entry of entries) {
  const review = evidence[entry.id];
  if (!review || review.length !== 2) throw new Error(`${entry.id}: missing individual review evidence`);
  const languages = entry.definitions.map(({ language }) => language).sort().join(",");
  if (languages !== "en,ja,zh" || entry.examples.length !== 2) throw new Error(`${entry.id}: structural content mismatch`);
  items.push({
    kind: "word",
    id: entry.id,
    verdict: "pass",
    headwords: { en: entry.word, ja: entry.ja, zh: entry.chinese },
    reason: review[0],
  });
  entry.examples.forEach((example, slot) => items.push({
    kind: "example",
    id: `${entry.id}:${slot}`,
    wordId: entry.id,
    slot,
    cefrLevel: example.cefrLevel,
    verdict: "pass",
    text: { en: example.en, ja: example.ja, zh: example.zh },
    reason: review[1].split("; ")[slot] ?? review[1],
  }));
}

if (items.length !== 102) throw new Error(`expected 102 review items, found ${items.length}`);
const output = path.join(root, "output/convenience-store-publish-prep/semantic-review.json");
fs.writeFileSync(output, `${JSON.stringify({
  schemaVersion: 1,
  series: "convenience-store",
  reviewedAt: "2026-09-21",
  reviewer: "manual trilingual semantic review with structural validators",
  productionWriteAllowed: false,
  summary: { words: 34, examples: 68, passed: 102, failed: 0 },
  items,
}, null, 2)}\n`);
console.log(JSON.stringify({ output, items: items.length, failed: 0 }, null, 2));
