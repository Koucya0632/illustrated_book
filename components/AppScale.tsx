"use client";

import { useEffect } from "react";
import { useSettings } from "@/components/SettingsProvider";

// Applies the user's font-size preference as a whole-page zoom. The app uses
// many px-based arbitrary sizes, so zoom is the reliable way to scale them
// uniformly. Renders nothing.
const ZOOM: Record<string, string> = { sm: "0.9", md: "1", lg: "1.1" };

export default function AppScale() {
  const { fontSize } = useSettings();
  useEffect(() => {
    const el = document.documentElement;
    el.style.setProperty("zoom", ZOOM[fontSize] ?? "1");
    return () => {
      el.style.setProperty("zoom", "1");
    };
  }, [fontSize]);
  return null;
}
