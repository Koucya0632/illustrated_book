// 情境故事's difficulty. The label is what the person picks; the guide is what
// the model is told, written per language being learned because "beginner"
// means different grammar in Japanese and in English.

import type { Labels } from "./scenes";

export type StoryLearningDirection = "zh-en" | "zh-ja";

export interface StoryLevel {
  id: string;
  label: Labels;
  /** One line under the label, in the picker. */
  hint: Labels;
  guide: Record<StoryLearningDirection, string>;
}

export const STORY_LEVELS: StoryLevel[] = [
  {
    id: "starter",
    label: { "zh-Hant": "入門", "zh-Hans": "入门", ja: "入門", en: "Starter" },
    hint: { "zh-Hant": "短句、基本禮貌體", "zh-Hans": "短句、基本礼貌体", ja: "短い文・です／ます", en: "Short, simple sentences" },
    guide: {
      "zh-ja": "Every line is one short sentence of at most about 15 characters, in polite です/ます form only. Use only very common words (JLPT N5) besides the chosen items. No plain form, no casual contractions, no keigo. Easy does not mean kana-only: write those common words with their usual kanji (買います, 三つ, 全部, 円, 食べます) and no spaces between words, because the app shows furigana over every kanji.",
      "zh-en": "Every line is one short sentence of at most about 8 words, in the present simple. Use only very common words (CEFR A1) besides the chosen items. No idioms or phrasal verbs.",
    },
  },
  {
    id: "elementary",
    label: { "zh-Hant": "初級", "zh-Hans": "初级", ja: "初級", en: "Elementary" },
    hint: { "zh-Hant": "日常對話、常用句型", "zh-Hans": "日常对话、常用句型", ja: "日常会話・よく使う文型", en: "Everyday phrases" },
    guide: {
      "zh-ja": "Lines are one or two sentences of everyday conversation (JLPT N4). The cat may speak in friendly plain form; the person answers in です/ます. Use common patterns such as 〜たい, 〜てください, 〜ましょう, 〜から.",
      "zh-en": "Lines are one or two sentences of everyday conversation (CEFR A2). Use the past and future, common question forms and a few everyday phrasal verbs such as pick up or look for.",
    },
  },
  {
    id: "intermediate",
    label: { "zh-Hant": "中級", "zh-Hans": "中级", ja: "中級", en: "Intermediate" },
    hint: { "zh-Hant": "自然口語、多一點表達", "zh-Hans": "自然口语、多一点表达", ja: "自然な話し言葉", en: "Natural, varied speech" },
    guide: {
      "zh-ja": "Natural spoken Japanese at about JLPT N3: casual speech between friends, sentence-final particles like ね・よ・かな, and where the place calls for it, simple keigo heard from staff (いらっしゃいませ, 〜でございます). Lines may be up to three sentences.",
      "zh-en": "Natural spoken English at about CEFR B1: contractions, common idioms and phrasal verbs, giving reasons and opinions. Lines may be up to three sentences.",
    },
  },
];

export const findLevel = (levelId: string) => STORY_LEVELS.find(level => level.id === levelId) ?? null;
