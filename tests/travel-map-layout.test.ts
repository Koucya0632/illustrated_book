// Pins how a city map reads (lib/travel/destinations.ts → the apps' city map).
//
// THE RED LINE:
//   - On every city map, in every UI language, no spot's name covers another
//     spot's marker or name, runs off the map, or covers a river's or sea's
//     name. The apps place names with no collision avoidance (iOS
//     TravelCityView: a 28pt marker, the name in 14pt bold 20pt off one side,
//     about 335pt wide on a small phone), so the data must already fit.
//
// Text widths are estimates (CJK one em, Latin 0.6 em). The parent repo's
// tools/travel-japan/layout.mjs places generated cities by the same rule.

import assert from "node:assert/strict";
import test from "node:test";
import { TRAVEL_DESTINATIONS, type TravelCity } from "../lib/travel/destinations";

const WIDTH = 335;
const MARKER = 28;
const GAP = 20;
const LABEL = 18;
const SHAPE_LABEL = 16;
const MARGIN = 2;

type Rect = [number, number, number, number];

function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x2e80 ? size : ch === " " ? size * 0.28 : size * 0.6;
  }
  return w;
}

const meets = (a: Rect, b: Rect) =>
  a[0] < b[2] + MARGIN && b[0] < a[2] + MARGIN && a[1] < b[3] + MARGIN && b[1] < a[3] + MARGIN;

function collisions(city: TravelCity): string[] {
  const H = WIDTH / city.aspect;
  const out: string[] = [];
  const pts = city.spots.map((s) => [s.at[0] * WIDTH, s.at[1] * H] as const);
  const markers = pts.map(([x, y]): Rect => [x - MARKER / 2, y - MARKER / 2, x + MARKER / 2, y + MARKER / 2]);
  city.spots.forEach((a, i) => {
    city.spots.forEach((b, j) => {
      if (j > i && meets(markers[i], markers[j])) out.push(`${city.id} ${a.id} marker × ${b.id} marker`);
    });
  });
  for (const lang of ["zh", "ja", "en"] as const) {
    const labels = city.spots.map((s, i): Rect => {
      const [x, y] = pts[i];
      const w = textWidth(s.name[lang], 14);
      return s.label === "right"
        ? [x + GAP, y - LABEL / 2, x + GAP + w, y + LABEL / 2]
        : [x - GAP - w, y - LABEL / 2, x - GAP, y + LABEL / 2];
    });
    const shapeLabels = city.shapes.map((s): Rect => {
      const w = textWidth(s.name[lang], 13);
      const x = s.nameAt[0] * WIDTH;
      const y = s.nameAt[1] * H;
      return [x - w / 2, y - SHAPE_LABEL / 2, x + w / 2, y + SHAPE_LABEL / 2];
    });
    city.spots.forEach((a, i) => {
      const l = labels[i];
      if (l[0] < 0 || l[1] < 0 || l[2] > WIDTH || l[3] > H) out.push(`${city.id} ${a.id} ${lang} name runs off the map`);
      city.spots.forEach((b, j) => {
        if (i === j) return;
        if (meets(l, markers[j])) out.push(`${city.id} ${a.id} ${lang} name × ${b.id} marker`);
        if (j > i && meets(l, labels[j])) out.push(`${city.id} ${a.id} ${lang} name × ${b.id} name`);
      });
      city.shapes.forEach((s, k) => {
        if (meets(l, shapeLabels[k]) || meets(markers[i], shapeLabels[k])) {
          out.push(`${city.id} ${a.id} ${lang} × ${s.name.en} name`);
        }
      });
    });
  }
  return out;
}

test("no name on any city map covers another or runs off it, in any language", () => {
  assert.deepEqual(TRAVEL_DESTINATIONS.flatMap((d) => d.cities.flatMap(collisions)), []);
});
