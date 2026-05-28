"use client";

import { createContext, useCallback, useContext, useState } from "react";
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
