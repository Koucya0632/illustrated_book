// Per-user app settings. Server + client safe (no hooks, no Node imports).

export interface UserSettings {
  dailyGoal: number;
  accent: "us" | "uk";
  showZh: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dailyGoal: 12,
  accent: "us",
  showZh: true,
};

export const DAILY_GOAL_OPTIONS = [10, 12, 15, 20, 30] as const;

export const ACCENT_OPTIONS: { value: UserSettings["accent"]; label: string }[] = [
  { value: "us", label: "美式英語" },
  { value: "uk", label: "英式英語" },
];

export function accentToLang(accent: UserSettings["accent"]): string {
  return accent === "uk" ? "en-GB" : "en-US";
}

// Coerce arbitrary input into a valid, complete settings object.
export function normalizeSettings(raw: Partial<UserSettings> | null | undefined): UserSettings {
  const dg = Number(raw?.dailyGoal);
  return {
    dailyGoal: (DAILY_GOAL_OPTIONS as readonly number[]).includes(dg) ? dg : DEFAULT_SETTINGS.dailyGoal,
    accent: raw?.accent === "uk" ? "uk" : "us",
    showZh: typeof raw?.showZh === "boolean" ? raw.showZh : DEFAULT_SETTINGS.showZh,
  };
}
