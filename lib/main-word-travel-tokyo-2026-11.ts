import type { CEFRLevel } from "@/types";
import candidate from "../data/travel-tokyo-2026-11.json";
import type { MainWordExamplePair } from "./main-word-example-pairs";

// Published example maintenance only; never exports words/category seeds.
export const MAIN_WORD_TRAVEL_TOKYO_IDS = candidate.entries.map(({ id }) => id);
export const MAIN_WORD_TRAVEL_TOKYO_EXAMPLE_PAIRS: MainWordExamplePair[] =
  candidate.entries.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], cefrLevel: examples[0].cefrLevel as CEFRLevel, sortOrder: 0 },
      { ...examples[1], cefrLevel: examples[1].cefrLevel as CEFRLevel, sortOrder: 1 },
    ],
  }));
