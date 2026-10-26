import type { CEFRLevel, Definition } from "@/types";
import candidate from "../data/dental-clinic-series-2026-10.json";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type DentalClinicExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

export type DentalClinicEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "dental-clinic";
  partOfSpeech: "noun";
  pronunciation: string;
  imageUrl: string;
  definitions: Definition[];
  examples: [DentalClinicExample, DentalClinicExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

export const MAIN_WORD_DENTAL_CLINIC_RELEASE_ENTRIES =
  candidate.entries as unknown as DentalClinicEntry[];

export const MAIN_WORD_DENTAL_CLINIC_IDS =
  MAIN_WORD_DENTAL_CLINIC_RELEASE_ENTRIES.map(({ id }) => id);

export const MAIN_WORD_DENTAL_CLINIC_WORDS =
  MAIN_WORD_DENTAL_CLINIC_RELEASE_ENTRIES.map(
    ({ ja: _ja, jaReading: _reading, jaReadingSegments: _segments, ...word }) => word,
  );

export const MAIN_WORD_DENTAL_CLINIC_CORRECTIONS: MainWordCorrection[] =
  MAIN_WORD_DENTAL_CLINIC_RELEASE_ENTRIES.map(
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

export const MAIN_WORD_DENTAL_CLINIC_EXAMPLE_PAIRS: MainWordExamplePair[] =
  MAIN_WORD_DENTAL_CLINIC_RELEASE_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));
