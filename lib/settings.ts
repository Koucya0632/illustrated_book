// Per-user app settings. Server + client safe (no hooks, no Node imports).

export interface UserSettings {
  dailyGoal: number;
  accent: "us" | "uk";
  showZh: boolean;
  // Study theme: "all" = no filter, otherwise a category id (words.category).
  studyCategory: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dailyGoal: 12,
  accent: "us",
  showZh: true,
  studyCategory: "all",
};

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

// Coerce arbitrary input into a valid, complete settings object.
export function normalizeSettings(raw: Partial<UserSettings> | null | undefined): UserSettings {
  return {
    dailyGoal: clampDailyGoal(Number(raw?.dailyGoal)),
    accent: raw?.accent === "uk" ? "uk" : "us",
    showZh: typeof raw?.showZh === "boolean" ? raw.showZh : DEFAULT_SETTINGS.showZh,
    studyCategory: normalizeStudyCategory(raw?.studyCategory),
  };
}
