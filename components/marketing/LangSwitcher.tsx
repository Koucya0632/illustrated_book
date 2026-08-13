"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { UiLang } from "@/lib/settings";
import { PUBLIC_LANG_COOKIE, PUBLIC_LOCALES } from "@/lib/marketing-i18n";

// Public marketing-page language switcher. Persists the choice in a cookie
// (no account needed) and calls router.refresh() so the server re-renders the
// page + shell in the new language. Seeded from the server-resolved `current`.
export default function LangSwitcher({ current }: { current: UiLang }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(value: UiLang) {
    setOpen(false);
    if (value === current) return;
    // 1 year, root path, lax so it survives normal navigation.
    document.cookie = `${PUBLIC_LANG_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const label = PUBLIC_LOCALES.find((l) => l.value === current)?.label ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        className="flex items-center gap-1.5 bg-tuji-paper2 px-3 py-2 text-sm font-bold text-tuji-ink2 transition duration-120 hover:bg-tuji-paper3 hover:text-tuji-ink"
      >
        <span aria-hidden="true">🌐</span>
        <span>{label}</span>
      </button>
      {open && (
        // A small sheet, so it wears what sheets wear: a square paper surface
        // with a 3px ink top edge (bw3). No shadow lifts it off the page.
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden border-t-3 border-tuji-ink bg-tuji-paper2 p-1.5"
        >
          {PUBLIC_LOCALES.map((l) => (
            <li key={l.value}>
              <button
                type="button"
                role="option"
                aria-selected={l.value === current}
                onClick={() => pick(l.value)}
                // Selected = the ink block. It is the only "this one is chosen"
                // language in the system, so it is the one used here too.
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-bold transition duration-120 ${
                  l.value === current
                    ? "bg-tuji-ink text-tuji-paper"
                    : "text-tuji-ink2 hover:bg-tuji-paper3"
                }`}
              >
                {l.label}
                {l.value === current && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
