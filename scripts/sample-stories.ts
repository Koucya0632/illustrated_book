// Generates a batch of 情境故事 samples for reviewing the prompt, the levels and
// the price. Reads items from the live public catalogue; needs ANTHROPIC_API_KEY.
//
//   npx tsx --env-file=.env.local scripts/sample-stories.ts out.json

import { writeFileSync } from "node:fs";
import { assistantCostUsd, storyPoints } from "@/lib/assistant/pricing";
import { findLevel, type StoryLearningDirection } from "@/lib/assistant/story/levels";
import { createStoryModel, missingWords, type StoryWord } from "@/lib/assistant/story/model";
import { findScene } from "@/lib/assistant/story/scenes";

const BASE = process.env.TUJI_BASE_URL ?? "https://everyday-english-picture-dictionary.vercel.app";

type Ui = "zh-Hant" | "zh-Hans" | "ja" | "en";
const SAMPLES: Array<[Ui, StoryLearningDirection, string[], string, string, string]> = [
  ["zh-Hant", "zh-ja", ["apple"], "supermarket", "shopping", "starter"],
  ["zh-Hant", "zh-ja", ["printer", "ballpoint-pen", "notebook"], "office", "work", "intermediate"],
  ["zh-Hant", "zh-en", ["apple"], "supermarket", "shopping", "starter"],
  ["ja", "zh-ja", ["apple"], "supermarket", "shopping", "starter"],
  ["ja", "zh-ja", ["chopsticks", "pot"], "home", "cooking", "elementary"],
  ["ja", "zh-ja", ["wristwatch", "mobile-phone"], "station", "waiting", "intermediate"],
  ["ja", "zh-en", ["coffee-machine"], "office", "chat", "starter"],
  ["ja", "zh-en", ["robot-vacuum"], "home", "cleaning", "elementary"],
  ["en", "zh-ja", ["apple"], "supermarket", "shopping", "starter"],
  ["en", "zh-ja", ["mobile-phone"], "station", "directions", "elementary"],
  ["en", "zh-en", ["apple"], "supermarket", "shopping", "starter"],
  ["en", "zh-en", ["rice-cooker", "chopsticks"], "home", "cooking", "intermediate"],
];

async function catalogue(lang: Ui, direction: StoryLearningDirection): Promise<Map<string, StoryWord>> {
  const res = await fetch(`${BASE}/api/words?lang=${lang}&learning=${direction}`);
  const body = await res.json() as { words: Array<{ id: string; word: string; reading?: string; chinese: string }> };
  return new Map(body.words.map(w => [w.id, { id: w.id, word: w.word, reading: w.reading ?? undefined, meaning: w.chinese }]));
}

async function main() {
  const out = process.argv[2] ?? "stories.json";
  const words = new Map<string, Map<string, StoryWord>>();
  for (const [ui, direction] of SAMPLES) {
    const key = `${ui}|${direction}`;
    if (!words.has(key)) words.set(key, await catalogue(ui, direction));
  }
  const model = createStoryModel();
  const results = await Promise.all(SAMPLES.map(async ([ui, direction, ids, sceneId, situationId, levelId]) => {
    const picked = ids.map(id => {
      const word = words.get(`${ui}|${direction}`)!.get(id);
      if (!word) throw new Error(`no catalogue word ${id} for ${direction}`);
      return word;
    });
    const place = findScene(sceneId, situationId)!;
    const level = findLevel(levelId)!;
    const started = Date.now();
    try {
      const { story, usage } = await model({
        uiLanguage: ui, learningDirection: direction, words: picked, ...place, level,
      });
      const costUsd = assistantCostUsd(usage);
      const points = storyPoints(usage);
      return {
        ui, direction, scene: place.scene.label["zh-Hant"], situation: place.situation.label["zh-Hant"],
        level: level.label["zh-Hant"], words: picked, story, usage, costUsd, points,
        missing: missingWords(story, picked), latencyMs: Date.now() - started,
      };
    } catch (error) {
      return { ui, direction, sceneId, situationId, levelId, ids, error: String(error) };
    }
  }));
  writeFileSync(out, JSON.stringify(results, null, 2));
  for (const r of results) {
    console.log("error" in r ? `ERROR ${r.ids} ${r.error}` :
      `${r.ui}×${r.direction} ${r.scene}/${r.situation}/${r.level} in=${r.usage.inputTokens} out=${r.usage.outputTokens} ` +
      `$${r.costUsd.toFixed(5)} ${r.points}pt ${r.latencyMs}ms missing=${r.missing.join(",") || "-"}`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
