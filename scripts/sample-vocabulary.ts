// Generates AI 查詞 samples for reviewing the prompts. Calls the model directly;
// no credits are charged. Needs ANTHROPIC_API_KEY.
//
//   npx tsx --env-file=.env.local scripts/sample-vocabulary.ts out.json

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { inputSchema, PRICES, VOCABULARY_VERSION, type VocabularyMode } from "@/lib/assistant/vocabulary/contracts";
import { createVocabularyModel } from "@/lib/assistant/vocabulary/model";

type Ui = "zh-Hant" | "zh-Hans" | "ja" | "en";
const SAMPLES: Array<[Ui, "zh-en" | "zh-ja", VocabularyMode, string]> = [
  ["zh-Hant", "zh-ja", "analysis", "借りる"],
  ["zh-Hant", "zh-ja", "mnemonic", "借りる"],
  ["zh-Hant", "zh-ja", "lookup", "帰る"],
  ["zh-Hant", "zh-ja", "mnemonic", "帰る"],
  ["zh-Hant", "zh-ja", "analysis", "起きる"],
  ["zh-Hant", "zh-ja", "mnemonic", "開ける"],
  ["zh-Hant", "zh-ja", "lookup", "勉強する"],
  ["zh-Hant", "zh-en", "mnemonic", "borrow"],
  ["zh-Hant", "zh-en", "analysis", "lend"],
  ["ja", "zh-ja", "lookup", "借りる"],
  ["en", "zh-ja", "mnemonic", "借りる"],
];

async function main() {
  const out = process.argv[2] ?? "vocabulary.json";
  const model = createVocabularyModel();
  const results = await Promise.all(SAMPLES.map(async ([uiLanguage, learningDirection, mode, query]) => {
    const input = inputSchema.parse({ requestId: randomUUID(), mode, query, uiLanguage, learningDirection,
      pricingVersion: VOCABULARY_VERSION, maxPoints: PRICES[mode].maxPoints });
    try {
      const { reply, usage } = await model(input);
      return { uiLanguage, learningDirection, mode, query, reply, usage };
    } catch (error) {
      return { uiLanguage, learningDirection, mode, query, error: String(error) };
    }
  }));
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`${results.filter(r => !("error" in r)).length}/${results.length} → ${out}`);
}
main();
