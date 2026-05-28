import Link from "next/link";
import { notFound } from "next/navigation";
import WordCard from "@/components/WordCard";
import EventTracker from "@/components/EventTracker";
import { shade, TUJI } from "@/components/tuji/ui";
import { categories, getCategory } from "@/lib/categories";
import { getWordsByCategory } from "@/lib/data";
import VisitTracker from "./VisitTracker";

export const revalidate = 60;

export function generateStaticParams() {
  return categories.map((c) => ({ id: c.id }));
}

export default async function CategoryPage({ params }: { params: { id: string } }) {
  const category = getCategory(params.id);
  if (!category) notFound();
  const items = await getWordsByCategory(category.id);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <VisitTracker id={category.id} />
      <EventTracker category={category.id} />

      <nav className="mb-4 flex items-center gap-2 text-xs font-bold text-tuji-ink3">
        <Link href="/cards" className="hover:text-tuji-ink">
          單字庫
        </Link>
        <span>›</span>
        <span className="font-extrabold text-tuji-ink">{category.nameZh}</span>
      </nav>

      <div className="relative flex items-center gap-5 overflow-hidden rounded-[24px] bg-tuji-ink p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute right-8 top-5 text-sm text-tuji-yellow/70">✦</div>
        <div className="text-6xl sm:text-7xl">{category.emoji}</div>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{category.name}</h1>
          <p className="text-lg text-white/75">{category.nameZh}</p>
          <p className="mt-1 text-sm text-white/60">
            {category.description} · 共 {items.length} 個單字
          </p>
        </div>
      </div>

      <section className="mt-6">
        {items.length === 0 ? (
          <p className="py-12 text-center text-tuji-ink3">這個分類還沒有單字。</p>
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
          學完了嗎？開始複習 →
        </Link>
      </div>
    </div>
  );
}
