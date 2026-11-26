// 跟著 Moira 去旅遊 — the destinations, their cities, and the 景點 in each.
//
// A 景點 is a place plus the 官方圖鑑 words someone meets there. It owns no
// content: every id in `wordIds` is an ordinary dictionary word that lives in
// its own theme, so a spot is a second way into words that already exist.
//
// Code, not a table: the list changes only with a deploy, never by an admin
// edit. Served by /api/travel so adding a spot is a deploy, not an app
// release, and all three clients read the same list.
//
// A spot is OPEN only when every one of its words is served.
//
// Which spots a non-member may study is pricing, kept in study-membership.ts.
//
// The maps are drawn by the client from the shapes here, not shipped as
// images: no text is baked in, so one description serves every UI language,
// and a new city is a few shapes rather than an illustration.
//
// Two generations of map ride in one answer. App versions before 2026-11 draw
// the country from `grid`/`tiles` and a city from `at`/`label` (spots nudged
// apart so names fit beside them). Later ones draw the country from `map`
// (real outlines, one colour per region, a card per open region) and a city
// from `pin`/`tag` (every marker on its true place, its name on a tag joined
// by a line). Both come from tools/travel-japan in the parent repo.

import { toZhHans } from "../opencc";
import type { UiLang } from "../settings";
import { CHUBU } from "./japan/chubu";
import { CHUGOKU } from "./japan/chugoku";
import { HOKKAIDO } from "./japan/hokkaido";
import { KANSAI } from "./japan/kansai";
import { KANTO } from "./japan/kanto";
import { KYUSHU } from "./japan/kyushu";
import { OKINAWA } from "./japan/okinawa";
import { SHIKOKU } from "./japan/shikoku";
import { TOHOKU } from "./japan/tohoku";
import { SPOT_LAYOUT } from "./japan/layout";
import { JAPAN_MAP } from "./japan/map";

/** zh-Hant base; zh-Hans is converted at read time like every other name. */
interface Names {
  zh: string;
  ja: string;
  en: string;
}

/** A position inside a map, 0–1 on each axis, origin top-left. */
type Point = readonly [x: number, y: number];

/**
 * Where a spot is on the ground: a centre and how far from it a photo still
 * counts as taken there. Only the iOS app uses it, on the device, to suggest a
 * spot for a photo that carries its own location — the coordinates of a photo
 * never reach the server (parent repo docs/adr/0002). Circles of neighbouring
 * spots must not overlap, so a point matches at most one.
 */
export interface SpotGeo {
  lat: number;
  lng: number;
  radiusM: number;
}

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
  geo: SpotGeo;
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

/** Where a spot goes on the 2026-11 city map, 0–1 inside the city's map. */
export interface SpotLayout {
  /** The true place (two markers that would touch are spread a few points). */
  pin: Point;
  /** The centre of the tag carrying the spot's number and name, per language. */
  tag: { zh: Point; ja: Point; en: Point };
  /** Languages where the name has no room, so the tag carries only the number. */
  short?: readonly ("zh" | "ja" | "en")[];
}

/** A region on the 2026-11 country map. */
export interface CountryMapRegion {
  /** Which of the clients' map colours fills it while it has an open city. */
  tone: number;
  /** Closed areas, 0–1 inside the map. */
  shapes: readonly (readonly Point[])[];
  /** Where the plain name goes when there is no card. */
  labelAt: Point;
  /** Where the card's line ends, on the region. */
  pointAt: Point;
  /** Top-left corner and width (share of the map's width); null: never a card. */
  card: { at: Point; width: number } | null;
}

/** The 2026-11 country map. Positions are 0–1; `aspect` is width over height. */
export interface CountryMap {
  aspect: number;
  /** Closed outlines of every island, drawn as the coast line. */
  coast: readonly (readonly Point[])[];
  /** Boxes drawn round an inset at its own scale (沖繩), top-left and size. */
  frames: readonly { at: Point; size: Point }[];
  seas: readonly { name: Names; at: Point }[];
  regions: Readonly<Record<string, CountryMapRegion>>;
  /** Each city's dot. */
  cityAt: Readonly<Record<string, Point>>;
}

export interface TravelDestination {
  id: string;
  name: Names;
  /**
   * The language of the place. A 自製圖鑑 card may be tagged to a spot here
   * only when it is a card for this language (lib/travel/spot-tagging.ts).
   */
  language: "ja" | "en";
  grid: { columns: number; rows: number };
  regions: readonly TravelRegion[];
  cities: readonly TravelCity[];
  map?: CountryMap;
  /** Keyed by spot id. */
  spotLayout?: Readonly<Record<string, SpotLayout>>;
}

export const TRAVEL_DESTINATIONS: readonly TravelDestination[] = [
  {
    id: "japan",
    name: { zh: "日本", ja: "日本", en: "Japan" },
    language: "ja",
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
    cities: [...HOKKAIDO, ...TOHOKU, ...KANTO, ...CHUBU, ...KANSAI, ...CHUGOKU, ...SHIKOKU, ...KYUSHU, ...OKINAWA],
    map: JAPAN_MAP,
    spotLayout: SPOT_LAYOUT,
  },
];

/** Every spot, across destinations. Spot ids are unique among them all. */
export function allTravelSpots(
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): TravelSpot[] {
  return destinations.flatMap((d) => d.cities.flatMap((c) => [...c.spots]));
}

/** The destination a spot belongs to, for its language. */
export function destinationOfSpot(
  spotId: string,
  destinations: readonly TravelDestination[] = TRAVEL_DESTINATIONS,
): TravelDestination | null {
  return destinations.find((d) => d.cities.some((c) => c.spots.some((s) => s.id === spotId))) ?? null;
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

/** Which of a layout's three languages a UI language reads. */
function layoutLang(lang: UiLang): "zh" | "ja" | "en" {
  return lang === "ja" ? "ja" : lang === "en" ? "en" : "zh";
}

// A card on the country map: 2pt border and 10pt padding each side, the
// cities in 13pt. Matches tuji-ios TravelCountryMap.
const COUNTRY_MAP_WIDTH_PT = 358;
const CARD_INSET_PT = 2 + 10;
const CARD_LINE_PT = 13;
const CARD_MAX_LINES = 2;

function estimatedWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x2e80 ? size : ch === " " ? size * 0.28 : size * 0.6;
  }
  return w;
}

/**
 * The open cities' names broken into at most two lines that fit a card this
 * wide; what does not fit becomes "+N" at the end. Broken here rather than on
 * the device so a name never splits between two lines.
 */
export function cardLines(names: readonly string[], width: number, lang: UiLang): string[] {
  const sep = lang === "en" ? " · " : "  ";
  const room = width * COUNTRY_MAP_WIDTH_PT - 2 * CARD_INSET_PT;
  const fits = (line: string) => estimatedWidth(line, CARD_LINE_PT) <= room;
  const lines: string[][] = [[]];
  for (const name of names) {
    const line = lines[lines.length - 1];
    if (!line.length || fits([...line, name].join(sep))) line.push(name);
    else lines.push([name]);
  }
  if (lines.length <= CARD_MAX_LINES) return lines.map((l) => l.join(sep));
  const kept = lines.slice(0, CARD_MAX_LINES);
  const last = kept[CARD_MAX_LINES - 1];
  const shown = () => kept.reduce((a, l) => a + l.length, 0);
  const more = () => `+${names.length - shown()}`;
  while (last.length > 1 && !fits([...last, more()].join(sep))) last.pop();
  return kept.map((l, i) => (i === CARD_MAX_LINES - 1 ? [...l, more()] : l).join(sep));
}

/** What a client receives: one name per thing, in the request's language. */
export interface LocalizedTravelDestination {
  id: string;
  name: string;
  language: "ja" | "en";
  grid: { columns: number; rows: number };
  /** The 2026-11 country map; missing from a destination without one. */
  map?: {
    aspect: number;
    coast: Point[][];
    frames: { at: Point; size: Point }[];
    seas: { name: string; at: Point }[];
  };
  regions: {
    id: string;
    name: string;
    tiles: Point[];
    nameAt: Point;
    cityIds: string[];
    /** The rest is the 2026-11 map's, present when the destination has `map`. */
    tone?: number;
    shapes?: Point[][];
    labelAt?: Point;
    /** Only for a region with an open city. `lines` name those cities. */
    card?: { at: Point; width: number; pointAt: Point; lines: string[] };
  }[];
  cities: {
    id: string;
    name: string;
    regionId: string;
    /** The city's dot on the country map. */
    mapAt?: Point;
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
      /** Only on an open spot. */
      geo?: SpotGeo;
      /** The 2026-11 city map: the true place, and the tag's centre. */
      pin?: Point;
      tag?: Point;
      /** The tag carries only the number; the name had no room. */
      tagShort?: true;
    }[];
  }[];
}

/**
 * The destinations as a client should see them.
 *
 * A city with no open spot is dropped, and so is a destination with no city
 * left, so a client can show the entry exactly when the list is non-empty.
 * Inside a listed city closed spots stay, and so do empty regions — the map
 * draws them as 還沒開.
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
  const ll = layoutLang(lang);
  return destinations.flatMap((d) => {
    const cities = d.cities.map((c) => ({
      id: c.id,
      name: named(c.name, lang),
      regionId: c.regionId,
      ...(d.map?.cityAt[c.id] ? { mapAt: d.map.cityAt[c.id] } : {}),
      aspect: c.aspect,
      shapes: c.shapes.map((s) =>
        s.kind === "ring"
          ? { kind: s.kind, center: s.center, radius: s.radius, name: named(s.name, lang), nameAt: s.nameAt }
          : { kind: s.kind, points: [...s.points], name: named(s.name, lang), nameAt: s.nameAt },
      ),
      spots: c.spots.map((s) => {
        const open = s.wordIds.every((id) => servedWordIds.has(id));
        const layout = d.spotLayout?.[s.id];
        return {
          id: s.id,
          name: named(s.name, lang),
          native: s.native,
          reading: s.reading,
          at: s.at,
          label: s.label,
          wordIds: [...s.wordIds],
          open,
          free: freeSpotIds.includes(s.id),
          ...(open ? { geo: { ...s.geo } } : {}),
          ...(layout
            ? { pin: layout.pin, tag: layout.tag[ll], ...(layout.short?.includes(ll) ? { tagShort: true as const } : {}) }
            : {}),
        };
      }),
    }));
    const listed = cities.filter((c) => c.spots.some((s) => s.open));
    if (!listed.length) return [];
    return [
      {
        id: d.id,
        name: named(d.name, lang),
        language: d.language,
        grid: d.grid,
        ...(d.map
          ? {
              map: {
                aspect: d.map.aspect,
                coast: d.map.coast.map((s) => [...s]),
                frames: d.map.frames.map((f) => ({ ...f })),
                seas: d.map.seas.map((x) => ({ name: named(x.name, lang), at: x.at })),
              },
            }
          : {}),
        regions: d.regions.map((r) => {
          const open = listed.filter((c) => c.regionId === r.id);
          const m = d.map?.regions[r.id];
          return {
            id: r.id,
            name: named(r.name, lang),
            tiles: [...r.tiles],
            nameAt: r.nameAt,
            cityIds: open.map((c) => c.id),
            ...(m
              ? {
                  tone: m.tone,
                  shapes: m.shapes.map((s) => [...s]),
                  labelAt: m.labelAt,
                  ...(m.card && open.length
                    ? {
                        card: {
                          at: m.card.at,
                          width: m.card.width,
                          pointAt: m.pointAt,
                          lines: cardLines(open.map((c) => c.name), m.card.width, lang),
                        },
                      }
                    : {}),
                }
              : {}),
          };
        }),
        cities: listed,
      },
    ];
  });
}
