import Link from "next/link";
import { redirect } from "next/navigation";
import Mascot from "@/components/tuji/Mascot";
import { WordTile, scoreTier, TUJI } from "@/components/tuji/ui";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getAllWords } from "@/lib/data";
import { applyDecay } from "@/lib/mastery";
import { getAllMastery, getStudyStreak } from "@/lib/users-db";
import MeClient from "./MeClient";
import type { Word } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的帳號 · Tuji" };

const BADGES = [
  { g: "🔥", l: "連勝 7", bg: "#FBE6E1" },
  { g: "🌅", l: "早起 5", bg: "#FFF4D6" },
  { g: "📚", l: "100 字", bg: TUJI.tealS },
  { g: "⚡", l: "快速 50", bg: "#F6E6F0", off: true },
  { g: "🎯", l: "滿分日", bg: "#F0EDE5", off: true },
  { g: "🌙", l: "深夜學", bg: "#F0EDE5", off: true },
  { g: "🦉", l: "貓頭鷹", bg: "#F0EDE5", off: true },
  { g: "👑", l: "30 連勝", bg: "#F0EDE5", off: true },
];

export default async function MePage() {
  const bundle = await getCurrentUserBundle();
  if (!bundle) redirect("/signin?next=/me");

  const [allWords, masteryRows, streak] = await Promise.all([
    getAllWords(),
    getAllMastery(bundle.user.id),
    getStudyStreak(bundle.user.id),
  ]);
  const byId = new Map(allWords.map((w) => [w.id, w]));
  const fav = bundle.favorites.map((id) => byId.get(id)).filter(Boolean) as Word[];
  const learnedCount = bundle.learned.length;

  const now = new Date();
  const masteredItems = masteryRows
    .map((r) => {
      const current = applyDecay(r.mastery, r.last_reviewed_at ? new Date(r.last_reviewed_at) : null, now);
      const w = byId.get(r.word_id);
      return w ? { word: w, mastery: current } : null;
    })
    .filter(Boolean) as { word: Word; mastery: number }[];
  masteredItems.sort((a, b) => b.mastery - a.mastery);
  const avgMastery =
    masteredItems.length > 0 ? masteredItems.reduce((s, x) => s + x.mastery, 0) / masteredItems.length : 0;
  const topMastered = masteredItems.slice(0, 5);
  const needsWork = [...masteredItems].filter((x) => x.mastery < 60).sort((a, b) => a.mastery - b.mastery).slice(0, 5);
  const masteredCount = masteredItems.filter((x) => x.mastery >= 80).length;
  const completion = allWords.length > 0 ? Math.round((learnedCount / allWords.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
      <div className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">個人主頁</div>

      {/* Profile hero */}
      <div className="relative mb-4 flex flex-col items-center gap-5 overflow-hidden rounded-[24px] bg-tuji-ink p-6 text-white sm:flex-row">
        <div className="pointer-events-none absolute right-10 top-4 text-sm text-tuji-yellow/85">✦</div>
        <div className="flex h-28 w-28 shrink-0 items-end justify-center overflow-hidden rounded-[28px] bg-tuji-teal">
          <Mascot pose="cheer" size={116} />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{bundle.user.username}</h1>
          <p className="mt-1 text-[13px] text-white/70">
            {bundle.user.email} · 加入於 {new Date(bundle.user.createdAt).toLocaleDateString("zh-TW")}
          </p>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] font-extrabold text-white/80">
              <span>圖鑑完成度</span>
              <span>
                {learnedCount} / {allWords.length}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full"
                style={{ width: `${completion}%`, background: `linear-gradient(90deg, ${TUJI.yellow}, ${TUJI.coral})` }}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 sm:flex-col">
          <div className="min-w-[88px] rounded-2xl bg-tuji-coral px-4 py-3 text-center text-white">
            <div className="font-display text-2xl font-extrabold leading-none">{streak.current}</div>
            <div className="mt-1 text-[11px] font-extrabold">🔥 連勝</div>
          </div>
          <Link href="/cards" className="min-w-[88px] rounded-2xl bg-tuji-yellow px-4 py-3 text-center text-tuji-ink">
            <div className="font-display text-2xl font-extrabold leading-none">{learnedCount}</div>
            <div className="mt-1 text-[11px] font-extrabold">📚 已學</div>
          </Link>
        </div>
      </div>

      {/* Quick stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat label="收藏" value={String(bundle.favorites.length)} emoji="❤️" />
        <MiniStat label="平均熟練度" value={masteredItems.length > 0 ? `${Math.round(avgMastery)}` : "—"} emoji="🧠" />
        <MiniStat label="已熟練 ≥80" value={String(masteredCount)} emoji="🌟" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Mastery overview */}
          {masteredItems.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {topMastered.length > 0 && (
                <div className="rounded-[18px] bg-white p-4 shadow-soft">
                  <h3 className="mb-3 text-sm font-extrabold text-tuji-ink">🌟 最熟的字</h3>
                  <ul className="flex flex-col gap-3">
                    {topMastered.map((item) => (
                      <MasteryRow key={item.word.id} word={item.word} mastery={item.mastery} />
                    ))}
                  </ul>
                </div>
              )}
              {needsWork.length > 0 && (
                <div className="rounded-[18px] bg-white p-4 shadow-soft">
                  <h3 className="mb-3 text-sm font-extrabold text-tuji-ink">⚠️ 需要加強</h3>
                  <ul className="flex flex-col gap-3">
                    {needsWork.map((item) => (
                      <MasteryRow key={item.word.id} word={item.word} mastery={item.mastery} />
                    ))}
                  </ul>
                  <Link href="/study" className="mt-3 inline-block text-sm font-extrabold text-tuji-teal">
                    去複習 →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Badges (stub) */}
          <div className="rounded-[18px] bg-white p-5 shadow-soft">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-sm font-extrabold text-tuji-ink">勳章</div>
              <div className="text-[11px] font-semibold text-tuji-ink3">即將推出</div>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {BADGES.map((a) => (
                <div key={a.l} className="rounded-xl px-1.5 py-2.5 text-center" style={{ background: a.bg, opacity: a.off ? 0.4 : 1 }}>
                  <div className="text-xl" style={{ filter: a.off ? "grayscale(1)" : "none" }}>
                    {a.g}
                  </div>
                  <div className="mt-1 text-[9px] font-extrabold text-tuji-ink">{a.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Favorites */}
          <div>
            <h2 className="mb-3 text-sm font-extrabold text-tuji-ink">我的收藏</h2>
            {fav.length === 0 ? (
              <p className="text-sm text-tuji-ink3">
                還沒有收藏單字。{" "}
                <Link href="/cards" className="font-extrabold text-tuji-teal">
                  去逛圖鑑 →
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {fav.map((w) => (
                  <Link key={w.id} href={`/word/${w.id}`} className="rounded-[14px] bg-white p-2.5 shadow-soft transition hover:shadow-card">
                    <WordTile imageUrl={w.imageUrl} word={w.word} height={70} rounded={10} />
                    <div className="mt-2 truncate text-[13px] font-extrabold text-tuji-ink">{w.word}</div>
                    <div className="truncate text-[11px] text-tuji-ink3">{w.chinese}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <Link href="/settings" className="block rounded-[18px] bg-white p-5 shadow-soft transition hover:shadow-card">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-extrabold text-tuji-ink">學習偏好</div>
              <div className="text-[11px] font-extrabold text-tuji-ink3">編輯 →</div>
            </div>
            <p className="mt-2 text-xs text-tuji-ink3">每日目標、提醒時間、發音口音、Tuji 出現頻率…</p>
          </Link>

          <MeClient />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-[18px] bg-white p-4 shadow-soft">
      <span className="text-xl">{emoji}</span>
      <p className="mt-1.5 text-xs font-bold text-tuji-ink3">{label}</p>
      <p className="mt-0.5 font-display text-xl font-extrabold text-tuji-ink">{value}</p>
    </div>
  );
}

function MasteryRow({ word, mastery }: { word: Word; mastery: number }) {
  const tier = scoreTier(mastery);
  return (
    <li>
      <Link href={`/word/${word.id}`} className="flex items-center gap-3">
        <div className="w-10 shrink-0">
          <WordTile imageUrl={word.imageUrl} word={word.word} height={40} rounded={8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-tuji-ink">
            {word.word} <span className="font-normal text-tuji-ink3">· {word.chinese}</span>
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tuji-bg">
            <div className="h-full rounded-full" style={{ width: `${mastery}%`, background: tier.color }} />
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs text-tuji-ink3">{Math.round(mastery)}</span>
      </Link>
    </li>
  );
}
