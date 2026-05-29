"use client";

import { useCallback } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { t, type Locale } from "@/lib/i18n";

// Client translation hook. Reads the saved UI language from settings and
// returns a `t(key, vars?)` bound to it.
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const { uiLang } = useSettings();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => t(uiLang as Locale, key, vars),
    [uiLang],
  );
}
