import Link from "next/link";
import { redirect } from "next/navigation";
import Mascot from "@/components/tuji/Mascot";
import { WordTile, scoreTier, TUJI } from "@/components/tuji/ui";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getAllWords } from "@/lib/data";
import { applyDecay } from "@/lib/mastery";
import { getAllMastery, getStudyStreak, getSettings } from "@/lib/users-db";
import { t, localeTag } from "@/lib/i18n";
import MeClient from "./MeClient";
import type { Word } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的帳號 · Tuji" };

export default async function MePage() {
  const bundle = await getCurrentUserBundle();
  if (!bundle) redirect("/signin?next=/me");

  const settings = await getSettings(bundle.user.id);
  const [allWords, masteryRows, streak] = await Promise.all([
    getAllWords(settings.uiLang),
    getAllMastery(bundle.user.id),
    getStudyStreak(bundle.user.id),
  ]);
  const tr = (key: string, vars?: Record<string, string | number>) => t(settings.uiLang, key, vars);
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
  const topMastered = masteredItems.slice(0, 5);
  const needsWork = [...masteredItems].filter((x) => x.mastery < 60).sort((a, b) => a.mastery - b.mastery).slice(0, 5);
  const completion = allWords.length > 0 ? Math.round((learnedCount / allWords.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
      <div className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">{tr("me.eyebrow")}</div>

      {/* Profile hero */}
      <div className="relative mb-4 flex flex-col items-center gap-5 overflow-hidden rounded-[24px] bg-tuji-ink p-6 text-white sm:flex-row">
        <div className="flex h-28 w-28 shrink-0 items-end justify-center overflow-hidden rounded-[28px] bg-tuji-teal">
          <Mascot pose={bundle.user.avatar} size={116} />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            {bundle.user.nickname?.trim() || bundle.user.username}
          </h1>
          <p className="mt-1 text-[13px] text-white/70">
            {tr("set.profileSub", {
              email: bundle.user.email,
              joined: new Date(bundle.user.createdAt).toLocaleDateString(localeTag(settings.uiLang)),
            })}
          </p>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] font-extrabold text-white/80">
              <span>{tr("progress.completion")}</span>
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
            <div className="mt-1 text-[11px] font-extrabold">{tr("progress.tile.streak")}</div>
          </div>
          <Link href="/cards" className="min-w-[88px] rounded-2xl bg-tuji-yellow px-4 py-3 text-center text-tuji-ink">
            <div className="font-display text-2xl font-extrabold leading-none">{learnedCount}</div>
            <div className="mt-1 text-[11px] font-extrabold">{tr("me.learnedShort")}</div>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Mastery overview */}
          {masteredItems.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {topMastered.length > 0 && (
                <div className="rounded-[18px] bg-white p-4 shadow-soft">
                  <h3 className="mb-3 text-sm font-extrabold text-tuji-ink">{tr("me.topMastered")}</h3>
                  <ul className="flex flex-col gap-3">
                    {topMastered.map((item) => (
                      <MasteryRow key={item.word.id} word={item.word} mastery={item.mastery} />
                    ))}
                  </ul>
                </div>
              )}
              {needsWork.length > 0 && (
                <div className="rounded-[18px] bg-white p-4 shadow-soft">
                  <h3 className="mb-3 text-sm font-extrabold text-tuji-ink">{tr("me.needsWork")}</h3>
                  <ul className="flex flex-col gap-3">
                    {needsWork.map((item) => (
                      <MasteryRow key={item.word.id} word={item.word} mastery={item.mastery} />
                    ))}
                  </ul>
                  <Link href="/study" className="mt-3 inline-block text-sm font-extrabold text-tuji-teal">
                    {tr("me.goStudy")}
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Favorites */}
          <div>
            <h2 className="mb-3 text-sm font-extrabold text-tuji-ink">{tr("progress.tile.favSub")}</h2>
            {fav.length === 0 ? (
              <p className="text-sm text-tuji-ink3">
                {tr("me.noFav")}{" "}
                <Link href="/cards" className="font-extrabold text-tuji-teal">
                  {tr("me.goBrowse")}
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
              <div className="text-sm font-extrabold text-tuji-ink">{tr("me.prefs")}</div>
              <div className="text-[11px] font-extrabold text-tuji-ink3">{tr("me.edit")}</div>
            </div>
            <p className="mt-2 text-xs text-tuji-ink3">{tr("me.prefsSub")}</p>
          </Link>

          <MeClient />
        </div>
      </div>
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
