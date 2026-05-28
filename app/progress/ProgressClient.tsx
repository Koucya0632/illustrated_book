"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWords } from "@/components/WordsProvider";
import Mascot from "@/components/tuji/Mascot";
import { TUJI } from "@/components/tuji/ui";
import { categories } from "@/lib/categories";
import { clearProgress, getProgress, subscribe } from "@/lib/storage";
import type { Progress } from "@/types";

// Deterministic placeholder heat grid — see TUJI_TODO.md (daily activity is
// not yet tracked per-day, so this is a visual stub).
const HEAT = Array.from({ length: 42 }, (_, i) => {
  const seed = (i * 17 + 11) % 13;
  return seed < 4 ? 0 : seed < 7 ? 1 : seed < 10 ? 2 : 3;
});
const HEAT_COLOR = ["#F0EDE5", TUJI.tealS, "#86C0C0", TUJI.teal];

const BADGES = [
  { g: "🔥", l: "連勝 7", bg: "#FBE6E1" },
  { g: "🌅", l: "早起 5", bg: "#FFF4D6" },
  { g: "📚", l: "100 字", bg: TUJI.tealS },
  { g: "⚡", l: "快速 50", bg: "#F6E6F0" },
  { g: "🎯", l: "滿分日", bg: "#F0EDE5", off: true },
  { g: "🌙", l: "深夜學", bg: "#F0EDE5", off: true },
  { g: "🎓", l: "500 字", bg: "#F0EDE5", off: true },
  { g: "👑", l: "30 連勝", bg: "#F0EDE5", off: true },
];

export default function ProgressClient({
  streak,
}: {
  streak: { current: number; longest: number; totalDays: number } | null;
}) {
  const allWords = useWords();
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    setP(getProgress());
    return subscribe(() => setP(getProgress()));
  }, []);

  if (!p) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-tuji-ink3">載入中…</div>
    );
  }

  const totalWords = allWords.length;
  const learnedCount = p.learnedIds.length;
  const favCount = p.favoriteIds.length;
  const completion = totalWords > 0 ? Math.round((learnedCount / totalWords) * 100) : 0;

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

  const tiles = [
    { label: "已學單字", val: `${learnedCount}`, sub: `共 ${totalWords} 個`, bg: TUJI.pink, color: TUJI.ink, glyph: "📚" },
    { label: "連續天數", val: `${streak?.current ?? 0}`, sub: streak && streak.longest > 0 ? `最長 ${streak.longest} 天` : "尚未開始", bg: "#FFF4D6", color: "#A86214", glyph: "🔥" },
    { label: "收藏單字", val: `${favCount}`, sub: "我的收藏", bg: "#FFFFFF", color: TUJI.ink, glyph: "❤️" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
      <div className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">我的進度</div>

      {/* Hero — 圖鑑完成度 (real) */}
      <div className="relative mb-4 overflow-hidden rounded-[24px] bg-tuji-ink p-6 text-white">
        <div className="pointer-events-none absolute right-8 top-5 text-sm text-tuji-yellow/80">✦</div>
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-[26px] bg-tuji-teal">
            <Mascot pose="cheer" size={104} />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/65">圖鑑完成度</div>
            <div className="mt-1 font-display text-3xl font-extrabold tracking-tight">
              {learnedCount} <span className="text-lg font-bold text-white/60">/ {totalWords}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${completion}%`, background: `linear-gradient(90deg, ${TUJI.yellow}, ${TUJI.coral})` }}
                />
              </div>
              <span className="text-[11px] font-extrabold text-white/80">{completion}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((s) => (
          <div
            key={s.label}
            className="relative overflow-hidden rounded-[18px] p-4 shadow-soft"
            style={{ background: s.bg }}
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: s.color, opacity: 0.7 }}>
              {s.label}
            </div>
            <div className="mt-1.5 font-display text-3xl font-extrabold leading-none tracking-tight" style={{ color: s.color }}>
              {s.val}
            </div>
            <div className="mt-1.5 text-xs font-bold" style={{ color: s.color, opacity: 0.75 }}>
              {s.sub}
            </div>
            <div className="pointer-events-none absolute -bottom-3 -right-2 text-5xl opacity-15">{s.glyph}</div>
          </div>
        ))}
      </div>

      {/* Per-category progress (real) */}
      <section className="mb-4 rounded-[18px] bg-white p-5 shadow-soft">
        <h2 className="mb-3 text-sm font-extrabold text-tuji-ink">各主題進度</h2>
        <ul className="flex flex-col gap-2.5">
          {perCategory.map((row) => (
            <li key={row.cat.id}>
              <Link href={`/category/${row.cat.id}`} className="block">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-bold text-tuji-ink">
                    <span>{row.cat.emoji}</span>
                    {row.cat.nameZh}
                  </span>
                  <span className="text-xs font-extrabold text-tuji-ink3">
                    {row.learned}/{row.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-tuji-bg">
                  <div className="h-full rounded-full bg-tuji-teal transition-all" style={{ width: `${row.pct}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Heatmap + badges (visual stubs — see TUJI_TODO.md) */}
      <div className="mb-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[18px] bg-white p-5 shadow-soft">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <div className="text-sm font-extrabold text-tuji-ink">過去 6 週</div>
              <div className="mt-0.5 text-[11px] font-semibold text-tuji-ink3">示意圖 · 尚未串接每日活動</div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-tuji-ink3">
              少
              {HEAT_COLOR.map((c) => (
                <span key={c} className="h-3.5 w-3.5 rounded" style={{ background: c }} />
              ))}
              多
            </div>
          </div>
          <div className="flex gap-1.5">
            {["日", "一", "二", "三", "四", "五", "六"].map((d, di) => (
              <div key={di} className="flex-1">
                <div className="mb-1.5 text-center text-[10px] font-bold text-tuji-ink3">{d}</div>
                <div className="flex flex-col gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((wk) => (
                    <div key={wk} className="aspect-square rounded" style={{ background: HEAT_COLOR[HEAT[wk * 7 + di]] }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] bg-white p-5 shadow-soft">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-sm font-extrabold text-tuji-ink">勳章</div>
            <div className="text-[11px] font-semibold text-tuji-ink3">即將推出</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {BADGES.map((a) => (
              <div
                key={a.l}
                className="rounded-xl px-1.5 py-2.5 text-center"
                style={{ background: a.bg, opacity: a.off ? 0.4 : 1 }}
              >
                <div className="text-2xl" style={{ filter: a.off ? "grayscale(1)" : "none" }}>
                  {a.g}
                </div>
                <div className="mt-1 text-[10px] font-extrabold text-tuji-ink">{a.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          if (confirm("確定要清除所有學習進度嗎？此操作無法復原。")) clearProgress();
        }}
        className="text-sm font-bold text-tuji-coral hover:underline"
      >
        清除所有進度
      </button>
    </div>
  );
}
