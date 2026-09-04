import type { CEFRLevel } from "@/types";
import { MAIN_WORD_EXPANSION_EXAMPLE_PAIRS } from "./main-word-expansion-2026-09";
import { MAIN_WORD_LEGACY_EXAMPLE_SETS } from "./main-word-legacy-example-sets";
import {
  BATHROOM_COMPLEX_EXAMPLES,
  BATHROOM_PREVIOUS_COMPLEX_EXAMPLES,
  BATHROOM_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/bathroom";
import {
  BEDROOM_COMPLEX_EXAMPLES,
  BEDROOM_PREVIOUS_COMPLEX_EXAMPLES,
  BEDROOM_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/bedroom";
import {
  KITCHEN_COMPLEX_EXAMPLES,
  KITCHEN_PREVIOUS_COMPLEX_EXAMPLES,
  KITCHEN_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/kitchen";
import {
  LIVING_ROOM_COMPLEX_EXAMPLES,
  LIVING_ROOM_PREVIOUS_COMPLEX_EXAMPLES,
  LIVING_ROOM_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/living-room";
import {
  OFFICE_COMPLEX_EXAMPLES,
  OFFICE_PREVIOUS_COMPLEX_EXAMPLES,
  OFFICE_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/office";
import {
  SEASONINGS_COMPLEX_EXAMPLES,
  SEASONINGS_PREVIOUS_COMPLEX_EXAMPLES,
  SEASONINGS_PREVIOUS_SIMPLE_OVERRIDES,
  SEASONINGS_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/seasonings";
import {
  STREET_COMPLEX_EXAMPLES,
  STREET_PREVIOUS_COMPLEX_EXAMPLES,
  STREET_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/street";
import {
  SUPERMARKET_COMPLEX_EXAMPLES,
  SUPERMARKET_PREVIOUS_COMPLEX_EXAMPLES,
  SUPERMARKET_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/supermarket";
import {
  TRANSPORTATION_COMPLEX_EXAMPLES,
  TRANSPORTATION_PREVIOUS_COMPLEX_EXAMPLES,
  TRANSPORTATION_PREVIOUS_SIMPLE_OVERRIDES,
  TRANSPORTATION_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/transportation";
import type {
  MainWordComplexExample,
  MainWordExampleText,
  MainWordSimpleExampleOverride,
} from "./main-word-example-pairs/types";
import {
  ZODIAC_COMPLEX_EXAMPLES,
  ZODIAC_PREVIOUS_COMPLEX_EXAMPLES,
  ZODIAC_PREVIOUS_SIMPLE_OVERRIDES,
  ZODIAC_SIMPLE_OVERRIDES,
} from "./main-word-example-pairs/zodiac";

export type MainWordTargetExample = MainWordExampleText & {
  cefrLevel: CEFRLevel;
  sortOrder: 0 | 1;
};

export type MainWordExamplePair = {
  id: string;
  examples: [MainWordTargetExample, MainWordTargetExample];
};

export type StoredMainWordExample = MainWordExampleText & {
  cefrLevel: string | null;
  sortOrder: number;
};

const COMPLEX_EXAMPLES: MainWordComplexExample[] = [
  ...KITCHEN_COMPLEX_EXAMPLES,
  ...BATHROOM_COMPLEX_EXAMPLES,
  ...BEDROOM_COMPLEX_EXAMPLES,
  ...LIVING_ROOM_COMPLEX_EXAMPLES,
  ...OFFICE_COMPLEX_EXAMPLES,
  ...STREET_COMPLEX_EXAMPLES,
  ...SUPERMARKET_COMPLEX_EXAMPLES,
  ...TRANSPORTATION_COMPLEX_EXAMPLES,
  ...SEASONINGS_COMPLEX_EXAMPLES,
  ...ZODIAC_COMPLEX_EXAMPLES,
];

const SIMPLE_OVERRIDES: MainWordSimpleExampleOverride[] = [
  ...KITCHEN_SIMPLE_OVERRIDES,
  ...BATHROOM_SIMPLE_OVERRIDES,
  ...BEDROOM_SIMPLE_OVERRIDES,
  ...LIVING_ROOM_SIMPLE_OVERRIDES,
  ...OFFICE_SIMPLE_OVERRIDES,
  ...STREET_SIMPLE_OVERRIDES,
  ...SUPERMARKET_SIMPLE_OVERRIDES,
  ...TRANSPORTATION_SIMPLE_OVERRIDES,
  ...SEASONINGS_SIMPLE_OVERRIDES,
  ...ZODIAC_SIMPLE_OVERRIDES,
];

const PREVIOUS_COMPLEX_EXAMPLES: MainWordComplexExample[] = [
  ...KITCHEN_PREVIOUS_COMPLEX_EXAMPLES,
  ...BATHROOM_PREVIOUS_COMPLEX_EXAMPLES,
  ...BEDROOM_PREVIOUS_COMPLEX_EXAMPLES,
  ...LIVING_ROOM_PREVIOUS_COMPLEX_EXAMPLES,
  ...OFFICE_PREVIOUS_COMPLEX_EXAMPLES,
  ...STREET_PREVIOUS_COMPLEX_EXAMPLES,
  ...SUPERMARKET_PREVIOUS_COMPLEX_EXAMPLES,
  ...TRANSPORTATION_PREVIOUS_COMPLEX_EXAMPLES,
  ...SEASONINGS_PREVIOUS_COMPLEX_EXAMPLES,
  ...ZODIAC_PREVIOUS_COMPLEX_EXAMPLES,
];

const PREVIOUS_SIMPLE_OVERRIDES: MainWordSimpleExampleOverride[] = [
  ...TRANSPORTATION_PREVIOUS_SIMPLE_OVERRIDES,
  ...SEASONINGS_PREVIOUS_SIMPLE_OVERRIDES,
  ...ZODIAC_PREVIOUS_SIMPLE_OVERRIDES,
];

function uniqueById<T extends { id: string }>(rows: T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (result.has(row.id)) {
      throw new Error(`Duplicate ${label} entry for ${row.id}`);
    }
    result.set(row.id, row);
  }
  return result;
}

const complexById = uniqueById(COMPLEX_EXAMPLES, "complex example");
const simpleOverrideById = uniqueById(SIMPLE_OVERRIDES, "simple override");

export const MAIN_WORD_EXAMPLE_PAIRS: MainWordExamplePair[] =
  MAIN_WORD_LEGACY_EXAMPLE_SETS.map<MainWordExamplePair>(({ id, examples }) => {
    const legacySimple = examples.find(({ sortOrder }) => sortOrder === 0);
    const complex = complexById.get(id);
    if (!legacySimple) throw new Error(`Missing legacy simple example for ${id}`);
    if (!complex) throw new Error(`Missing complex example for ${id}`);

    const simple = simpleOverrideById.get(id) ?? legacySimple;
    return {
      id,
      examples: [
        { en: simple.en, ja: simple.ja, zh: simple.zh, cefrLevel: "A2", sortOrder: 0 },
        { en: complex.en, ja: complex.ja, zh: complex.zh, cefrLevel: "B1", sortOrder: 1 },
      ],
    };
  }).concat(MAIN_WORD_EXPANSION_EXAMPLE_PAIRS);

export function selectMainWordExamplePairs(
  wordIds?: ReadonlySet<string>,
): MainWordExamplePair[] {
  return wordIds
    ? MAIN_WORD_EXAMPLE_PAIRS.filter(({ id }) => wordIds.has(id))
    : MAIN_WORD_EXAMPLE_PAIRS;
}

export function validateMainWordExampleCoverage(publishedIds: Iterable<string>): string[] {
  const issues: string[] = [];
  const published = new Set(publishedIds);
  const pairIds = new Set(MAIN_WORD_EXAMPLE_PAIRS.map(({ id }) => id));

  for (const id of published) {
    if (!pairIds.has(id)) issues.push(`missing target pair: ${id}`);
  }
  for (const id of pairIds) {
    if (!published.has(id)) issues.push(`target pair is not published: ${id}`);
  }
  for (const id of complexById.keys()) {
    if (!pairIds.has(id)) issues.push(`complex example has unknown id: ${id}`);
  }
  for (const id of simpleOverrideById.keys()) {
    if (!pairIds.has(id)) issues.push(`simple override has unknown id: ${id}`);
  }

  return issues.sort();
}

function sameText(actual: MainWordExampleText, expected: MainWordExampleText): boolean {
  return actual.en === expected.en && actual.ja === expected.ja && actual.zh === expected.zh;
}

export function isTargetExamplePair(
  current: StoredMainWordExample[],
  pair: MainWordExamplePair,
): boolean {
  if (current.length !== 2) return false;
  return pair.examples.every((expected) => {
    const actual = current.find(({ sortOrder }) => sortOrder === expected.sortOrder);
    return Boolean(
      actual &&
        actual.cefrLevel === expected.cefrLevel &&
        sameText(actual, expected),
    );
  });
}

export function isKnownLegacyExampleSet(
  id: string,
  current: StoredMainWordExample[],
): boolean {
  const expected = MAIN_WORD_LEGACY_EXAMPLE_SETS.find((row) => row.id === id)?.examples;
  if (!expected || current.length !== expected.length) return false;
  if (current.some(({ cefrLevel }) => cefrLevel !== null)) return false;
  return expected.every((legacy) => {
    const actual = current.find(({ sortOrder }) => sortOrder === legacy.sortOrder);
    return Boolean(
      actual &&
        actual.en === legacy.en &&
        actual.zh === legacy.zh &&
        // A clean database is seeded from the zh-Hant source before Japanese
        // overlays exist. Treat only a wholly missing Japanese translation as
        // the same known legacy state; a different non-empty edit is a conflict.
        (actual.ja === legacy.ja || actual.ja === ""),
    );
  });
}

/** The first two-example rollout kept each legacy simple sentence and paired
 * it with the current complex sentence. A later category-specific simple
 * rewrite must recognize that exact deployed state without accepting arbitrary
 * edits as migration input. */
export function isKnownPreviousTargetExamplePair(
  id: string,
  current: StoredMainWordExample[],
): boolean {
  if (current.length !== 2) return false;
  const currentPair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
  const legacySimple = MAIN_WORD_LEGACY_EXAMPLE_SETS
    .find((row) => row.id === id)
    ?.examples.find(({ sortOrder }) => sortOrder === 0);
  const auditedPreviousComplex = PREVIOUS_COMPLEX_EXAMPLES.find(
    (row) => row.id === id,
  );
  const auditedPreviousSimple = PREVIOUS_SIMPLE_OVERRIDES.find(
    (row) => row.id === id,
  );
  if (currentPair && legacySimple && auditedPreviousComplex) {
    const simpleActual = current.find(({ sortOrder }) => sortOrder === 0);
    const complexActual = current.find(({ sortOrder }) => sortOrder === 1);
    if (
      simpleActual &&
      complexActual &&
      simpleActual.cefrLevel === currentPair.examples[0].cefrLevel &&
      complexActual.cefrLevel === currentPair.examples[1].cefrLevel &&
      [currentPair.examples[0], auditedPreviousSimple, legacySimple]
        .some((example) => Boolean(example && sameText(simpleActual, example))) &&
      sameText(complexActual, auditedPreviousComplex)
    ) {
      return true;
    }
  }
  const complex = MAIN_WORD_EXAMPLE_PAIRS
    .find((row) => row.id === id)
    ?.examples.find(({ sortOrder }) => sortOrder === 1);
  if (!legacySimple || !complex) return false;
  const simpleActual = current.find(({ sortOrder }) => sortOrder === 0);
  const complexActual = current.find(({ sortOrder }) => sortOrder === 1);
  return Boolean(
    simpleActual &&
      complexActual &&
      simpleActual.cefrLevel === "A2" &&
      complexActual.cefrLevel === complex.cefrLevel &&
      sameText(simpleActual, legacySimple) &&
      sameText(complexActual, complex),
  );
}

export function classifyMainWordExamplePair(
  id: string,
  current: StoredMainWordExample[],
): "target" | "legacy" | "conflict" {
  const pair = MAIN_WORD_EXAMPLE_PAIRS.find((row) => row.id === id);
  if (!pair) return "conflict";
  if (isTargetExamplePair(current, pair)) return "target";
  if (isKnownPreviousTargetExamplePair(id, current)) return "legacy";
  if (isKnownLegacyExampleSet(id, current)) return "legacy";
  return "conflict";
}
