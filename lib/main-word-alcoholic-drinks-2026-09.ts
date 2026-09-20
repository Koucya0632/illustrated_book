import type { CEFRLevel, Definition } from "@/types";
import batchA from "../data/alcoholic-drinks-series-2026-09-batch-a.json";
import batchB from "../data/alcoholic-drinks-series-2026-09-batch-b.json";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type AlcoholicDrinkExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

export type AlcoholicDrinkEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "alcoholic-drinks";
  partOfSpeech: "noun";
  pronunciation: string;
  imageUrl: string;
  definitions: Definition[];
  examples: [AlcoholicDrinkExample, AlcoholicDrinkExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

export const MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES: AlcoholicDrinkEntry[] = [
  ...(batchA.entries as unknown as AlcoholicDrinkEntry[]),
  ...(batchB.entries as unknown as AlcoholicDrinkEntry[]),
];

export const MAIN_WORD_ALCOHOLIC_DRINKS_IDS =
  MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES.map(({ id }) => id);

export const MAIN_WORD_ALCOHOLIC_DRINKS_NEW_IDS =
  MAIN_WORD_ALCOHOLIC_DRINKS_IDS.filter((id) => id !== "sake");

const NEW_ENTRIES = MAIN_WORD_ALCOHOLIC_DRINKS_RELEASE_ENTRIES.filter(
  ({ id }) => id !== "sake",
);

export const MAIN_WORD_ALCOHOLIC_DRINKS_WORDS = NEW_ENTRIES.map(
  ({ ja: _ja, jaReading: _jaReading, jaReadingSegments: _segments, ...word }) =>
    word,
);

export const MAIN_WORD_ALCOHOLIC_DRINKS_CORRECTIONS: MainWordCorrection[] =
  NEW_ENTRIES.map(({ id, definitions, ja, jaReading, jaReadingSegments }) => {
    const seededJaDefinition = definitions.find(
      ({ language }) => language === "ja",
    )!.definition;
    return {
      id,
      oldJa: seededJaDefinition,
      ja,
      oldJaReading: jaReading,
      jaReading,
      jaReadingSegments,
      jaDefinition: {
        old: seededJaDefinition,
        value: seededJaDefinition,
      },
    };
  });

export const MAIN_WORD_ALCOHOLIC_DRINKS_EXAMPLE_PAIRS: MainWordExamplePair[] =
  NEW_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));
