"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWords } from "@/components/WordsProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { useCurrentUser } from "@/components/UserProvider";
import { useT } from "@/components/I18n";
import Mascot from "@/components/tuji/Mascot";
import { TUJI } from "@/components/tuji/ui";
import { clearProgress, getProgress, subscribe } from "@/lib/storage";
import type { Progress } from "@/types";

const HEAT_COLOR = ["#F0EDE5", TUJI.tealS, "#86C0C0", TUJI.teal];

interface HeatCell {
  count: number;
  future: boolean;
}

// Daily review count → 0-3 heat level (fixed thresholds).
function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 10) return 2;
  return 3;
}

export default function ProgressClient({
  streak,
  heatmap,
}: {
  streak: { current: number; longest: number; totalDays: number } | null;
  heatmap: HeatCell[] | null;
}) {
  const allWords = useWords();
  const categories = useCategories();
  const user = useCurrentUser();
  const t = useT();
  const [p, setP] = useState<Progress | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setP(getProgress());
    return subscribe(() => setP(getProgress()));
  }, []);

  async function handleClear() {
    if (!confirm(t("progress.clearConfirm"))) return;
    setClearing(true);
    if (user) {
      try {
        await fetch("/api/users/progress", { method: "DELETE" });
      } catch {
        /* server clear failed — still clear local so the UI reflects intent */
      }
    }
    clearProgress();
    window.location.reload();
  }

  if (!p) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-tuji-ink3">{t("common.loading")}</div>
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
    { label: t("progress.tile.learned"), val: `${learnedCount}`, sub: t("progress.tile.learnedSub", { n: totalWords }), bg: TUJI.pink, color: TUJI.ink },
    { label: t("progress.tile.streak"), val: `${streak?.current ?? 0}`, sub: streak && streak.longest > 0 ? t("progress.tile.streakLongest", { n: streak.longest }) : t("progress.tile.streakNone"), bg: "#FFF4D6", color: "#A86214" },
    { label: t("progress.tile.fav"), val: `${favCount}`, sub: t("progress.tile.favSub"), bg: "#FFFFFF", color: TUJI.ink },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
      <div className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">{t("progress.title")}</div>

      {/* Hero — 圖鑑完成度 (real) */}
      <div className="relative mb-4 overflow-hidden rounded-[24px] bg-tuji-ink p-6 text-white">
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-[26px] bg-tuji-teal">
            <Mascot pose="cheer" size={104} />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/65">{t("progress.completion")}</div>
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
          </div>
        ))}
      </div>

      {/* Per-category progress (real) */}
      <section className="mb-4 rounded-[18px] bg-white p-5 shadow-soft">
        <h2 className="mb-3 text-sm font-extrabold text-tuji-ink">{t("progress.byCategory")}</h2>
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

      {/* Activity heatmap — real per-day review counts from study_logs */}
      <div className="mb-4">
        <div className="rounded-[18px] bg-white p-5 shadow-soft">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <div className="text-sm font-extrabold text-tuji-ink">{t("progress.past6weeks")}</div>
              <div className="mt-0.5 text-[11px] font-semibold text-tuji-ink3">
                {heatmap
                  ? t("progress.activeDays", { n: heatmap.filter((c) => !c.future && c.count > 0).length })
                  : t("progress.loginToSee")}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-tuji-ink3">
              {t("progress.heatLess")}
              {HEAT_COLOR.map((c) => (
                <span key={c} className="h-3.5 w-3.5 rounded" style={{ background: c }} />
              ))}
              {t("progress.heatMore")}
            </div>
          </div>
          <div className="flex gap-1.5">
            {t("progress.weekdays").split(",").map((d, di) => (
              <div key={di} className="flex-1">
                <div className="mb-1.5 text-center text-[10px] font-bold text-tuji-ink3">{d}</div>
                <div className="flex flex-col gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((wk) => {
                    const cell = heatmap?.[wk * 7 + di];
                    const level = cell ? heatLevel(cell.count) : 0;
                    return (
                      <div
                        key={wk}
                        className="aspect-square rounded"
                        title={cell ? t("progress.reviews", { n: cell.count }) : undefined}
                        style={{ background: HEAT_COLOR[level], opacity: cell?.future ? 0.3 : 1 }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleClear}
        disabled={clearing}
        className="text-sm font-bold text-tuji-coral hover:underline disabled:opacity-50"
      >
        {clearing ? t("progress.clearing") : t("progress.clearAll")}
      </button>
    </div>
  );
}
