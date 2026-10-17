// Generates AI 語法 samples for reviewing the prompts and measuring cost. Calls the
// model directly; no credits are charged. Needs ANTHROPIC_API_KEY.
//
//   npx tsx --env-file=.env.local scripts/sample-grammar.ts out.json [explain|compare|practice]

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { GRAMMAR_VERSION, inputSchema, pointsFor, PRICES, type GrammarMode } from "@/lib/assistant/grammar/contracts";
import { createGrammarModel } from "@/lib/assistant/grammar/model";

type Ui = "zh-Hant" | "zh-Hans" | "ja" | "en";
type Sample = [Ui, "zh-en" | "zh-ja", GrammarMode, string, Record<string, string>?];
// Single points, whole sentences, look-alikes, a non-pair, ambiguity, a wrong sentence and practice, in both languages.
const SAMPLES: Sample[] = [
  ["zh-Hant", "zh-ja", "explain", "〜たことがある"],
  ["zh-Hant", "zh-ja", "explain", "雨が降っているのに、傘を持たずに出かけた。"],
  ["zh-Hant", "zh-ja", "explain", "這句話為什麼用は不用が？", { context: "私は学生です。" }],
  ["zh-Hant", "zh-ja", "explain", "昨日、映画を見たことがある。"],
  ["zh-Hant", "zh-ja", "compare", "〜てしまう"],
  ["zh-Hant", "zh-ja", "compare", "は和が有什麼差別"],
  ["zh-Hant", "zh-ja", "compare", "〜ために", { compareWith: "〜ように" }],
  ["zh-Hant", "zh-ja", "compare", "〜たことがある", { compareWith: "present perfect" }],
  ["zh-Hant", "zh-ja", "practice", "〜たことがある"],
  ["zh-Hant", "zh-ja", "practice", "〜ために", { compareWith: "〜ように" }],
  ["zh-Hant", "zh-en", "explain", "現在完成式"],
  ["zh-Hant", "zh-en", "explain", "If I were you, I would take the job."],
  ["zh-Hant", "zh-en", "explain", "I am agree with you."],
  ["zh-Hant", "zh-en", "compare", "used to", { compareWith: "be used to" }],
  ["zh-Hant", "zh-en", "compare", "a 和 the 有什麼差別"],
  ["zh-Hant", "zh-en", "practice", "present perfect vs past simple", { difficulty: "advanced" }],
  ["zh-Hant", "zh-en", "practice", "冠詞 a / an / the", { practiceType: "choice" }],
  ["zh-Hans", "zh-en", "explain", "would rather"],
  ["en", "zh-ja", "explain", "〜ながら"],
  ["ja", "zh-ja", "explain", "〜ばかり"],
];

async function main() {
  const out = process.argv[2] ?? "grammar.json";
  const only = process.argv[3];
  const model = createGrammarModel();
  const results = await Promise.all(SAMPLES.filter(([, , mode]) => !only || mode === only).map(async ([uiLanguage, learningDirection, mode, query, extra = {}]) => {
    const input = inputSchema.parse({ requestId: randomUUID(), mode, query, uiLanguage, learningDirection,
      pricingVersion: GRAMMAR_VERSION, maxPoints: PRICES[mode].maxPoints, ...extra });
    const started = Date.now();
    try {
      const { reply, usage } = await model(input);
      return { uiLanguage, learningDirection, mode, query, extra, ms: Date.now() - started,
        points: reply.outcome === "completed" ? pointsFor(mode, usage) : 0, usage, reply };
    } catch (error) {
      return { uiLanguage, learningDirection, mode, query, extra, ms: Date.now() - started, error: String(error) };
    }
  }));
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`${results.filter(r => !("error" in r)).length}/${results.length} → ${out}`);
}
main();
