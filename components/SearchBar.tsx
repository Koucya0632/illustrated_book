"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchWords } from "@/components/WordsProvider";

export default function SearchBar({
  autoFocus = false,
  onResultClick,
}: {
  autoFocus?: boolean;
  onResultClick?: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const matches = useSearchWords(q);
  const results = useMemo(() => matches.slice(0, 8), [matches]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <div className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-card focus-within:ring-2 ring-sky-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-muted shrink-0">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus={autoFocus}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="搜尋中文或英文，例如：冰箱、fridge"
          className="flex-1 outline-none bg-transparent text-ink placeholder:text-muted text-sm sm:text-base"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="清除"
            className="text-muted hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {open && q && (
        <div className="absolute z-40 mt-2 w-full bg-white rounded-2xl shadow-card border border-black/5 overflow-hidden">
          {results.length === 0 ? (
            <div className="p-4 text-sm text-muted text-center">找不到符合的單字</div>
          ) : (
            <ul>
              {results.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/word/${w.id}`}
                    onClick={() => {
                      setOpen(false);
                      onResultClick?.();
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-sky-soft transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={w.imageUrl}
                      alt={w.word}
                      className="w-10 h-10 rounded-lg object-cover bg-cream"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink truncate">
                        {w.word}{" "}
                        {w.alsoKnownAs && (
                          <span className="text-xs text-muted">/ {w.alsoKnownAs.join(", ")}</span>
                        )}
                      </p>
                      <p className="text-sm text-muted truncate">{w.chinese}</p>
                    </div>
                    <span className="text-xs text-muted shrink-0">{w.category}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
