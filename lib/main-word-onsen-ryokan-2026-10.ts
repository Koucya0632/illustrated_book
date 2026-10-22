import type { CEFRLevel, Definition } from "@/types";
import candidate from "../data/onsen-ryokan-series-2026-10.json";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type OnsenRyokanExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

export type OnsenRyokanEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "onsen-ryokan";
  partOfSpeech: "noun";
  pronunciation: string;
  imageUrl: string;
  definitions: Definition[];
  examples: [OnsenRyokanExample, OnsenRyokanExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

export const MAIN_WORD_ONSEN_RYOKAN_RELEASE_ENTRIES =
  candidate.entries as unknown as OnsenRyokanEntry[];

export const MAIN_WORD_ONSEN_RYOKAN_IDS =
  MAIN_WORD_ONSEN_RYOKAN_RELEASE_ENTRIES.map(({ id }) => id);

export const MAIN_WORD_ONSEN_RYOKAN_WORDS =
  MAIN_WORD_ONSEN_RYOKAN_RELEASE_ENTRIES.map(
    ({ ja: _ja, jaReading: _reading, jaReadingSegments: _segments, ...word }) => word,
  );

export const MAIN_WORD_ONSEN_RYOKAN_CORRECTIONS: MainWordCorrection[] =
  MAIN_WORD_ONSEN_RYOKAN_RELEASE_ENTRIES.map(
    ({ id, definitions, ja, jaReading, jaReadingSegments }) => {
      const jaDefinition = definitions.find(({ language }) => language === "ja")!.definition;
      return {
        id,
        oldJa: jaDefinition,
        ja,
        oldJaReading: jaReading,
        jaReading,
        jaReadingSegments,
        jaDefinition: { old: jaDefinition, value: jaDefinition },
      };
    },
  );

export const MAIN_WORD_ONSEN_RYOKAN_EXAMPLE_PAIRS: MainWordExamplePair[] =
  MAIN_WORD_ONSEN_RYOKAN_RELEASE_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));
