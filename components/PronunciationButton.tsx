"use client";

import { useState } from "react";
import { playClip, speechSupported } from "@/lib/speech";
import { track } from "@/lib/analytics";
import { useSettings } from "@/components/SettingsProvider";
import { accentToLang } from "@/lib/settings";

export default function PronunciationButton({
  text,
  audioUrls,
  size = "md",
  label = "播放發音",
  wordId,
}: {
  text: string;
  /** Pre-generated clips keyed by locale ("en-US"/"en-GB"/"ja-JP"). When the
   *  resolved locale has a clip it plays that; otherwise falls back to
   *  on-device synthesis of `text`. */
  audioUrls?: Record<string, string>;
  size?: "sm" | "md" | "lg";
  label?: string;
  wordId?: string;
}) {
  const [active, setActive] = useState(false);
  const supported = speechSupported();
  const { accent, learningDirection } = useSettings();

  const sizeMap = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
  };

  function handle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const lang = learningDirection === "zh-ja" ? "ja-JP" : accentToLang(accent);
    const url = audioUrls?.[lang];
    // A clip plays regardless of speechSynthesis support; only block when we'd
    // have to fall back to synthesis and the browser can't do it.
    if (!url && !supported) {
      alert("這個瀏覽器不支援發音功能，請使用 Chrome 或 Safari。");
      return;
    }
    playClip(url, text, lang);
    setActive(true);
    setTimeout(() => setActive(false), 800);
    if (wordId) track({ type: "pronounce", wordId });
  }

  return (
    <button
      onClick={handle}
      aria-label={label}
      title={label}
      className={`${sizeMap[size]} inline-flex items-center justify-center rounded-full bg-sky-soft hover:bg-sky-accent hover:text-white text-sky-accent transition shadow-soft ${
        active ? "scale-110" : ""
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M11 5L6 9H2v6h4l5 4V5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
