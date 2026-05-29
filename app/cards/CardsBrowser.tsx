"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useWords } from "@/components/WordsProvider";
import { useSettings } from "@/components/SettingsProvider";
import { useT } from "@/components/I18n";
import FavoriteButton from "@/components/FavoriteButton";
import { WordTile } from "@/components/tuji/ui";
import { categories } from "@/lib/categories";

export default function CardsBrowser() {
  const all = useWords();
  const { showZh } = useSettings();
  const t = useT();
  const [cat, setCat] = useState<string>("all");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of all) m.set(w.category, (m.get(w.category) ?? 0) + 1);
    return m;
  }, [all]);

  const shown = useMemo(
    () => (cat === "all" ? all : all.filter((w) => w.category === cat)),
    [all, cat],
  );

  const chips = [
    { id: "all", label: t("cards.all"), n: all.length },
    ...categories.map((c) => ({ id: c.id, label: `${c.nameZh} ${c.emoji}`, n: counts.get(c.id) ?? 0 })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <header className="mb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
          {t("cards.summary", { words: all.length, themes: categories.length })}
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">{t("cards.title")}</h1>
      </header>

      {/* Category chips */}
      <div className="no-scrollbar -mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => {
          const on = c.id === cat;
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                on ? "bg-tuji-ink text-white" : "bg-white text-tuji-ink shadow-soft hover:shadow-card"
              }`}
            >
              {c.label} · {c.n}
            </button>
          );
        })}
      </div>

      {/* Word grid */}
      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-tuji-ink3">{t("cards.empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((w) => (
            <Link
              key={w.id}
              href={`/word/${w.id}`}
              className="group relative rounded-[18px] bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
            >
              <div className="absolute right-4 top-4 z-10">
                <FavoriteButton id={w.id} size="sm" />
              </div>
              <WordTile imageUrl={w.imageUrl} word={w.word} height={120} />
              <div className="mt-2.5">
                <div className="text-[15px] font-extrabold tracking-tight text-tuji-ink">{w.word}</div>
                {showZh && <div className="mt-0.5 text-xs text-tuji-ink3">{w.chinese}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
