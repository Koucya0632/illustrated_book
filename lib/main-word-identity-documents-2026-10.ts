import type { CEFRLevel, Definition } from "@/types";
import candidate from "../data/identity-documents-series-2026-10.json";
import type { MainWordCorrection } from "./main-word-corrections";
import type { MainWordExamplePair } from "./main-word-example-pairs";

type IdentityDocumentsExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

export type IdentityDocumentsEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: "identity-documents";
  partOfSpeech: "noun";
  pronunciation: string;
  imageUrl: string;
  definitions: Definition[];
  examples: [IdentityDocumentsExample, IdentityDocumentsExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

export const MAIN_WORD_IDENTITY_DOCUMENTS_RELEASE_ENTRIES =
  candidate.entries as unknown as IdentityDocumentsEntry[];

export const MAIN_WORD_IDENTITY_DOCUMENTS_IDS =
  MAIN_WORD_IDENTITY_DOCUMENTS_RELEASE_ENTRIES.map(({ id }) => id);

export const MAIN_WORD_IDENTITY_DOCUMENTS_WORDS =
  MAIN_WORD_IDENTITY_DOCUMENTS_RELEASE_ENTRIES.map(
    ({ ja: _ja, jaReading: _reading, jaReadingSegments: _segments, ...word }) => word,
  );

export const MAIN_WORD_IDENTITY_DOCUMENTS_CORRECTIONS: MainWordCorrection[] =
  MAIN_WORD_IDENTITY_DOCUMENTS_RELEASE_ENTRIES.map(
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

export const MAIN_WORD_IDENTITY_DOCUMENTS_EXAMPLE_PAIRS: MainWordExamplePair[] =
  MAIN_WORD_IDENTITY_DOCUMENTS_RELEASE_ENTRIES.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], sortOrder: 0 },
      { ...examples[1], sortOrder: 1 },
    ],
  }));
