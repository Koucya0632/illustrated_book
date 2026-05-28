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

  const { results: searchHits, loading } = useSearch(q, { limit: 50 });

  const results = useMemo(() => {
    const needle = q.trim();
    let list = !needle ? allWords : searchHits;
    if (cat !== "all") list = list.filter((w) => w.category === cat);
    return list;
  }, [q, cat, allWords, searchHits]);

  const chips = [{ id: "all" as const, label: "全部" }, ...categories.map((c) => ({ id: c.id, label: `${c.emoji} ${c.nameZh}` }))];

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 rounded-full bg-white px-5 py-3.5 shadow-card focus-within:ring-2 focus-within:ring-tuji-teal">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-tuji-ink3">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋中文或英文，例如：冰箱、fridge"
          className="flex-1 bg-transparent text-sm text-tuji-ink outline-none placeholder:text-tuji-ink4 sm:text-base"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="清除" className="text-tuji-ink3 hover:text-tuji-ink">
            ✕
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
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
              {c.label}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm font-semibold text-tuji-ink3">
        {q ? `搜尋「${q}」` : "全部單字"} · {results.length} 個結果
        {q && loading && <span className="ml-2">搜尋中…</span>}
      </p>

      {results.length === 0 ? (
        <div className="mt-12 text-center text-tuji-ink3">
          <div className="mb-2 text-5xl">🔍</div>
          找不到符合的單字，換個關鍵字試試？
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((w) => (
            <WordCard key={w.id} word={w} />
          ))}
        </div>
      )}
    </div>
  );
}
