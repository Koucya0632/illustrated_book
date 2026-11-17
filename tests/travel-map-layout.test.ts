import assert from "node:assert/strict";
import test from "node:test";
import { TRAVEL_DESTINATIONS, type TravelCity } from "../lib/travel/destinations";

const IOS_SMALL_PHONE_MAP_WIDTH_PT = 335;
const IOS_MARKER_PT = 28;
const IOS_NAME_OFFSET_PT = 20;
const IOS_NAME_HEIGHT_PT = 18;
const IOS_SHAPE_NAME_HEIGHT_PT = 16;
const MIN_GAP_PT = 2;

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
  a[0] < b[2] + MIN_GAP_PT && b[0] < a[2] + MIN_GAP_PT && a[1] < b[3] + MIN_GAP_PT && b[1] < a[3] + MIN_GAP_PT;

function collisions(city: TravelCity): string[] {
  const H = IOS_SMALL_PHONE_MAP_WIDTH_PT / city.aspect;
  const out: string[] = [];
  const pts = city.spots.map((s) => [s.at[0] * IOS_SMALL_PHONE_MAP_WIDTH_PT, s.at[1] * H] as const);
  const markers = pts.map(([x, y]): Rect => [x - IOS_MARKER_PT / 2, y - IOS_MARKER_PT / 2, x + IOS_MARKER_PT / 2, y + IOS_MARKER_PT / 2]);
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
        ? [x + IOS_NAME_OFFSET_PT, y - IOS_NAME_HEIGHT_PT / 2, x + IOS_NAME_OFFSET_PT + w, y + IOS_NAME_HEIGHT_PT / 2]
        : [x - IOS_NAME_OFFSET_PT - w, y - IOS_NAME_HEIGHT_PT / 2, x - IOS_NAME_OFFSET_PT, y + IOS_NAME_HEIGHT_PT / 2];
    });
    const shapeLabels = city.shapes.map((s): Rect => {
      const w = textWidth(s.name[lang], 13);
      const x = s.nameAt[0] * IOS_SMALL_PHONE_MAP_WIDTH_PT;
      const y = s.nameAt[1] * H;
      return [x - w / 2, y - IOS_SHAPE_NAME_HEIGHT_PT / 2, x + w / 2, y + IOS_SHAPE_NAME_HEIGHT_PT / 2];
    });
    city.spots.forEach((a, i) => {
      const l = labels[i];
      if (l[0] < 0 || l[1] < 0 || l[2] > IOS_SMALL_PHONE_MAP_WIDTH_PT || l[3] > H) out.push(`${city.id} ${a.id} ${lang} name runs off the map`);
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
