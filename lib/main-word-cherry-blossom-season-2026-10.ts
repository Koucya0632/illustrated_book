import type { CEFRLevel, Definition } from "@/types";
import candidate from "../data/cherry-blossom-season-series-2026-10.json";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type CherryBlossomSeasonExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

export type CherryBlossomSeasonEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "cherry-blossom-season";
  partOfSpeech: "noun";
  pronunciation: string;
  imageUrl: string;
  definitions: Definition[];
  examples: [CherryBlossomSeasonExample, CherryBlossomSeasonExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

export const MAIN_WORD_CHERRY_BLOSSOM_SEASON_RELEASE_ENTRIES =
  candidate.entries as unknown as CherryBlossomSeasonEntry[];

export const MAIN_WORD_CHERRY_BLOSSOM_SEASON_IDS =
  MAIN_WORD_CHERRY_BLOSSOM_SEASON_RELEASE_ENTRIES.map(({ id }) => id);

export const MAIN_WORD_CHERRY_BLOSSOM_SEASON_WORDS =
  MAIN_WORD_CHERRY_BLOSSOM_SEASON_RELEASE_ENTRIES.map(
    ({ ja: _ja, jaReading: _reading, jaReadingSegments: _segments, ...word }) => word,
  );

export const MAIN_WORD_CHERRY_BLOSSOM_SEASON_CORRECTIONS: MainWordCorrection[] =
  MAIN_WORD_CHERRY_BLOSSOM_SEASON_RELEASE_ENTRIES.map(
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

export const MAIN_WORD_CHERRY_BLOSSOM_SEASON_EXAMPLE_PAIRS: MainWordExamplePair[] =
  MAIN_WORD_CHERRY_BLOSSOM_SEASON_RELEASE_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));
