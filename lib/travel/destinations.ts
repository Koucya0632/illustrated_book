// 跟著 Moira 去旅遊 — the destinations, their cities, and the 景點 in each.
//
// A 景點 is a place plus the 官方圖鑑 words someone meets there. It owns no
// content: every id in `wordIds` is an ordinary dictionary word that lives in
// its own theme, so a spot is a second way into words that already exist.
//
// Code, not a table, for the reason lib/topic-presets.ts gives: short lists
// only a developer edits. Served by /api/travel so adding a spot is a deploy,
// not an app release, and all three clients read the same list.
//
// A spot is OPEN only when every one of its words is served. Content ships on
// its own schedule (docs/content/travel-spots-tokyo-request.md in the parent
// repo), so a spot whose words are not published yet answers `open: false`
// and opens by itself the moment they are — nobody has to flip it.
//
// Which spots a non-member may study is pricing, kept in study-membership.ts.
//
// The maps are drawn by the client from the shapes here, not shipped as
// images: no text is baked in, so one description serves every UI language,
// and a new city is a few shapes rather than an illustration.

import { toZhHans } from "../opencc";
import type { UiLang } from "../settings";

/** zh-Hant base; zh-Hans is converted at read time like every other name. */
interface Names {
  zh: string;
  ja: string;
  en: string;
}

/** A position inside a map, 0–1 on each axis, origin top-left. */
type Point = readonly [x: number, y: number];

export interface TravelSpot {
  id: string;
  name: Names;
  /** How the place itself is written and read in Japanese. */
  native: string;
  reading: string;
  at: Point;
  /** Which side of the marker the name sits on, so neighbours don't collide. */
  label: "left" | "right";
  wordIds: readonly string[];
}

/** What a city map is made of. Positions are 0–1 inside `aspect`. */
export type MapShape =
  | { kind: "ring"; center: Point; radius: Point; name: Names; nameAt: Point }
  | { kind: "river"; points: readonly Point[]; name: Names; nameAt: Point }
  | { kind: "water"; points: readonly Point[]; name: Names; nameAt: Point };

export interface TravelCity {
  id: string;
  name: Names;
  regionId: string;
  /** Width over height of the box the shapes and spots are placed in. */
  aspect: number;
  shapes: readonly MapShape[];
  spots: readonly TravelSpot[];
}

export interface TravelRegion {
  id: string;
  name: Names;
  /** Grid cells, [column, row]. */
  tiles: readonly Point[];
  /** Where the name goes, in cells; may sit between cells. */
  nameAt: Point;
}

export interface TravelDestination {
  id: string;
  name: Names;
  grid: { columns: number; rows: number };
  regions: readonly TravelRegion[];
  cities: readonly TravelCity[];
}

const TOKYO: TravelCity = {
  id: "tokyo",
  name: { zh: "東京", ja: "東京", en: "Tokyo" },
  regionId: "kanto",
  aspect: 390 / 270,
  shapes: [
    {
      kind: "water",
      points: [[0.641, 1], [0.697, 0.844], [1, 0.785], [1, 1]],
      name: { zh: "東京灣", ja: "東京湾", en: "Tokyo Bay" },
      nameAt: [0.88, 0.92],
    },
    {
      kind: "river",
      points: [[0.826, 0], [0.79, 0.3], [0.83, 0.56], [0.759, 0.86]],
      name: { zh: "隅田川", ja: "隅田川", en: "Sumida River" },
      nameAt: [0.9, 0.43],
    },
    {
      kind: "ring",
      center: [0.449, 0.5],
      radius: [0.2, 0.326],
      name: { zh: "山手線", ja: "山手線", en: "Yamanote Line" },
      nameAt: [0.449, 0.5],
    },
  ],
  spots: [
    {
      id: "asakusa",
      name: { zh: "淺草", ja: "浅草", en: "Asakusa" },
      native: "浅草",
      reading: "あさくさ",
      at: [0.733, 0.193],
      label: "right",
      wordIds: [
        "paper-lantern", "rickshaw", "shop", "kimono", "folding-fan",
        "fortune-slip", "offering-box", "ningyo-yaki",
      ],
    },
    {
      id: "ueno",
      name: { zh: "上野", ja: "上野", en: "Ueno" },
      native: "上野",
      reading: "うえの",
      at: [0.577, 0.252],
      label: "left",
      wordIds: [
        "park", "boat", "cherry-tree-avenue", "cherry-blossom-viewing", "picnic-sheet",
        "pond", "zoo", "museum",
      ],
    },
    {
      id: "akihabara",
      name: { zh: "秋葉原", ja: "秋葉原", en: "Akihabara" },
      native: "秋葉原",
      reading: "あきはばら",
      at: [0.636, 0.389],
      label: "right",
      wordIds: [
        "capsule-toy-machine", "claw-machine", "character-figure", "acrylic-stand",
        "trading-card", "plastic-model-kit", "photo-sticker-booth", "pin-badge",
      ],
    },
    {
      id: "tsukiji",
      name: { zh: "築地", ja: "築地", en: "Tsukiji" },
      native: "築地",
      reading: "つきじ",
      at: [0.672, 0.763],
      label: "right",
      wordIds: [
        "kitchen-knife", "wasabi", "dipping-dish", "sushi-chef", "fishmonger",
        "tuna", "seafood-rice-bowl", "rolled-omelette",
      ],
    },
    {
      id: "shibuya",
      name: { zh: "澀谷", ja: "渋谷", en: "Shibuya" },
      native: "渋谷",
      reading: "しぶや",
      at: [0.295, 0.711],
      label: "left",
      wordIds: [
        "intersection", "crosswalk", "traffic-light", "billboard", "pedestrian",
        "photo-sticker-booth", "large-video-screen", "bronze-statue",
      ],
    },
    {
      id: "meiji-jingu",
      name: { zh: "明治神宮", ja: "明治神宮", en: "Meiji Jingu" },
      native: "明治神宮",
      reading: "めいじじんぐう",
      at: [0.249, 0.53],
      label: "left",
      wordIds: [
        "tree", "sake", "torii-gate", "shrine-approach", "purification-pavilion",
        "votive-plaque", "amulet", "sake-barrel",
      ],
    },
  ],
};

export const TRAVEL_DESTINATIONS: readonly TravelDestination[] = [
  {
    id: "japan",
    name: { zh: "日本", ja: "日本", en: "Japan" },
    grid: { columns: 14, rows: 16 },
    regions: [
      {
        id: "hokkaido",
        name: { zh: "北海道", ja: "北海道", en: "Hokkaido" },
        tiles: [[10, 0], [11, 0], [9, 1], [10, 1], [11, 1], [12, 1], [9, 2], [10, 2], [11, 2]],
        nameAt: [7.2, 1.5],
      },
      {
        id: "tohoku",
        name: { zh: "東北", ja: "東北", en: "Tohoku" },
        tiles: [[9, 4], [10, 4], [9, 5], [10, 5], [9, 6], [10, 6]],
        nameAt: [11.8, 5.5],
      },
      {
        id: "kanto",
        name: { zh: "關東", ja: "関東", en: "Kanto" },
        tiles: [[9, 7], [10, 7], [9, 8], [10, 8]],
        nameAt: [11.8, 7.5],
      },
      {
        id: "chubu",
        name: { zh: "中部", ja: "中部", en: "Chubu" },
        tiles: [[8, 6], [7, 7], [8, 7], [6, 8], [7, 8], [8, 8], [7, 9], [8, 9]],
        nameAt: [5.8, 7.5],
      },
      {
        id: "kansai",
        name: { zh: "關西", ja: "関西", en: "Kansai" },
        tiles: [[5, 9], [6, 9], [6, 10], [7, 10]],
        nameAt: [8.8, 10.6],
      },
      {
        id: "chugoku",
        name: { zh: "中國", ja: "中国", en: "Chugoku" },
        tiles: [[3, 9], [4, 9], [2, 10], [3, 10], [4, 10]],
        nameAt: [3.2, 8.5],
      },
      {
        id: "shikoku",
        name: { zh: "四國", ja: "四国", en: "Shikoku" },
        tiles: [[4, 11], [5, 11]],
        nameAt: [4.8, 12.6],
      },
      {
        id: "kyushu",
        name: { zh: "九州", ja: "九州", en: "Kyushu" },
        tiles: [[1, 11], [2, 11], [1, 12], [2, 12], [1, 13]],
        nameAt: [3.6, 13.5],
      },
      {
        id: "okinawa",
        name: { zh: "沖繩", ja: "沖縄", en: "Okinawa" },
        tiles: [[0, 15]],
        nameAt: [1.8, 15.5],
      },
    ],
    cities: [TOKYO],
  },
];

/** Every spot, across destinations. Spot ids are unique among them all. */
export function allTravelSpots(
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): TravelSpot[] {
  return destinations.flatMap((d) => d.cities.flatMap((c) => [...c.spots]));
}

export function findTravelSpot(
  id: string,
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): TravelSpot | null {
  return allTravelSpots(destinations).find((s) => s.id === id) ?? null;
}

function named(names: Names, lang: UiLang): string {
  switch (lang) {
    case "ja":
      return names.ja;
    case "en":
      return names.en;
    case "zh-Hans":
      return toZhHans(names.zh);
    default:
      return names.zh;
  }
}

/** What a client receives: one name per thing, in the request's language. */
export interface LocalizedTravelDestination {
  id: string;
  name: string;
  grid: { columns: number; rows: number };
  regions: { id: string; name: string; tiles: Point[]; nameAt: Point; cityIds: string[] }[];
  cities: {
    id: string;
    name: string;
    regionId: string;
    aspect: number;
    shapes: (
      | { kind: "ring"; center: Point; radius: Point; name: string; nameAt: Point }
      | { kind: "river" | "water"; points: Point[]; name: string; nameAt: Point }
    )[];
    spots: {
      id: string;
      name: string;
      native: string;
      reading: string;
      at: Point;
      label: "left" | "right";
      wordIds: string[];
      /** Every word is served, so the spot can be opened. */
      open: boolean;
      /** A non-member may study this spot. */
      free: boolean;
    }[];
  }[];
}

/**
 * The destinations as a client should see them.
 *
 * A destination with no open spot is dropped, so a client can show the entry
 * exactly when the list is non-empty. Inside a destination that is listed,
 * closed spots and empty regions stay — the map draws them as 還沒開.
 *
 * - Parameter servedWordIds: the ids the dictionary serves right now.
 * - Parameter freeSpotIds: `FREE_STUDY_SPOTS` (lib/study-membership.ts).
 */
export function localizeTravelDestinations(
  lang: UiLang,
  servedWordIds: ReadonlySet<string>,
  freeSpotIds: readonly string[],
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): LocalizedTravelDestination[] {
  return destinations.flatMap((d) => {
    const cities = d.cities.map((c) => ({
      id: c.id,
      name: named(c.name, lang),
      regionId: c.regionId,
      aspect: c.aspect,
      shapes: c.shapes.map((s) =>
        s.kind === "ring"
          ? { kind: s.kind, center: s.center, radius: s.radius, name: named(s.name, lang), nameAt: s.nameAt }
          : { kind: s.kind, points: [...s.points], name: named(s.name, lang), nameAt: s.nameAt },
      ),
      spots: c.spots.map((s) => ({
        id: s.id,
        name: named(s.name, lang),
        native: s.native,
        reading: s.reading,
        at: s.at,
        label: s.label,
        wordIds: [...s.wordIds],
        open: s.wordIds.every((id) => servedWordIds.has(id)),
        free: freeSpotIds.includes(s.id),
      })),
    }));
    if (!cities.some((c) => c.spots.some((s) => s.open))) return [];
    return [
      {
        id: d.id,
        name: named(d.name, lang),
        grid: d.grid,
        regions: d.regions.map((r) => ({
          id: r.id,
          name: named(r.name, lang),
          tiles: [...r.tiles],
          nameAt: r.nameAt,
          cityIds: d.cities.filter((c) => c.regionId === r.id).map((c) => c.id),
        })),
        cities,
      },
    ];
  });
}
