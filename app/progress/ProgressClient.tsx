"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWords } from "@/components/WordsProvider";
import { categories, getCategory } from "@/lib/categories";
import { clearProgress, getProgress, subscribe } from "@/lib/storage";
import type { Progress } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  image: "看圖選英文",
  chinese: "看中文選英文",
  spelling: "拼字練習",
};

export default function ProgressClient() {
  const allWords = useWords();
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    setP(getProgress());
    return subscribe(() => setP(getProgress()));
  }, []);

  if (!p) return <div className="mt-8 text-muted">載入中…</div>;

  const totalWords = allWords.length;
  const learnedCount = p.learnedIds.length;
  const favCount = p.favoriteIds.length;
  const totalAttempted = p.quizHistory.reduce((s, q) => s + q.total, 0);
  const totalCorrect = p.quizHistory.reduce((s, q) => s + q.correct, 0);
  const rate = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
  const last = p.lastCategoryVisited ? getCategory(p.lastCategoryVisited) : undefined;

  const perCategory = categories.map((c) => {
    const inCat = allWords.filter((w) => w.category === c.id);
    const learnedInCat = inCat.filter((w) => p.learnedIds.includes(w.id)).length;
    return {
      cat: c,
      learned: learnedInCat,
      total: inCat.length,
      pct: inCat.length > 0 ? Math.round((learnedInCat / inCat.length) * 100) : 0,
    };
  });

  return (
    <div className="mt-6 space-y-8">
      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="已學單字" value={`${learnedCount}/${totalWords}`} emoji="📚" />
        <StatCard label="收藏單字" value={`${favCount}`} emoji="❤️" />
        <StatCard label="測驗正確率" value={`${rate}%`} emoji="🎯" />
        <StatCard
          label="最近學習"
          value={last ? `${last.emoji} ${last.nameZh}` : "—"}
          emoji="📍"
        />
      </section>

      {/* Per category progress */}
      <section>
        <h2 className="text-lg font-bold text-ink">各分類進度</h2>
        <ul className="mt-3 space-y-2">
          {perCategory.map((row) => (
            <li key={row.cat.id}>
              <Link
                href={`/category/${row.cat.id}`}
                className="block bg-white rounded-xl shadow-soft hover:shadow-card px-4 py-3 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{row.cat.emoji}</span>
                    <span className="font-semibold text-ink">{row.cat.name}</span>
                    <span className="text-sm text-muted">{row.cat.nameZh}</span>
                  </div>
                  <span className="text-sm font-medium text-ink">
                    {row.learned}/{row.total}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-cream rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-accent transition-all"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Quiz history */}
      <section>
        <h2 className="text-lg font-bold text-ink">最近測驗紀錄</h2>
        {p.quizHistory.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            還沒有測驗紀錄。{" "}
            <Link href="/quiz" className="text-sky-accent hover:underline">
              去做一個測驗 →
            </Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {p.quizHistory.slice(0, 8).map((q, i) => {
              const r = q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0;
              return (
                <li
                  key={i}
                  className="bg-white rounded-xl shadow-soft px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-ink">{TYPE_LABEL[q.type] ?? q.type}</p>
                    <p className="text-xs text-muted">{new Date(q.date).toLocaleString("zh-TW")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink">
                      {q.correct}/{q.total}
                    </p>
                    <p className="text-xs text-muted">{r}%</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Reset */}
      <section className="pt-2">
        <button
          onClick={() => {
            if (confirm("確定要清除所有學習進度嗎？此操作無法復原。")) {
              clearProgress();
            }
          }}
          className="text-sm text-rose-500 hover:underline"
        >
          清除所有進度
        </button>
      </section>
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-xl2 bg-white shadow-card p-4 flex flex-col">
      <span className="text-2xl">{emoji}</span>
      <span className="mt-2 text-xs text-muted">{label}</span>
      <span className="mt-1 text-xl font-bold text-ink">{value}</span>
    </div>
  );
}
