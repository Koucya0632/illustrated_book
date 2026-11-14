import type { CEFRLevel, Definition } from "@/types";
import type { MainWordCorrection } from "../main-word-corrections";
import type { MainWordExamplePair } from "../main-word-example-pairs";

type ReleaseExample = {
  en: string;
  ja: string;
  zh: string;
  cefrLevel: CEFRLevel;
};

/** One word as a release candidate file states it
 * (`data/<series>-<yyyy-mm>.json` → `entries[]`). */
export type ReleaseEntry = {
  id: string;
  word: string;
  chinese: string;
  chineseDefinition: string;
  category: string;
  partOfSpeech: string;
  pronunciation: string;
  imageUrl: string | null;
  definitions: Definition[];
  examples: [ReleaseExample, ReleaseExample];
  relatedWords: string[];
  ja: string;
  jaReading: string;
  jaReadingSegments: { text: string; ruby: string | null }[] | null;
};

/** A seed word: the candidate entry without its Japanese headword fields,
 * which reach the database through the matching correction instead. */
export type ReleaseSeedWord = Omit<ReleaseEntry, "ja" | "jaReading" | "jaReadingSegments">;

/** What one release contributes to the catalogue. `ids` is the release's whole
 * plan (what a guard waits for); `words` is only what routine seeding may add,
 * which excludes words that were already published before the release. */
export type CatalogueSeries = {
  ids: readonly string[];
  words: readonly ReleaseSeedWord[];
  corrections: readonly MainWordCorrection[];
  examplePairs: readonly MainWordExamplePair[];
};

type CandidateFile = { entries: unknown[] };

export function candidateEntries(candidate: CandidateFile): ReleaseEntry[] {
  return candidate.entries as ReleaseEntry[];
}

export function examplePairsFromEntries(
  entries: readonly Pick<ReleaseEntry, "id" | "examples">[],
): MainWordExamplePair[] {
  return entries.map(({ id, examples }) => ({
    id,
    examples: [
      { ...examples[0], cefrLevel: examples[0].cefrLevel as CEFRLevel, sortOrder: 0 },
      { ...examples[1], cefrLevel: examples[1].cefrLevel as CEFRLevel, sortOrder: 1 },
    ],
  }));
}

/** Derive a release's seed words, Japanese corrections and example pairs from
 * its candidate entries. The Japanese definition is seeded as-is, so its
 * correction is an identity; the headword and reading are what it sets.
 * `previousJaReading` names a reading that was published before a reviewed
 * reading correction, so the upsert still recognises the old row. */
export function seriesFromCandidate(
  entries: readonly ReleaseEntry[],
  options: { previousJaReading?: (id: string) => string | undefined } = {},
): CatalogueSeries {
  return {
    ids: entries.map(({ id }) => id),
    words: entries.map(
      ({ ja: _ja, jaReading: _reading, jaReadingSegments: _segments, ...word }) => word,
    ),
    corrections: entries.map(({ id, definitions, ja, jaReading, jaReadingSegments }) => {
      const jaDefinition = definitions.find(({ language }) => language === "ja")!.definition;
      return {
        id,
        oldJa: jaDefinition,
        ja,
        oldJaReading: options.previousJaReading?.(id) ?? jaReading,
        jaReading,
        jaReadingSegments,
        jaDefinition: { old: jaDefinition, value: jaDefinition },
      };
    }),
    examplePairs: examplePairsFromEntries(entries),
  };
}
