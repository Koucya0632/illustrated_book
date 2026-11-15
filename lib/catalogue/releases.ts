// Every word release the catalogue knows about, in the order they shipped.
//
// A release is one batch of words with its reviewed Japanese, example pairs and
// span overlay. Its kind says how routine deploys treat it:
//
//   published         Released long ago with no guard. Seeded normally.
//   guarded           Released by its own publisher. Routine seeding skips its
//                     words, and its topic stays out of the catalogue, until
//                     every planned word is published in that topic.
//   post-publication  Published by its publisher with no seed words at all;
//                     deploys only keep its example pairs in step.
//
// Adding a release: add its candidate file under data/, append one entry here,
// and nothing else — seed words, the guard, the no-database fallback, the
// topic filter, corrections, example pairs and span overlays all read this list.
//
// Server only in practice (it imports every candidate file); nothing in a
// client bundle may import it.

import type { Category } from "@/types";
import type { MainWordCorrection } from "../main-word-corrections";
import type { MainWordExamplePair } from "../main-word-example-pairs";
import {
  candidateEntries,
  examplePairsFromEntries,
  seriesFromCandidate,
  type CatalogueSeries,
  type ReleaseSeedWord,
} from "./series";

import * as expansion from "../main-word-expansion-2026-09";
import * as expansionBatch2 from "../main-word-expansion-2026-09-batch-2";
import * as expansionBatch3 from "../main-word-expansion-2026-09-batch-3";
import * as fruits from "../main-word-fruits-2026-09";
import * as professions from "../main-word-professions-2026-09";
import * as alcoholicDrinks from "../main-word-alcoholic-drinks-2026-09";
import * as convenienceStore from "../main-word-convenience-store-2026-09";
import * as drugstore from "../main-word-drugstore-2026-09";
import * as clothing from "../main-word-clothing-2026-09";
import restaurant from "../../data/restaurant-series-2026-10.json";
import concertFanSupport from "../../data/concert-fan-support-series-2026-10.json";
import animeFanMerchExpansion from "../../data/anime-fan-merch-expansion-2026-10.json";
import stationCommuting from "../../data/station-commuting-series-2026-10.json";
import festivals from "../../data/festivals-series-2026-10.json";
import cherryBlossomSeason from "../../data/cherry-blossom-season-series-2026-10.json";
import collectingHobbies from "../../data/collecting-hobbies-series-2026-10.json";
import collectingHobbiesReadingCorrection from "../../data/collecting-hobbies-reading-correction-2026-10.json";
import campus from "../../data/campus-series-2026-10.json";
import arcade from "../../data/arcade-series-2026-10.json";
import onsenRyokan from "../../data/onsen-ryokan-series-2026-10.json";
import emergencyKit from "../../data/emergency-kit-series-2026-10.json";
import hairSalon from "../../data/hair-salon-series-2026-10.json";
import bank from "../../data/bank-series-2026-10.json";
import postalServices from "../../data/postal-services-series-2026-10.json";
import identityDocuments from "../../data/identity-documents-series-2026-10.json";
import airport from "../../data/airport-series-2026-10.json";
import phoneInternet from "../../data/phone-internet-series-2026-10.json";
import dentalClinic from "../../data/dental-clinic-series-2026-10.json";
import winterPostal from "../../data/winter-postal-2026-10.json";
import winterCheckout from "../../data/winter-checkout-2026-10.json";
import winterFood from "../../data/winter-food-2026-10.json";
import winterWarmth from "../../data/winter-warmth-2026-11.json";
import travelTokyo from "../../data/travel-tokyo-2026-11.json";

export type CatalogueRelease =
  | {
      id: string;
      kind: "published";
      series: CatalogueSeries;
      /** Span overlay files under data/, applied in registry order. */
      spans: readonly string[];
    }
  | {
      id: string;
      kind: "guarded";
      /** The topic the release fills. Several releases may share one topic;
       * it opens only when all of them are published. */
      category: string;
      /** Set when the topic's display record ships in the candidate file. */
      categoryRecord?: Category;
      /** Adds words to a topic that is already live. Seeding still waits for
       * it, but the topic itself is not hidden while it is being published. */
      expandsLiveTopic?: true;
      series: CatalogueSeries;
      spans: readonly string[];
    }
  | {
      id: string;
      kind: "post-publication";
      examplePairs: readonly MainWordExamplePair[];
      spans: readonly string[];
    };

type Module = {
  [key: string]: unknown;
};

/** The hand-written 2026-09 modules each export IDS/WORDS/CORRECTIONS/EXAMPLE_PAIRS
 * under their own prefix; they stay as frozen evidence of those releases. */
function moduleSeries(mod: Module, prefix: string): CatalogueSeries {
  const pick = <T>(name: string) => {
    const value = mod[`${prefix}_${name}`];
    if (!Array.isArray(value)) throw new Error(`${prefix}_${name} is not exported`);
    return value as T;
  };
  return {
    ids: pick<string[]>("IDS"),
    words: pick<ReleaseSeedWord[]>("WORDS"),
    corrections: pick<MainWordCorrection[]>("CORRECTIONS"),
    examplePairs: pick<MainWordExamplePair[]>("EXAMPLE_PAIRS"),
  };
}

function candidateSeries(candidate: { entries: unknown[] }): CatalogueSeries {
  return seriesFromCandidate(candidateEntries(candidate));
}

function guardedCandidate(
  id: string,
  candidate: { entries: unknown[]; category: Category },
  options: {
    ownsCategoryRecord?: boolean;
    expandsLiveTopic?: boolean;
    spans?: readonly string[];
    series?: CatalogueSeries;
  } = {},
): CatalogueRelease {
  return {
    id,
    kind: "guarded",
    category: candidate.category.id,
    ...(options.ownsCategoryRecord ? { categoryRecord: candidate.category } : {}),
    ...(options.expandsLiveTopic ? { expandsLiveTopic: true as const } : {}),
    series: options.series ?? candidateSeries(candidate),
    spans: options.spans ?? [`example-spans-${id}.json`],
  };
}

function postPublication(
  id: string,
  candidate: { entries: unknown[] },
  spans: readonly string[] = [`example-spans-${id}.json`],
): CatalogueRelease {
  return {
    id,
    kind: "post-publication",
    examplePairs: examplePairsFromEntries(candidateEntries(candidate)),
    spans,
  };
}

const PREVIOUS_COLLECTING_HOBBIES_READINGS = new Map(
  collectingHobbiesReadingCorrection.entries.map((entry) => [entry.wordId, entry.before.reading]),
);

export const CATALOGUE_RELEASES: readonly CatalogueRelease[] = [
  {
    id: "expansion-2026-09",
    kind: "published",
    series: moduleSeries(expansion, "MAIN_WORD_EXPANSION"),
    spans: ["example-spans-expansion-2026-09.json"],
  },
  {
    id: "expansion-2026-09-batch-2",
    kind: "published",
    series: moduleSeries(expansionBatch2, "MAIN_WORD_EXPANSION_BATCH_2"),
    spans: ["example-spans-expansion-2026-09-batch-2.json"],
  },
  {
    id: "expansion-2026-09-batch-3",
    kind: "published",
    series: moduleSeries(expansionBatch3, "MAIN_WORD_EXPANSION_BATCH_3"),
    spans: ["example-spans-expansion-2026-09-batch-3.json"],
  },
  {
    id: "fruits-2026-09",
    kind: "published",
    series: moduleSeries(fruits, "MAIN_WORD_FRUITS"),
    spans: ["example-spans-fruits-2026-09.json"],
  },
  {
    id: "professions-2026-09",
    kind: "guarded",
    category: "professions",
    series: moduleSeries(professions, "MAIN_WORD_PROFESSIONS"),
    spans: ["a", "b", "c", "d", "e"].map(
      (batch) => `example-spans-professions-2026-09-batch-${batch}.json`,
    ),
  },
  {
    id: "alcoholic-drinks-2026-09",
    kind: "guarded",
    category: "alcoholic-drinks",
    series: moduleSeries(alcoholicDrinks, "MAIN_WORD_ALCOHOLIC_DRINKS"),
    spans: ["example-spans-alcoholic-drinks-2026-09.json"],
  },
  {
    // Its plan includes the already-published `convenience-store` word, which
    // the publisher moved into this topic; seeding never re-adds it.
    id: "convenience-store-2026-09",
    kind: "guarded",
    category: "convenience-store",
    series: moduleSeries(convenienceStore, "MAIN_WORD_CONVENIENCE_STORE"),
    spans: ["example-spans-convenience-store-2026-09.json"],
  },
  {
    id: "drugstore-2026-09",
    kind: "guarded",
    category: "drugstore",
    series: moduleSeries(drugstore, "MAIN_WORD_DRUGSTORE"),
    spans: ["example-spans-drugstore-2026-09.json"],
  },
  {
    id: "clothing-2026-09",
    kind: "guarded",
    category: "clothing",
    series: moduleSeries(clothing, "MAIN_WORD_CLOTHING"),
    spans: ["example-spans-clothing-2026-09.json"],
  },
  // The topic records of these three were edited after release (the concert
  // topic was renamed when the anime expansion joined it), so lib/categories.ts
  // keeps them by hand.
  guardedCandidate("restaurant-2026-10", restaurant),
  guardedCandidate("concert-fan-support-2026-10", concertFanSupport),
  guardedCandidate("anime-fan-merch-expansion-2026-10", animeFanMerchExpansion, {
    expandsLiveTopic: true,
  }),
  guardedCandidate("station-commuting-2026-10", stationCommuting),
  guardedCandidate("festivals-2026-10", festivals, { ownsCategoryRecord: true }),
  guardedCandidate("cherry-blossom-season-2026-10", cherryBlossomSeason, { ownsCategoryRecord: true }),
  guardedCandidate("collecting-hobbies-2026-10", collectingHobbies, {
    ownsCategoryRecord: true,
    series: seriesFromCandidate(candidateEntries(collectingHobbies), {
      previousJaReading: (id) => PREVIOUS_COLLECTING_HOBBIES_READINGS.get(id),
    }),
  }),
  guardedCandidate("campus-2026-10", campus, { ownsCategoryRecord: true }),
  guardedCandidate("arcade-2026-10", arcade, { ownsCategoryRecord: true }),
  guardedCandidate("onsen-ryokan-2026-10", onsenRyokan, { ownsCategoryRecord: true }),
  guardedCandidate("emergency-kit-2026-10", emergencyKit, { ownsCategoryRecord: true }),
  guardedCandidate("hair-salon-2026-10", hairSalon, { ownsCategoryRecord: true }),
  guardedCandidate("bank-2026-10", bank, { ownsCategoryRecord: true }),
  guardedCandidate("postal-services-2026-10", postalServices, { ownsCategoryRecord: true }),
  guardedCandidate("identity-documents-2026-10", identityDocuments, { ownsCategoryRecord: true }),
  guardedCandidate("airport-2026-10", airport, { ownsCategoryRecord: true }),
  guardedCandidate("phone-internet-2026-10", phoneInternet, { ownsCategoryRecord: true }),
  guardedCandidate("dental-clinic-2026-10", dentalClinic, { ownsCategoryRecord: true }),
  postPublication("winter-postal-2026-10", winterPostal, ["example-spans-winter-postal-2026-10-v2.json"]),
  postPublication("winter-checkout-2026-10", winterCheckout),
  postPublication("winter-food-2026-10", winterFood),
  postPublication("winter-warmth-2026-11", winterWarmth),
  postPublication("travel-tokyo-2026-11", travelTokyo),
];

function seriesOf(release: CatalogueRelease): CatalogueSeries | null {
  return release.kind === "post-publication" ? null : release.series;
}

export function findRelease(id: string): CatalogueRelease {
  const release = CATALOGUE_RELEASES.find((candidate) => candidate.id === id);
  if (!release) throw new Error(`Unknown catalogue release: ${id}`);
  return release;
}

/** Every word a release plans: its whole plan for a seeded release, the
 * words it maintains example pairs for after publication. */
export function releaseWordIds(id: string): string[] {
  const release = findRelease(id);
  return release.kind === "post-publication"
    ? release.examplePairs.map((pair) => pair.id)
    : [...release.series.ids];
}

/** Words routine seeding may add, before the guard filters them. */
export const RELEASE_SEED_WORDS: readonly ReleaseSeedWord[] = CATALOGUE_RELEASES.flatMap(
  (release) => seriesOf(release)?.words ?? [],
);

export const RELEASE_CORRECTIONS: readonly MainWordCorrection[] = CATALOGUE_RELEASES.flatMap(
  (release) => seriesOf(release)?.corrections ?? [],
);

export const RELEASE_EXAMPLE_PAIRS: readonly MainWordExamplePair[] = CATALOGUE_RELEASES.flatMap(
  (release) =>
    release.kind === "post-publication" ? release.examplePairs : release.series.examplePairs,
);

/** Span overlay files under data/, in the order they are layered. */
export const RELEASE_SPAN_OVERLAYS: readonly string[] = CATALOGUE_RELEASES.flatMap(
  (release) => release.spans,
);

/** Topic records that ship inside a guarded release's candidate file. */
export const RELEASE_CATEGORY_RECORDS: readonly Category[] = CATALOGUE_RELEASES.flatMap(
  (release) => (release.kind === "guarded" && release.categoryRecord ? [release.categoryRecord] : []),
);

export type GuardedSeries = {
  release: string;
  category: string;
  ids: readonly string[];
  expandsLiveTopic: boolean;
};

/** The one guard list. Seeding, image sync, the live topic filter
 * (lib/catalogue/topics.ts) and the no-database fallback all read it. */
export const GUARDED_SERIES: readonly GuardedSeries[] = CATALOGUE_RELEASES.flatMap((release) =>
  release.kind === "guarded"
    ? [{
        release: release.id,
        category: release.category,
        ids: release.series.ids,
        expandsLiveTopic: release.expandsLiveTopic === true,
      }]
    : [],
);

/** What the live topic list waits for: every planned word of every release
 * that opens a new topic, as parallel arrays for one `unnest` query.
 * Expansions of a live topic are left out, so the topic stays visible. */
export const TOPIC_GATE_PLAN: { categories: readonly string[]; ids: readonly string[] } = (() => {
  const plan = GUARDED_SERIES.filter(({ expandsLiveTopic }) => !expandsLiveTopic).flatMap(
    ({ category, ids }) => ids.map((id) => ({ category, id })),
  );
  return { categories: plan.map(({ category }) => category), ids: plan.map(({ id }) => id) };
})();

export const GUARDED_CATEGORY_IDS: ReadonlySet<string> = new Set(
  GUARDED_SERIES.map(({ category }) => category),
);

export const GUARDED_WORD_IDS: ReadonlySet<string> = new Set(
  GUARDED_SERIES.flatMap(({ ids }) => ids),
);

/** A word belongs to a guarded release by plan or by topic. Either way only its
 * dedicated publisher may write it, and the static fallback must not show it. */
export function isGuardedWord(word: { id: string; category: string }): boolean {
  return GUARDED_WORD_IDS.has(word.id) || GUARDED_CATEGORY_IDS.has(word.category);
}

/** Which guarded topics are fully published, given the published words.
 * A topic with several releases opens only when every one of them is complete. */
export function guardedPublicationState(
  published: Iterable<{ id: string; category: string }>,
): Map<string, boolean> {
  const keys = new Set<string>();
  for (const { id, category } of published) keys.add(`${category}:${id}`);
  const states = new Map<string, boolean>();
  for (const { category, ids } of GUARDED_SERIES) {
    states.set(
      category,
      (states.get(category) ?? true) && ids.every((id) => keys.has(`${category}:${id}`)),
    );
  }
  return states;
}

/** Word ids whose guarded topic is not yet fully published. Their content
 * belongs to the publisher until then, so deploy-time maintenance skips them. */
export function unpublishedGuardedWordIds(state: ReadonlyMap<string, boolean>): Set<string> {
  const ids = new Set<string>();
  for (const series of GUARDED_SERIES) {
    if (state.get(series.category)) continue;
    for (const id of series.ids) ids.add(id);
  }
  return ids;
}
