"use client";

import { useMemo, useState } from "react";
import WordCard from "@/components/WordCard";
import { useWords } from "@/components/WordsProvider";
import { useSearch } from "@/components/useSearch";
import { categories } from "@/lib/categories";
import type { CategoryId } from "@/types";

export default function SearchClient() {
  const allWords = useWords();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");

  // Debounced server search (300ms, cap 50). When the query is empty, show
  // the full set from context so the "browse by category" path still works
  // without hitting the network.
  const { results: searchHits, loading } = useSearch(q, { limit: 50 });

  const results = useMemo(() => {
    const needle = q.trim();
    let list = !needle ? allWords : searchHits;
    if (cat !== "all") list = list.filter((w) => w.category === cat);
    return list;
  }, [q, cat, allWords, searchHits]);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-card focus-within:ring-2 ring-sky-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-muted shrink-0">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋中文或英文，例如：冰箱、fridge"
          className="flex-1 outline-none bg-transparent text-ink placeholder:text-muted text-sm sm:text-base"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="清除" className="text-muted hover:text-ink">
            ✕
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCat("all")}
          className={`px-3 py-1.5 rounded-full text-sm transition ${
            cat === "all"
              ? "bg-sky-accent text-white"
              : "bg-white text-muted hover:text-ink shadow-soft"
          }`}
        >
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`px-3 py-1.5 rounded-full text-sm transition ${
              cat === c.id
                ? "bg-sky-accent text-white"
                : "bg-white text-muted hover:text-ink shadow-soft"
            }`}
          >
            {c.emoji} {c.nameZh}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted">
        {q ? `搜尋「${q}」` : "全部單字"} · {results.length} 個結果
        {q && loading && <span className="ml-2">搜尋中…</span>}
      </p>

      {results.length === 0 ? (
        <div className="mt-12 text-center text-muted">
          <div className="text-5xl mb-2">🔍</div>
          找不到符合的單字，換個關鍵字試試？
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map((w) => (
            <WordCard key={w.id} word={w} />
          ))}
        </div>
      )}
    </div>
  );
}
