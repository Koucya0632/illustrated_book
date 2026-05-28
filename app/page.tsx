import Link from "next/link";
import TodayWords from "@/components/tuji/TodayWords";
import Mascot from "@/components/tuji/Mascot";
import { StreakChip, shade, TUJI } from "@/components/tuji/ui";
import { categories } from "@/lib/categories";
import { getAllWords } from "@/lib/data";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getStudyStreak } from "@/lib/users-db";

export const dynamic = "force-dynamic";

function greeting(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早安";
  if (hour < 14) return "午安";
  if (hour < 18) return "下午好";
  return "晚安";
}

export default async function HomePage() {
  const [words, bundle] = await Promise.all([getAllWords(), getCurrentUserBundle()]);
  const streak = bundle ? await getStudyStreak(bundle.user.id) : null;

  const tz = "Asia/Taipei";
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now),
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  })
    .format(now)
    .toUpperCase();

  const name = bundle?.user.username ?? "同學";
  const learnedCount = bundle?.learned.length ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6 sm:px-7">
      {/* Topbar */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            {dateLabel}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">
            {greeting(hour)}，{name} 👋
          </h1>
        </div>
        <div className="hidden items-center gap-2.5 sm:flex">
          {streak && streak.current > 0 && <StreakChip n={streak.current} />}
          <Link
            href="/search"
            className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-tuji-ink shadow-soft"
          >
            🔍 搜尋
          </Link>
          <Link
            href="/settings"
            aria-label="設定"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-tuji-ink shadow-soft"
          >
            ⚙
          </Link>
        </div>
      </header>

      {/* Hero strip */}
      <div className="grid gap-3.5 lg:grid-cols-[2.4fr_1fr_1fr]">
        {/* task card */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-[24px] bg-tuji-teal p-6 text-white">
          <div className="pointer-events-none absolute right-6 top-4 text-sm text-tuji-yellow/80">✦</div>
          <div className="flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">
              今日任務
            </div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="font-display text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">
                5
              </span>
              <span className="text-sm text-white/85">個單字 · 約 3 分鐘</span>
            </div>
            <div className="mt-4 flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="h-1.5 w-7 rounded-full bg-white/25" />
              ))}
            </div>
            <div className="mt-4">
              <Link
                href={bundle ? "/study" : "/signin?next=/study"}
                className="tuji-press inline-block rounded-2xl bg-tuji-yellow px-6 py-4 text-base font-extrabold tracking-tight text-tuji-ink"
                style={{ ["--press-shadow" as string]: shade(TUJI.yellow, -16) }}
              >
                出發吧！ →
              </Link>
            </div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <Mascot pose="wave" size={132} />
          </div>
        </div>

        {/* streak tile */}
        <Link
          href="/progress"
          className="relative overflow-hidden rounded-[24px] bg-tuji-yellow p-5 transition hover:brightness-[0.98]"
        >
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink">
            連續天數
          </div>
          <div className="mt-1.5 font-display text-5xl font-extrabold leading-none tracking-tight text-tuji-ink">
            {streak?.current ?? 0}
          </div>
          <div className="mt-1.5 text-xs font-bold text-tuji-ink/75">
            {streak && streak.longest > 0 ? `最長 ${streak.longest} 天` : "開始累積連續天數"}
          </div>
        </Link>

        {/* learned tile */}
        <Link
          href="/cards"
          className="relative overflow-hidden rounded-[24px] bg-tuji-pink p-5 transition hover:brightness-[0.98]"
        >
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink">
            {bundle ? "已學單字" : "收錄單字"}
          </div>
          <div className="mt-1.5 font-display text-5xl font-extrabold leading-none tracking-tight text-tuji-ink">
            {bundle ? learnedCount : words.length}
          </div>
          <div className="mt-1.5 text-xs font-bold text-tuji-ink/75">
            {bundle ? `共 ${words.length} 個可學` : `${categories.length} 個主題`}
          </div>
        </Link>
      </div>

      {/* Today words */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-tuji-ink">今天會碰到</h2>
            <p className="mt-0.5 text-xs font-semibold text-tuji-ink3">點任一張卡片預覽，或直接開始</p>
          </div>
          <Link href="/cards" className="text-[13px] font-extrabold text-tuji-teal">
            看全部 →
          </Link>
        </div>
        <TodayWords />
      </section>

      {/* Explore categories */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold tracking-tight text-tuji-ink">探索主題</h2>
        <div className="flex flex-wrap gap-2.5">
          {categories.map((c) => {
            const count = words.filter((w) => w.category === c.id).length;
            return (
              <Link
                key={c.id}
                href={`/category/${c.id}`}
                className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-tuji-ink shadow-soft transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <span className="text-base">{c.emoji}</span>
                {c.nameZh}
                <span className="text-xs font-extrabold text-tuji-ink4">{count}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
