import Link from "next/link";
import { notFound } from "next/navigation";
import WordCard from "@/components/WordCard";
import { categories, getCategory } from "@/lib/categories";
import { getWordsByCategory } from "@/lib/data";
import VisitTracker from "./VisitTracker";
import EventTracker from "@/components/EventTracker";

export const revalidate = 60;

export function generateStaticParams() {
  return categories.map((c) => ({ id: c.id }));
}

export default async function CategoryPage({
  params,
}: {
  params: { id: string };
}) {
  const category = getCategory(params.id);
  if (!category) notFound();
  const items = await getWordsByCategory(category.id);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <VisitTracker id={category.id} />
      <EventTracker category={category.id} />

      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-ink">
          首頁
        </Link>{" "}
        / <span className="text-ink">{category.nameZh}</span>
      </nav>

      <div
        className={`mt-4 rounded-xl2 p-6 sm:p-8 bg-gradient-to-br ${category.color} flex items-center gap-5`}
      >
        <div className="text-6xl sm:text-7xl">{category.emoji}</div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">{category.name}</h1>
          <p className="text-lg text-ink/70">{category.nameZh}</p>
          <p className="mt-1 text-sm text-ink/60">
            {category.description} · 共 {items.length} 個單字
          </p>
        </div>
      </div>

      <section className="mt-6">
        {items.length === 0 ? (
          <p className="text-center py-12 text-muted">這個分類還沒有單字。</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((w) => (
              <WordCard key={w.id} word={w} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 flex justify-center">
        <Link
          href="/quiz"
          className="px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90 transition"
        >
          學完了嗎？挑戰小測驗 🎯
        </Link>
      </div>
    </div>
  );
}
