"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, normalizeSettings, type UserSettings } from "@/lib/settings";

interface SettingsContextValue {
  settings: UserSettings;
  // Optimistically update + persist to the account (no-op persist when logged out).
  update: (patch: Partial<UserSettings>) => void;
  loggedIn: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  loggedIn: false,
});

export function SettingsProvider({
  initial,
  loggedIn,
  children,
}: {
  initial: UserSettings;
  loggedIn: boolean;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<UserSettings>(initial);

  // Sync context state when the server pushes a fresh `initial` (after a
  // router.refresh() following a settings save). Without this, useState
  // keeps the value it captured at mount, so callers of useSettings() /
  // useT() never see the new uiLang, dailyGoal, etc. until a hard reload.
  // The shallow-equality check avoids redundant re-renders when the parent
  // re-renders with the same values but a new object reference.
  useEffect(() => {
    setSettings((prev) => (settingsEqual(prev, initial) ? prev : initial));
  }, [initial]);

  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = normalizeSettings({ ...prev, ...patch });
        if (loggedIn) {
          fetch("/api/users/settings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(next),
            keepalive: true,
          }).catch(() => {});
        }
        return next;
      });
    },
    [loggedIn],
  );

  return (
    <SettingsContext.Provider value={{ settings, update, loggedIn }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): UserSettings {
  return useContext(SettingsContext).settings;
}

export function useSettingsActions(): Pick<SettingsContextValue, "update" | "loggedIn"> {
  const { update, loggedIn } = useContext(SettingsContext);
  return { update, loggedIn };
}

function settingsEqual(a: UserSettings, b: UserSettings): boolean {
  return (
    a.dailyGoal === b.dailyGoal &&
    a.accent === b.accent &&
    a.showZh === b.showZh &&
    a.learningDirection === b.learningDirection &&
    a.uiLang === b.uiLang &&
    a.fontSize === b.fontSize &&
    a.studyDecks.length === b.studyDecks.length &&
    a.studyDecks.every((d, i) => d === b.studyDecks[i]) &&
    a.studyCategories.length === b.studyCategories.length &&
    a.studyCategories.every((d, i) => d === b.studyCategories[i])
  );
}
