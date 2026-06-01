"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Mascot from "@/components/tuji/Mascot";
import WordCard from "@/components/WordCard";
import { useWords } from "@/components/WordsProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { useSearch } from "@/components/useSearch";
import { useT } from "@/components/I18n";
import type { CategoryId } from "@/types";

const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

export default function SearchClient() {
  const allWords = useWords();
  const categories = useCategories();
  const t = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { results: searchHits, loading } = useSearch(q, { limit });

  const needle = q.trim();
  const hasQuery = needle.length > 0;

  // Per-category counts for the empty-state browse grid.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of allWords) m.set(w.category, (m.get(w.category) ?? 0) + 1);
    return m;
  }, [allWords]);

  const results = useMemo(() => {
    if (!hasQuery) return [];
    return cat === "all" ? searchHits : searchHits.filter((w) => w.category === cat);
  }, [hasQuery, cat, searchHits]);

  // Reset pagination + filter chip whenever the user starts a new query.
  // The previous chip / paged-out window rarely matches their next intent.
  useEffect(() => {
    setLimit(PAGE_SIZE);
    setCat("all");
  }, [needle]);

  const hasMore = hasQuery && searchHits.length >= limit && limit < MAX_LIMIT;

  return (
    <div className="mt-5">
      {/* Search input — always present */}
      <div className="flex items-center gap-2 rounded-full bg-white px-5 py-3.5 shadow-card focus-within:ring-2 focus-within:ring-tuji-teal">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-tuji-ink3">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          className="flex-1 bg-transparent text-sm text-tuji-ink outline-none placeholder:text-tuji-ink4 sm:text-base"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label={t("search.clearAria")} className="text-tuji-ink3 hover:text-tuji-ink">
            ✕
          </button>
        )}
      </div>

      {/* Empty state — mascot + category quick-browse + "看全部" link */}
      {!hasQuery ? (
        <div className="mt-8">
          <div className="flex flex-col items-center text-center">
            <Mascot pose="think" size={108} />
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-tuji-ink">
              {t("search.empty.title")}
            </h2>
            <p className="mt-1 text-sm text-tuji-ink3">{t("search.empty.sub")}</p>
          </div>

          <div className="mt-8">
            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
              {t("search.empty.browseTitle")}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/category/${c.id}`}
                  className="group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
                >
                  <span className="text-3xl">{c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-tuji-ink">{c.nameZh}</div>
                    <div className="text-[11px] font-bold text-tuji-ink3">
                      {t("search.empty.countWords", { n: categoryCounts.get(c.id) ?? 0 })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <Link
              href="/cards"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-tuji-ink shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
            >
              {t("search.empty.viewAll")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Category filter chips (query state only) */}
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <button
              onClick={() => setCat("all")}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                cat === "all" ? "bg-tuji-ink text-white" : "bg-white text-tuji-ink shadow-soft hover:shadow-card"
              }`}
            >
              {t("search.chipAll")}
            </button>
            {categories.map((c) => {
              const on = c.id === cat;
              return (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                    on ? "bg-tuji-ink text-white" : "bg-white text-tuji-ink shadow-soft hover:shadow-card"
                  }`}
                >
                  {c.emoji} {c.nameZh}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-sm font-semibold text-tuji-ink3">
            {t("search.titleQ", { q })} · {t("search.resultCount", { n: results.length })}
            {loading && <span className="ml-2">{t("search.loading")}</span>}
          </p>

          {results.length === 0 ? (
            <div className="mt-12 text-center text-tuji-ink3">
              <div className="mb-2 text-5xl">🔍</div>
              {t("search.empty")}
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                {results.map((w) => (
                  <WordCard key={w.id} word={w} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}
                    className="rounded-full bg-white px-6 py-3 text-sm font-extrabold text-tuji-ink shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
                  >
                    {t("search.showMore", { n: PAGE_SIZE })}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
