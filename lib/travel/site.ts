// 跟著 Moira 去旅遊 on the website: /travel, a city, a 景點.
//
// The same list the apps read (./destinations.ts), joined to the dictionary so
// a page can show the words themselves. The words are always the 日文 ones —
// the spots name Japanese places — whatever the visitor is learning.
//
// A closed spot has no page: half of its words would be missing, and a page
// that lists five of eight things teaches the wrong eight. It opens when the
// dictionary serves all of them, exactly as in the apps.

import { getAllCardWords } from "@/lib/data";
import type { UiLang } from "@/lib/settings";
import { FREE_STUDY_SPOTS } from "@/lib/study-membership";
import type { CardWord } from "@/types";
import { localizeTravelDestinations, type LocalizedTravelDestination } from "./destinations";

export type SiteCity = LocalizedTravelDestination["cities"][number] & { destinationName: string };
export type SiteSpot = SiteCity["spots"][number];

export interface TravelSite {
  cities: SiteCity[];
  /** The spot's words, in the spot's order. */
  wordsOf(spot: SiteSpot): CardWord[];
}

export async function loadTravelSite(lang: UiLang): Promise<TravelSite> {
  const words = await getAllCardWords(lang, "zh-ja");
  const byId = new Map(words.map((w) => [w.id, w]));
  const destinations = localizeTravelDestinations(lang, new Set(byId.keys()), FREE_STUDY_SPOTS);
  return {
    // Only cities with something to open: a destination that is listed can
    // still hold a city whose every spot is closed.
    cities: destinations.flatMap((d) =>
      d.cities.filter((c) => c.spots.some((s) => s.open)).map((c) => ({ ...c, destinationName: d.name })),
    ),
    wordsOf: (spot) => spot.wordIds.flatMap((id) => byId.get(id) ?? []),
  };
}

type Copy = Record<"title" | "lead" | "spots" | "notOpen" | "seenHere" | "seenLead" | "inApp", string>;

const COPY: Record<UiLang, Copy> = {
  "zh-Hant": {
    title: "跟著 Moira 去旅遊",
    lead: "挑一個地方，看那裡會遇到什麼。",
    spots: "{n} 個景點",
    notOpen: "還沒開",
    seenHere: "{name}會看到的東西",
    seenLead: "到了{name}會遇到的 {n} 樣東西，日文怎麼說。",
    inApp: "在 App 的物見裡可以照著地圖一個一個學。",
  },
  "zh-Hans": {
    title: "跟着 Moira 去旅游",
    lead: "挑一个地方，看那里会遇到什么。",
    spots: "{n} 个景点",
    notOpen: "还没开",
    seenHere: "{name}会看到的东西",
    seenLead: "到了{name}会遇到的 {n} 样东西，日语怎么说。",
    inApp: "在 App 的物见里可以照着地图一个一个学。",
  },
  en: {
    title: "Travel with Moira",
    lead: "Pick a place and see what you will run into there.",
    spots: "{n} to visit",
    notOpen: "Not open yet",
    seenHere: "What you'll see in {name}",
    seenLead: "{n} things you will meet in {name}, and what they are called in Japanese.",
    inApp: "In the app, Sightings has the map to study them one by one.",
  },
  ja: {
    title: "Moiraと旅に出る",
    lead: "場所を選んで、そこで出会うものを見てみましょう。",
    spots: "スポット {n}件",
    notOpen: "準備中",
    seenHere: "{name}で見かけるもの",
    seenLead: "{name}で出会う{n}個のものと、その日本語。",
    inApp: "アプリの物見では、地図をたどって一つずつ学べます。",
  },
};

export function travelCopy(lang: UiLang, key: keyof Copy, vars: Record<string, string | number> = {}): string {
  const text = (COPY[lang] ?? COPY["zh-Hant"])[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}
