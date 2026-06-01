// Per-user app settings. Server + client safe (no hooks, no Node imports).

export type UiLang = "zh-Hant" | "zh-Hans" | "ja";
export type FontSize = "sm" | "md" | "lg";

export interface UserSettings {
  dailyGoal: number;
  accent: "us" | "uk";
  showZh: boolean;
  // Study theme: "all" = no filter, otherwise a category id (words.category).
  studyCategory: string;
  // Card decks to study; empty array = all decks.
  studyDecks: string[];
  uiLang: UiLang;
  fontSize: FontSize;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dailyGoal: 12,
  accent: "us",
  showZh: true,
  studyCategory: "all",
  studyDecks: [],
  uiLang: "zh-Hant",
  fontSize: "md",
};

// Card decks (deck_key) the user can pick to study. Only one deck exists
// today ("look at image, choose English"); the picker UI is hidden in the
// settings page, but the list stays so `normalizeStudyDecks` keeps an
// anchor for validation if the persisted value drifts.
export const STUDY_DECK_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "image-en", labelKey: "set.deckImageEn" },
];
export const STUDY_DECK_KEYS = STUDY_DECK_OPTIONS.map((o) => o.value);

// Keep only known deck keys, deduped, order following STUDY_DECK_KEYS.
function normalizeStudyDecks(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw.map(String) : [];
  const set = new Set(arr);
  return STUDY_DECK_KEYS.filter((k) => set.has(k));
}

export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 100;

export const ACCENT_OPTIONS: { value: UserSettings["accent"]; label: string }[] = [
  { value: "us", label: "美式英語" },
  { value: "uk", label: "英式英語" },
];

export function accentToLang(accent: UserSettings["accent"]): string {
  return accent === "uk" ? "en-GB" : "en-US";
}

// Clamp a free-form daily goal to an integer in [MIN, MAX]; fall back to the
// default when not a finite number.
export function clampDailyGoal(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.dailyGoal;
  return Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, Math.round(n)));
}

// "all" or a category id (lowercase + hyphen, e.g. "living-room").
function normalizeStudyCategory(v: unknown): string {
  return typeof v === "string" && /^[a-z][a-z-]{0,30}$/.test(v) ? v : "all";
}

const UI_LANGS: UiLang[] = ["zh-Hant", "zh-Hans", "ja"];
const FONT_SIZES: FontSize[] = ["sm", "md", "lg"];

// Coerce arbitrary input into a valid, complete settings object.
export function normalizeSettings(raw: Partial<UserSettings> | null | undefined): UserSettings {
  return {
    dailyGoal: clampDailyGoal(Number(raw?.dailyGoal)),
    accent: raw?.accent === "uk" ? "uk" : "us",
    showZh: typeof raw?.showZh === "boolean" ? raw.showZh : DEFAULT_SETTINGS.showZh,
    studyCategory: normalizeStudyCategory(raw?.studyCategory),
    studyDecks: normalizeStudyDecks(raw?.studyDecks),
    uiLang: UI_LANGS.includes(raw?.uiLang as UiLang) ? (raw!.uiLang as UiLang) : "zh-Hant",
    fontSize: FONT_SIZES.includes(raw?.fontSize as FontSize) ? (raw!.fontSize as FontSize) : "md",
  };
}
