// 情境故事's places and what is happening there. The server owns the list: the
// app reads it from the offer, so adding a place is a deploy, not a release.

export type StoryUiLanguage = "zh-Hant" | "zh-Hans" | "ja" | "en";
export type Labels = Record<StoryUiLanguage, string>;

export interface StorySituation { id: string; label: Labels }
export interface StoryScene { id: string; label: Labels; situations: StorySituation[] }

const chat: StorySituation = { id: "chat", label: { "zh-Hant": "閒聊", "zh-Hans": "闲聊", ja: "雑談", en: "Small talk" } };

export const STORY_SCENES: StoryScene[] = [
  {
    id: "supermarket",
    label: { "zh-Hant": "超市", "zh-Hans": "超市", ja: "スーパー", en: "Supermarket" },
    situations: [
      { id: "shopping", label: { "zh-Hant": "買東西", "zh-Hans": "买东西", ja: "買い物", en: "Shopping" } },
      { id: "choosing", label: { "zh-Hant": "挑選商品", "zh-Hans": "挑选商品", ja: "商品選び", en: "Picking items" } },
      chat,
    ],
  },
  {
    id: "office",
    label: { "zh-Hant": "辦公室", "zh-Hans": "办公室", ja: "オフィス", en: "Office" },
    situations: [
      { id: "work", label: { "zh-Hant": "工作溝通", "zh-Hans": "工作沟通", ja: "仕事の相談", en: "Work talk" } },
      { id: "lunch-break", label: { "zh-Hant": "午休", "zh-Hans": "午休", ja: "昼休み", en: "Lunch break" } },
      chat,
    ],
  },
  {
    id: "restaurant",
    label: { "zh-Hant": "餐廳", "zh-Hans": "餐厅", ja: "レストラン", en: "Restaurant" },
    situations: [
      { id: "ordering", label: { "zh-Hant": "點餐", "zh-Hans": "点餐", ja: "注文", en: "Ordering" } },
      { id: "paying", label: { "zh-Hant": "結帳", "zh-Hans": "结账", ja: "お会計", en: "Paying" } },
      chat,
    ],
  },
  {
    id: "station",
    label: { "zh-Hant": "車站", "zh-Hans": "车站", ja: "駅", en: "Station" },
    situations: [
      { id: "directions", label: { "zh-Hant": "問路", "zh-Hans": "问路", ja: "道を聞く", en: "Asking the way" } },
      { id: "tickets", label: { "zh-Hant": "買票", "zh-Hans": "买票", ja: "切符を買う", en: "Buying tickets" } },
      { id: "waiting", label: { "zh-Hant": "等車", "zh-Hans": "等车", ja: "電車を待つ", en: "Waiting for a train" } },
    ],
  },
  {
    id: "home",
    label: { "zh-Hant": "家裡", "zh-Hans": "家里", ja: "家", en: "Home" },
    situations: [
      { id: "cooking", label: { "zh-Hant": "做飯", "zh-Hans": "做饭", ja: "料理", en: "Cooking" } },
      { id: "cleaning", label: { "zh-Hant": "打掃", "zh-Hans": "打扫", ja: "掃除", en: "Cleaning" } },
      chat,
    ],
  },
];

export function findScene(sceneId: string, situationId: string) {
  const scene = STORY_SCENES.find(s => s.id === sceneId);
  const situation = scene?.situations.find(s => s.id === situationId);
  return scene && situation ? { scene, situation } : null;
}
