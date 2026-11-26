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

// ---------- the 2026-11 maps (tuji-ios TravelCityMap, TravelCountryMap) ----------

const PIN_PT = 8;
const TAG_HEIGHT_PT = 28;
const SHORT_TAG_PT = 28;
const tagWidthPt = (name: string) => 42 + textWidth(name, 14);

function enters(a: readonly [number, number], b: readonly [number, number], r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]];
  for (const [p, q] of [[-d[0], a[0] - r[0]], [d[0], r[2] - a[0]], [-d[1], a[1] - r[1]], [d[1], r[3] - a[1]]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function tagCollisions(city: TravelCity): string[] {
  const japan = TRAVEL_DESTINATIONS.find((d) => d.cities.includes(city));
  const W = IOS_SMALL_PHONE_MAP_WIDTH_PT;
  const H = W / city.aspect;
  const out: string[] = [];
  for (const lang of ["zh", "ja", "en"] as const) {
    const layouts = city.spots.map((s) => japan?.spotLayout?.[s.id]);
    if (layouts.some((l) => !l)) return [`${city.id} has a spot with no tag`];
    const pins = layouts.map((l) => [l!.pin[0] * W, l!.pin[1] * H] as const);
    const rects = city.spots.map((s, i): Rect => {
      const l = layouts[i]!;
      const w = l.short?.includes(lang) ? SHORT_TAG_PT : tagWidthPt(s.name[lang]);
      const [x, y] = [l.tag[lang][0] * W, l.tag[lang][1] * H];
      return [x - w / 2, y - TAG_HEIGHT_PT / 2, x + w / 2, y + TAG_HEIGHT_PT / 2];
    });
    const shapeLabels = city.shapes.map((s): Rect => {
      const w = textWidth(s.name[lang], 13);
      const x = s.nameAt[0] * W;
      const y = s.nameAt[1] * H;
      return [x - w / 2, y - IOS_SHAPE_NAME_HEIGHT_PT / 2, x + w / 2, y + IOS_SHAPE_NAME_HEIGHT_PT / 2];
    });
    city.spots.forEach((a, i) => {
      const r = rects[i];
      if (r[0] < 0 || r[1] < 0 || r[2] > W || r[3] > H) out.push(`${city.id} ${a.id} ${lang} tag runs off the map`);
      const centre = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2] as const;
      city.spots.forEach((b, j) => {
        const p = pins[j];
        if (meets(r, [p[0] - PIN_PT, p[1] - PIN_PT, p[0] + PIN_PT, p[1] + PIN_PT])) out.push(`${city.id} ${a.id} ${lang} tag × ${b.id} marker`);
        if (j > i && meets(r, rects[j])) out.push(`${city.id} ${a.id} ${lang} tag × ${b.id} tag`);
        if (j !== i) {
          const q = rects[j];
          if (enters(pins[i], centre, [q[0] - 1, q[1] - 1, q[2] + 1, q[3] + 1])) out.push(`${city.id} ${a.id} ${lang} line runs through ${b.id}'s tag`);
        }
      });
      shapeLabels.forEach((s, k) => {
        if (meets(r, s)) out.push(`${city.id} ${a.id} ${lang} tag × ${city.shapes[k].name.en} name`);
      });
    });
    pins.forEach((p, i) => {
      pins.forEach((q, j) => {
        if (j > i && Math.hypot(p[0] - q[0], p[1] - q[1]) < 2 * PIN_PT) out.push(`${city.id} ${city.spots[i].id} marker × ${city.spots[j].id} marker`);
      });
    });
  }
  return out;
}

test("on the 2026-11 city map no tag covers another, a marker or a shape's name, and no line runs through a tag", () => {
  assert.deepEqual(TRAVEL_DESTINATIONS.flatMap((d) => d.cities.flatMap(tagCollisions)), []);
});

test("Chinese and Japanese tags always carry the name; only English may fall back to the number", () => {
  for (const d of TRAVEL_DESTINATIONS) {
    for (const [id, l] of Object.entries(d.spotLayout ?? {})) {
      assert.ok(!(l.short ?? []).some((x) => x !== "en"), `${id} drops its name in ${l.short}`);
    }
  }
});

test("the country map's areas, coast and dots sit inside it, and no two cards meet", () => {
  const COUNTRY_W = 358;
  const CARD_H = 74;
  for (const d of TRAVEL_DESTINATIONS) {
    const map = d.map;
    if (!map) continue;
    const H = COUNTRY_W / map.aspect;
    const inside = ([x, y]: readonly [number, number]) => x >= 0 && x <= 1 && y >= 0 && y <= 1;
    for (const s of map.coast) assert.ok(s.every(inside) && s.length >= 3, `${d.id} coast`);
    for (const r of d.regions) {
      const m = map.regions[r.id];
      assert.ok(m, `${r.id} has no area`);
      assert.ok(m.shapes.length && m.shapes.every((s) => s.length >= 3 && s.every(inside)), `${r.id} area`);
      assert.ok(inside(m.labelAt) && inside(m.pointAt), `${r.id} label`);
    }
    for (const c of d.cities) assert.ok(map.cityAt[c.id] && inside(map.cityAt[c.id]), `${c.id} has no dot`);
    const cards = Object.entries(map.regions).flatMap(([id, m]): [string, Rect][] =>
      m.card ? [[id, [m.card.at[0] * COUNTRY_W, m.card.at[1] * H, (m.card.at[0] + m.card.width) * COUNTRY_W, m.card.at[1] * H + CARD_H]]] : []);
    const frames = map.frames.map((f): [string, Rect] => ["inset", [f.at[0] * COUNTRY_W, f.at[1] * H, (f.at[0] + f.size[0]) * COUNTRY_W, (f.at[1] + f.size[1]) * H]]);
    const boxes = [...cards, ...frames];
    boxes.forEach(([a, r], i) => {
      assert.ok(r[0] >= 0 && r[1] >= 0 && r[2] <= COUNTRY_W && r[3] <= H, `${a} card runs off the map`);
      boxes.slice(i + 1).forEach(([b, q]) => assert.ok(!meets(r, q), `${a} card × ${b}`));
    });
  }
});
