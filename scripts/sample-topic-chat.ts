// Plays scripted 主題對話 conversations against the real model, for reviewing
// the prompt by the five questions of design §12.2. Reads topic words from the
// live public catalogue; needs ANTHROPIC_API_KEY.
//
//   npx tsx --env-file=.env.local scripts/sample-topic-chat.ts out.json

import { writeFileSync } from "node:fs";
import { assistantCostUsd, usagePoints } from "@/lib/assistant/pricing";
import type { AiMessageBody, LearningDirection, UiLanguage } from "@/lib/topic-chat/contracts";
import { createTopicChatModel, type TopicMaterial, type TranscriptLine } from "@/lib/topic-chat/model";
import { TOPIC_CHAT_PRICING } from "@/lib/topic-chat/service";

const BASE = process.env.TUJI_BASE_URL ?? "https://everyday-english-picture-dictionary.vercel.app";

/** Each answer is what the person sends after the turn before it; "?another" asks for another question. */
const SCRIPTS: Array<{ ui: UiLanguage; direction: LearningDirection; topic: string; answers: string[] }> = [
  // A01 opening, A02 one word, A06 asking back, A03 a want in Chinese.
  { ui: "zh-Hant", direction: "zh-ja", topic: "street", answers: ["コンビニに行きたいです。", "公園。", "パンを買いたいです。あなたは？", "我想買水"] },
  // A04 stuck, A05 refusing, A17 two no-interest signals.
  { ui: "zh-Hant", direction: "zh-ja", topic: "street", answers: ["不知道怎麼說", "公園に行きたくないです。", "換個問題", "這個不想聊"] },
  { ui: "zh-Hant", direction: "zh-en", topic: "street", answers: ["I'd like to go to the park.", "bookstore", "What about you?"] },
  { ui: "ja", direction: "zh-ja", topic: "kitchen", answers: ["カレーを作りたいです。", "?another", "鍋です。"] },
  { ui: "en", direction: "zh-en", topic: "supermarket", answers: ["apples", "Because they are sweet."] },
  // The 跟著說 must answer the question just asked: a sweet-or-dry question after 「＿＿が好きです」 was shown.
  { ui: "zh-Hant", direction: "zh-ja", topic: "alcoholic-drinks", answers: ["梅酒が好きです。", "甘いです。", "週末に飲みます。", "ビールも好きです。"] },
  // Choosing between two things, then when and how often.
  { ui: "zh-Hant", direction: "zh-en", topic: "fruits", answers: ["apples", "sweet ones", "every day", "I had a mango yesterday."] },
  // A run of answers of the same kind, to see repetition come from the questions.
  { ui: "zh-Hant", direction: "zh-ja", topic: "convenience-store", answers: ["おにぎりを買いたいです。", "お茶。", "サンドイッチも買いたいです。", "あなたは？"] },
];

async function topicOf(ui: UiLanguage, direction: LearningDirection, id: string): Promise<TopicMaterial> {
  const res = await fetch(`${BASE}/api/words?lang=${ui}&learning=${direction}`);
  const body = await res.json() as { words: Array<{ id: string; word: string; reading?: string; chinese: string; category: string }> };
  const words = body.words.filter(w => w.category === id).slice(0, 40)
    .map(w => ({ id: w.id, word: w.word, reading: w.reading ?? undefined, meaning: w.chinese }));
  return { id, name: id, nameEn: id, words };
}

async function main() {
  const model = createTopicChatModel();
  const results = await Promise.all(SCRIPTS.map(async script => {
    const topic = await topicOf(script.ui, script.direction, script.topic);
    const transcript: TranscriptLine[] = [{ speaker: "topic", name: topic.name }];
    const turns: Array<{ you?: string; moira: AiMessageBody; points: number; costUsd: number }> = [];
    let previous: AiMessageBody | undefined;
    for (const answer of [null, ...script.answers]) {
      const task = answer === null ? { kind: "opening" as const }
        : answer === "?another" ? { kind: "another" as const }
          : { kind: "reply" as const, answer, support: [] };
      const { value, usage } = await model.turn({
        uiLanguage: script.ui, learningDirection: script.direction, topic, transcript, truncated: false,
        ...(previous ? { previous } : {}),
        practised: [...new Set(turns.flatMap(t => t.moira.pattern?.key ?? []))],
        earlier: turns.map((t, i) => ({ id: `m${i}`, type: t.moira.awaitsAnswer ? t.moira.pattern?.key ?? "none" : null, line: t.moira.line.text })),
        task,
      });
      if (task.kind === "reply") transcript.push({ speaker: "you", id: `u${turns.length}`, text: task.answer, support: [] });
      transcript.push({ speaker: "moira", id: `m${turns.length}`, text: value.line.text });
      turns.push({ ...(task.kind === "reply" ? { you: task.answer } : {}), moira: value,
        points: usagePoints(usage, TOPIC_CHAT_PRICING), costUsd: assistantCostUsd(usage) });
      previous = value;
    }
    return { ...script, turns };
  }));
  writeFileSync(process.argv[2] ?? "topic-chat-samples.json", JSON.stringify(results, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
