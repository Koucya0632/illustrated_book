import Link from "next/link";
import type { Category } from "@/types";

export default function CategoryCard({
  category,
  count,
}: {
  category: Category;
  count: number;
}) {
  return (
    <Link
      href={`/category/${category.id}`}
      className="group rounded-xl2 overflow-hidden bg-white shadow-card hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col"
    >
      <div
        className={`relative aspect-[4/3] bg-gradient-to-br ${category.color} flex items-center justify-center`}
      >
        <span className="text-7xl drop-shadow-sm">{category.emoji}</span>
        <span className="absolute top-3 right-3 text-xs bg-white/80 backdrop-blur px-2 py-1 rounded-full font-medium text-ink">
          {count} 個單字
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-ink">{category.name}</h3>
          <span className="text-sm text-muted">{category.nameZh}</span>
        </div>
        <p className="mt-1 text-sm text-muted line-clamp-1">{category.description}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-sky-accent group-hover:gap-2 transition-all">
          開始學習
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
