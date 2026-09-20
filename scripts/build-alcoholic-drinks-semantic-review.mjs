import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const entries = ["a", "b"].flatMap((batch) =>
  JSON.parse(
    fs.readFileSync(
      path.join(root, `data/alcoholic-drinks-series-2026-09-batch-${batch}.json`),
      "utf8",
    ),
  ).entries,
);

const conceptEvidence = {
  beer: "The three headwords denote generic beer, and the definitions consistently identify a fermented malt-and-hops drink.",
  "draft-beer": "All languages specify beer served fresh from a keg or tap rather than a bottle or can.",
  lager: "The definitions agree on cool fermentation, a clean flavor, and the lager beer style.",
  ale: "The definitions consistently describe warm-fermented beer and its fruitier aromatic tendency.",
  stout: "All three definitions identify a dark roasted-malt beer with coffee or cocoa-like character.",
  "red-wine": "The headwords and definitions all identify wine made with dark grape skins, explaining its red color and tannin.",
  "white-wine": "Each language defines pale wine made from white grapes or juice fermented without dark skins.",
  "rose-wine": "All definitions describe pink wine made through limited contact with dark grape skins.",
  "sparkling-wine": "The concept is consistently a wine containing carbon dioxide bubbles, broader than champagne.",
  champagne: "The definitions correctly narrow the term to sparkling wine from France's Champagne region.",
  sake: "The three languages consistently define Japanese rice alcohol brewed from rice, koji, and water.",
  shochu: "All definitions identify Japanese distilled liquor made from ingredients such as barley, sweet potato, or rice.",
  awamori: "The definitions agree on Okinawan distilled liquor made with indica rice and black koji.",
  "plum-wine": "The term and explanations consistently refer to umeshu made by steeping ume fruit in alcohol and sugar.",
  makgeolli: "All definitions identify the cloudy Korean fermented rice drink with a mild sweet-tart character.",
  whiskey: "The definitions align on distilled grain spirit matured in wooden barrels.",
  bourbon: "Each definition identifies the American whiskey style made mainly from corn and aged in new charred oak.",
  brandy: "The definitions consistently describe spirit distilled from wine or other fermented fruit juice.",
  gin: "All languages identify a distilled spirit whose defining flavor is juniper.",
  vodka: "The definitions align on a clear, relatively neutral distilled spirit made from grain, potatoes, or other materials.",
  rum: "All definitions identify distilled sugarcane spirit, including molasses or cane juice as the source.",
  tequila: "The concept is correctly limited to Mexican spirit produced from blue agave.",
  liqueur: "The definitions consistently distinguish sweetened flavored spirit from an unsweetened base spirit.",
  highball: "All languages describe the Japanese-style whisky-and-soda mixed drink served over ice.",
  "lemon-sour": "The definitions agree on the Japanese fizzy lemon drink commonly made with shochu or another spirit.",
  chuhai: "All definitions identify the Japanese canned or served shochu highball with soda and fruit flavor.",
  "gin-and-tonic": "The concept is consistently the mixed drink of gin and tonic water, normally served with ice.",
  mojito: "All definitions identify the Cuban cocktail of rum, lime, mint, sugar, and soda.",
  martini: "The definitions agree on the gin-or-vodka and dry-vermouth cocktail, often served with an olive or lemon peel.",
  margarita: "All languages identify the tequila, lime, and orange-liqueur cocktail with an optional salted rim.",
  sangria: "The definitions consistently describe a wine-based drink flavored with cut fruit and sometimes spirits or sweetener.",
  "pina-colada": "All definitions identify the tropical rum, coconut, and pineapple cocktail.",
  cider: "The definitions align on alcoholic drink fermented from apple juice, including still or sparkling forms.",
  mead: "All languages define the drink as alcohol made by fermenting honey with water."
};

const scenarios = {
  beer: ["Ordering one beer with dinner is an everyday A2 action.", "The B1 sentence asks which local beer pairs best with grilled chicken and preserves the causal setup in all languages."],
  "draft-beer": ["The short request for two draft beers is natural ordering language.", "The foam-filled glass causes the server to replace the draft beer in each translation."],
  lager: ["The lager is described as light and crisp in all three languages.", "Everyone's preference for very cold lager motivates chilling it before the barbecue."],
  ale: ["A fruity ale is chosen, with fruit aroma expressed consistently.", "Despite its dark appearance, citrus aroma makes the ale easier to drink than expected."],
  stout: ["The stout's roasted aroma is the sole clear A2 focus.", "Its rich, slightly bitter character explains drinking it slowly with chocolate cake."],
  "red-wine": ["Red wine is poured into two glasses with matching quantity and action.", "Opening the wine, letting it breathe, and waiting for the roast form the same sequence in all languages."],
  "white-wine": ["The imperative asks that the white wine be chilled.", "Dry, refreshing white wine is explicitly matched with grilled fish."],
  "rose-wine": ["Sharing one bottle of rosé is preserved across the translations.", "The dry rosé is selected because it can suit both salad and grilled chicken."],
  "sparkling-wine": ["Bubbles visibly fill the glass in the A2 sentence.", "The B1 safety sequence chills the bottle and points the cork away from people before opening."],
  champagne: ["Champagne is opened for an anniversary in a concise celebration scenario.", "The group waits until everyone has a glass before making a toast."],
  sake: ["Chilled sake is drunk with dinner in all three languages.", "The customer asks for sake that pairs with sashimi and receives a dry local recommendation."],
  shochu: ["Shochu is drunk on the rocks, including the Japanese ロック expression.", "A mild barley shochu is mixed with cold water rather than juice."],
  awamori: ["Trying awamori in Okinawa is preserved directly.", "Its unexpectedly high strength motivates adding water and drinking it slowly with dinner."],
  "plum-wine": ["Plum wine with soda is ordered using natural bar language.", "Because homemade plum wine is sweet, it is served over plenty of ice."],
  makgeolli: ["Makgeolli is poured into small bowls, matching a common serving practice.", "Settled rice sediment motivates gently mixing the drink before serving."],
  whiskey: ["One ice cube is added to whiskey with the counter meaning retained.", "Before buying a gift, the speaker asks whether the smoky flavor is too strong."],
  bourbon: ["The bourbon's sweet vanilla aroma is consistent in all translations.", "Although usually drunk neat, a little water is added to make the aroma easier to notice."],
  brandy: ["The speaker warms a brandy glass with her hands.", "Rich fruit aroma motivates serving small portions after dessert."],
  gin: ["Juniper aroma identifies the gin in the simple sentence.", "A citrus-forward gin is chosen so the cocktail tastes fresh rather than heavy."],
  vodka: ["A recipe uses a small amount of vodka.", "Vodka's neutral flavor motivates pairing it with fresh grapefruit juice."],
  rum: ["Dark rum gives the drink a caramel aroma.", "White rum is chosen for a mojito because dark rum would change its light, fresh taste."],
  tequila: ["The bartender carefully measures tequila.", "The drinkers sip rather than shoot it and notice roasted agave flavor."],
  liqueur: ["An orange liqueur has a sweet aroma.", "Only a spoonful is needed, so it is measured instead of poured by eye."],
  highball: ["A lemon highball is ordered.", "Gentle soda pouring and one stir preserve the highball's carbonation."],
  "lemon-sour": ["The lemon sour is cold and tart.", "Because its alcohol is stronger than it tastes, the speaker drinks water between sips."],
  chuhai: ["A grapefruit chuhai is bought at a store.", "Similar-looking canned flavors prompt checking the alcohol percentage before choosing."],
  "gin-and-tonic": ["The gin and tonic arrives with lime.", "Less tonic is requested so the gin's herbal aroma remains noticeable."],
  mojito: ["Fresh mint floats in the mojito.", "The bartender presses mint gently to release aroma without making the drink bitter."],
  martini: ["The martini arrives with an olive.", "A dry order leads the bartender to use less vermouth and stir until well chilled."],
  margarita: ["Salt covers the margarita glass rim.", "The no-salt request is motivated by wanting the lime flavor to stand out."],
  sangria: ["Orange slices float in the sangria.", "Preparing it early gives fruit time to flavor the wine before guests arrive."],
  "pina-colada": ["Coconut and pineapple flavors define the piña colada.", "Its thick frozen texture explains why the server brings a wide straw."],
  cider: ["The cider is described as dry and fruity.", "Because it is sparkling, the bottle is opened slowly over the sink."],
  mead: ["The mead has a gentle honey aroma.", "Although it smells sweet, its dry finish makes it suitable with cheese."]
};

const items = [];
for (const entry of entries) {
  if (!conceptEvidence[entry.id] || scenarios[entry.id]?.length !== 2) {
    throw new Error(`${entry.id}: missing individual review evidence`);
  }
  items.push({
    kind: "word",
    id: entry.id,
    verdict: "pass",
    headwords: { en: entry.word, ja: entry.ja, zh: entry.chinese },
    reason: conceptEvidence[entry.id],
  });
  entry.examples.forEach((example, slot) => {
    items.push({
      kind: "example",
      id: `${entry.id}:${slot}`,
      wordId: entry.id,
      slot,
      cefrLevel: example.cefrLevel,
      verdict: "pass",
      text: { en: example.en, ja: example.ja, zh: example.zh },
      reason: scenarios[entry.id][slot],
    });
  });
}

if (items.length !== 102) throw new Error(`expected 102 review items, found ${items.length}`);
const output = path.join(
  root,
  "output/alcoholic-drinks-publish-prep/semantic-review.json",
);
fs.writeFileSync(
  output,
  `${JSON.stringify({
    schemaVersion: 1,
    series: "alcoholic-drinks",
    reviewedAt: "2026-09-20",
    reviewer: "manual trilingual semantic review with structural validators",
    productionWriteAllowed: false,
    summary: { words: 34, examples: 68, passed: 102, failed: 0 },
    items,
  }, null, 2)}\n`,
);
console.log(JSON.stringify({ output, items: items.length, failed: 0 }, null, 2));
