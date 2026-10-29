import type { CEFRLevel } from "@/types";
import candidate from "../data/winter-postal-2026-10.json";
import type { MainWordExamplePair } from "./main-word-example-pairs";

// Published examples only. This module deliberately exports no seed words or
// category records: normal migration must not publish an absent winter word.
export const MAIN_WORD_WINTER_POSTAL_IDS = candidate.entries.map(({ id }) => id);

export const MAIN_WORD_WINTER_POSTAL_EXAMPLE_PAIRS: MainWordExamplePair[] =
  candidate.entries.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], cefrLevel: examples[0].cefrLevel as CEFRLevel, sortOrder: 0 },
      { ...examples[1], cefrLevel: examples[1].cefrLevel as CEFRLevel, sortOrder: 1 },
    ],
  }));
