// 情境故事's places and what is happening there. The server owns the list: the
// app reads it from the offer, so adding a place is a deploy, not a release.

export type StoryUiLanguage = "zh-Hant" | "zh-Hans" | "ja" | "en";
export type Labels = Record<StoryUiLanguage, string>;

export interface StorySituation { id: string; label: Labels }
export interface StoryScene { id: string; label: Labels; situations: StorySituation[] }

// The same three for every place: what kind of conversation it is, not a
// script for that place. The place already says where; this says how.
const SITUATIONS: StorySituation[] = [
  { id: "daily", label: { "zh-Hant": "日常", "zh-Hans": "日常", ja: "日常", en: "Everyday" } },
  { id: "work", label: { "zh-Hant": "工作", "zh-Hans": "工作", ja: "仕事", en: "Work" } },
  { id: "chat", label: { "zh-Hant": "閒聊", "zh-Hans": "闲聊", ja: "雑談", en: "Small talk" } },
];

export const STORY_SCENES: StoryScene[] = [
  {
    id: "supermarket",
    label: { "zh-Hant": "超市", "zh-Hans": "超市", ja: "スーパー", en: "Supermarket" },
    situations: SITUATIONS,
  },
  {
    id: "office",
    label: { "zh-Hant": "辦公室", "zh-Hans": "办公室", ja: "オフィス", en: "Office" },
    situations: SITUATIONS,
  },
  {
    id: "restaurant",
    label: { "zh-Hant": "餐廳", "zh-Hans": "餐厅", ja: "レストラン", en: "Restaurant" },
    situations: SITUATIONS,
  },
  {
    id: "station",
    label: { "zh-Hant": "車站", "zh-Hans": "车站", ja: "駅", en: "Station" },
    situations: SITUATIONS,
  },
  {
    id: "home",
    label: { "zh-Hant": "家裡", "zh-Hans": "家里", ja: "家", en: "Home" },
    situations: SITUATIONS,
  },
];

export function findScene(sceneId: string, situationId: string) {
  const scene = STORY_SCENES.find(s => s.id === sceneId);
  const situation = scene?.situations.find(s => s.id === situationId);
  return scene && situation ? { scene, situation } : null;
}
