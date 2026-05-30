import Link from "next/link";
import Mascot from "@/components/tuji/Mascot";
import { shade, TUJI } from "@/components/tuji/ui";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getAllWords } from "@/lib/data";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getStudyStreak, getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { t, localeTag } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function greetingKey(hour: number): string {
  if (hour < 5) return "greeting.lateNight";
  if (hour < 11) return "greeting.morning";
  if (hour < 14) return "greeting.noon";
  if (hour < 18) return "greeting.afternoon";
  return "greeting.evening";
}

export default async function HomePage() {
  const bundle = await getCurrentUserBundle();
  const [streak, settings] = bundle
    ? await Promise.all([getStudyStreak(bundle.user.id), getSettings(bundle.user.id)])
    : [null, DEFAULT_SETTINGS];
  const [words, categories] = await Promise.all([
    getAllWords(settings.uiLang),
    getCategoriesFromDb(settings.uiLang),
  ]);
  const goal = settings.dailyGoal;
  const goalMinutes = Math.max(1, Math.round(goal * 0.6));
  const goalDashes = Math.min(goal, 10);
  // A specific category must be chosen ("all" = not selected) before the daily
  // task appears.
  const hasTheme = !!bundle && settings.studyCategory !== "all";
  const themeName = categories.find((c) => c.id === settings.studyCategory)?.nameZh ?? null;
  const tr = (key: string, vars?: Record<string, string | number>) => t(settings.uiLang, key, vars);
  // Today's task progress (global review count today vs the daily goal).
  const doneToday = streak?.todayCount ?? 0;
  const taskDone = hasTheme && doneToday >= goal;
  const filledDashes = goal > 0 ? Math.round(Math.min(doneToday / goal, 1) * goalDashes) : 0;

  const tz = "Asia/Taipei";
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now),
  );
  const dateLabel = new Intl.DateTimeFormat(localeTag(settings.uiLang), {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(now);

  const name = bundle?.user.username ?? tr("home.guestName");
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
            {tr(greetingKey(hour))}，{name} 👋
          </h1>
        </div>
        <div className="hidden items-center gap-2.5 sm:flex">
          <Link
            href="/search"
            className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-tuji-ink shadow-soft"
          >
            🔍 {tr("common.search")}
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
      <div className="grid gap-3.5 lg:grid-cols-[2.4fr_1fr]">
        {hasTheme ? (
          /* task card — a specific theme is set */
          <div className="relative flex items-center gap-4 overflow-hidden rounded-[24px] bg-tuji-teal p-6 text-white">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">
                  {tr("home.todayTask")}
                </span>
                <Link
                  href="/settings"
                  className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-extrabold text-white transition hover:bg-white/25"
                >
                  {tr("home.changeTheme", { theme: themeName ?? "" })}
                </Link>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="font-display text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">
                  {goal}
                </span>
                <span className="text-sm text-white/85">{tr("home.wordsAboutMin", { minutes: goalMinutes })}</span>
              </div>
              <div className="mt-4 flex gap-1">
                {Array.from({ length: goalDashes }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-7 rounded-full ${i < filledDashes ? "bg-tuji-yellow" : "bg-white/25"}`}
                  />
                ))}
              </div>
              <div className="mt-2.5 text-[13px] font-bold text-white/90">
                {taskDone ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                    {tr("home.taskDone")}
                  </span>
                ) : (
                  tr("home.todayProgress", { done: doneToday, goal })
                )}
              </div>
              <div className="mt-4">
                <Link
                  href="/study"
                  className="tuji-press inline-block rounded-2xl bg-tuji-yellow px-6 py-4 text-base font-extrabold tracking-tight text-tuji-ink"
                  style={{ ["--press-shadow" as string]: shade(TUJI.yellow, -16) }}
                >
                  {tr("home.go")}
                </Link>
              </div>
            </div>
            <div className="hidden shrink-0 sm:block">
              <Mascot pose={taskDone ? "cheer" : "wave"} size={132} />
            </div>
          </div>
        ) : (
          /* no specific theme chosen — prompt to pick one */
          <div className="relative flex items-center gap-4 overflow-hidden rounded-[24px] bg-tuji-teal p-6 text-white">
            <div className="hidden shrink-0 sm:block">
              <Mascot pose="think" size={108} />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">
                {tr("home.todayTask")}
              </div>
              <div className="mt-2 text-2xl font-extrabold tracking-tight">
                {bundle ? tr("home.pickThemeTitle") : tr("home.loginPickThemeTitle")}
              </div>
              <p className="mt-1.5 text-sm text-white/85">{tr("home.pickThemeSub")}</p>
              <div className="mt-4">
                <Link
                  href={bundle ? "/settings" : "/signin?next=/settings"}
                  className="tuji-press inline-block rounded-2xl bg-tuji-yellow px-6 py-4 text-base font-extrabold tracking-tight text-tuji-ink"
                  style={{ ["--press-shadow" as string]: shade(TUJI.yellow, -16) }}
                >
                  {bundle ? tr("home.goPickTheme") : tr("home.login")}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* streak + learned — stacked vertically on desktop, side by side on mobile */}
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-1 lg:grid-rows-2">
          {/* streak tile */}
          <Link
            href="/progress"
            className="relative overflow-hidden rounded-[24px] bg-tuji-yellow p-5 transition hover:brightness-[0.98]"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink">
              {tr("home.streak")}
            </div>
            <div className="mt-1.5 font-display text-4xl font-extrabold leading-none tracking-tight text-tuji-ink">
              {streak?.current ?? 0}
            </div>
            <div className="mt-1.5 text-xs font-bold text-tuji-ink/75">
              {streak && streak.longest > 0 ? tr("home.longestDays", { n: streak.longest }) : tr("home.startStreak")}
            </div>
          </Link>

          {/* learned tile */}
          <Link
            href="/cards"
            className="relative overflow-hidden rounded-[24px] bg-tuji-pink p-5 transition hover:brightness-[0.98]"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink">
              {bundle ? tr("home.learnedWords") : tr("home.collectedWords")}
            </div>
            <div className="mt-1.5 font-display text-4xl font-extrabold leading-none tracking-tight text-tuji-ink">
              {bundle ? learnedCount : words.length}
            </div>
            <div className="mt-1.5 text-xs font-bold text-tuji-ink/75">
              {bundle ? tr("home.ofTotalLearnable", { n: words.length }) : tr("home.numThemes", { n: categories.length })}
            </div>
          </Link>
        </div>
      </div>

      {/* Explore categories */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold tracking-tight text-tuji-ink">{tr("home.exploreThemes")}</h2>
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
