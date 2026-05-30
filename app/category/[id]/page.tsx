import Link from "next/link";
import { notFound } from "next/navigation";
import WordCard from "@/components/WordCard";
import EventTracker from "@/components/EventTracker";
import { shade, TUJI } from "@/components/tuji/ui";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getWordsByCategory } from "@/lib/data";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { t } from "@/lib/i18n";
import VisitTracker from "./VisitTracker";

// Forced dynamic so the category title / count strings render in the
// signed-in user's UI language.
export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const settings = userId ? await getSettings(userId) : DEFAULT_SETTINGS;
  const lang = settings.uiLang;
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  const [cats, items] = await Promise.all([
    getCategoriesFromDb(lang),
    getWordsByCategory(params.id, lang),
  ]);
  const category = cats.find((c) => c.id === params.id);
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <VisitTracker id={category.id} />
      <EventTracker category={category.id} />

      <nav className="mb-4 flex items-center gap-2 text-xs font-bold text-tuji-ink3">
        <Link href="/cards" className="hover:text-tuji-ink">
          {tr("nav.cards")}
        </Link>
        <span>›</span>
        <span className="font-extrabold text-tuji-ink">{category.nameZh}</span>
      </nav>

      <div className="relative flex items-center gap-5 overflow-hidden rounded-[24px] bg-tuji-ink p-6 text-white sm:p-8">
        <div className="text-6xl sm:text-7xl">{category.emoji}</div>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{category.name}</h1>
          <p className="text-lg text-white/75">{category.nameZh}</p>
          <p className="mt-1 text-sm text-white/60">
            {category.description} · {tr("cat.countWords", { n: items.length })}
          </p>
        </div>
      </div>

      <section className="mt-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-tuji-ink3">{tr("cat.empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((w) => (
              <WordCard key={w.id} word={w} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 flex justify-center">
        <Link
          href="/study"
          className="tuji-press rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white"
          style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
        >
          {tr("cat.studyCta")}
        </Link>
      </div>
    </div>
  );
}
