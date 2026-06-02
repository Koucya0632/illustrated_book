"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WordCard from "@/components/WordCard";
import { useWords } from "@/components/WordsProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { useT } from "@/components/I18n";
import { getProgress, subscribe } from "@/lib/storage";
import type { CardWord, CategoryId } from "@/types";

type SortMode = "newest" | "oldest" | "alpha";

export default function FavoritesClient() {
  const allWords = useWords();
  const categories = useCategories();
  const t = useT();
  const [items, setItems] = useState<CardWord[] | null>(null);
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [sort, setSort] = useState<SortMode>("newest");

  useEffect(() => {
    const read = () => {
      const ids = getProgress().favoriteIds;
      // favoriteIds is push-appended on toggle, so the array order is
      // oldest → newest. We preserve that here and reverse / sort below
      // depending on the user's chosen view.
      setItems(
        ids
          .map((id) => allWords.find((w) => w.id === id))
          .filter((x): x is CardWord => Boolean(x)),
      );
    };
    read();
    return subscribe(read);
  }, [allWords]);

  // Per-category counts for the chip badges. Computed off the raw items
  // (no sort / filter applied) so counts reflect the user's actual
  // favorites, not the currently visible slice.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of items ?? []) m.set(w.category, (m.get(w.category) ?? 0) + 1);
    return m;
  }, [items]);

  const sorted = useMemo(() => {
    if (!items) return [];
    if (sort === "newest") return [...items].reverse();
    if (sort === "alpha")
      return [...items].sort((a, b) => a.word.localeCompare(b.word));
    return items; // "oldest" — natural array order
  }, [items, sort]);

  const shown = useMemo(
    () => (cat === "all" ? sorted : sorted.filter((w) => w.category === cat)),
    [sorted, cat],
  );

  if (items === null) {
    return <div className="mt-8 text-tuji-ink3">{t("common.loading")}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mt-12 text-center text-tuji-ink3">
        <div className="mb-2 text-5xl">🤍</div>
        <p>{t("me.noFav")}</p>
        <Link
          href="/cards"
          className="mt-4 inline-block rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-card"
        >
          {t("fav.browseBtn")}
        </Link>
      </div>
    );
  }

  const sortOptions: { value: SortMode; labelKey: string }[] = [
    { value: "newest", labelKey: "fav.sort.newest" },
    { value: "oldest", labelKey: "fav.sort.oldest" },
    { value: "alpha", labelKey: "fav.sort.alpha" },
  ];

  return (
    <div className="mt-6">
      {/* Sort row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {sortOptions.map((opt) => {
          const on = sort === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                on ? "bg-tuji-ink text-white" : "bg-white text-tuji-ink shadow-soft hover:shadow-card"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Category chips */}
      <div className="no-scrollbar -mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          onClick={() => setCat("all")}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
            cat === "all" ? "bg-tuji-ink text-white" : "bg-white text-tuji-ink shadow-soft hover:shadow-card"
          }`}
        >
          {t("fav.catAll")} · {items.length}
        </button>
        {categories.map((c) => {
          const on = c.id === cat;
          const n = counts.get(c.id) ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                on ? "bg-tuji-ink text-white" : "bg-white text-tuji-ink shadow-soft hover:shadow-card"
              }`}
            >
              {c.emoji} {c.nameZh} · {n}
            </button>
          );
        })}
      </div>

      {/* Word grid (sorted + category-filtered) */}
      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-tuji-ink3">{t("cat.empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((w) => (
            <WordCard key={w.id} word={w} />
          ))}
        </div>
      )}
    </div>
  );
}
