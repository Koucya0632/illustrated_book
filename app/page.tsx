import CategoryCard from "@/components/CategoryCard";
import DailyWords from "@/components/DailyWords";
import SearchBar from "@/components/SearchBar";
import { categories } from "@/lib/categories";
import { getAllWords } from "@/lib/data";

export const revalidate = 60;

export default async function HomePage() {
  const words = await getAllWords();
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Hero */}
      <section className="text-center">
        <span className="inline-block text-xs sm:text-sm px-3 py-1 rounded-full bg-mint-soft text-emerald-700 font-medium">
          🌱 Picture Dictionary · 圖鑑式學英文
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-ink leading-tight">
          Everyday English
          <br className="sm:hidden" />
          <span className="text-sky-accent"> Picture Dictionary</span>
        </h1>
        <p className="mt-3 text-lg sm:text-xl font-medium text-ink">
          看得見的英文，記得住的單字。
        </p>
        <p className="mt-2 text-sm sm:text-base text-muted max-w-xl mx-auto">
          透過圖片、分類、發音、例句與小測驗，像看圖鑑一樣學會生活英文。
          目前共收錄 <strong className="text-ink">{words.length}</strong> 個常用單字。
        </p>

        <div className="mt-6 max-w-xl mx-auto">
          <SearchBar />
        </div>
      </section>

      {/* Daily 5 */}
      <section className="mt-14">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink">今日 5 個單字</h2>
            <p className="text-sm text-muted">每天更新，跟著節奏輕鬆學。</p>
          </div>
          <span className="text-xs text-muted hidden sm:block">每日隨機選出</span>
        </div>
        <DailyWords />
      </section>

      {/* Categories */}
      <section className="mt-14">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink">主要分類</h2>
            <p className="text-sm text-muted">挑一個地方，開始你的英文圖鑑之旅。</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              count={words.filter((w) => w.category === c.id).length}
            />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-14 grid sm:grid-cols-3 gap-4">
        <a
          href="/quiz"
          className="rounded-xl2 p-5 bg-gradient-to-br from-sky-soft to-white shadow-card hover:shadow-lg transition group"
        >
          <div className="text-3xl">🎯</div>
          <h3 className="mt-2 font-bold text-ink">挑戰小測驗</h3>
          <p className="text-sm text-muted">看圖選字、看中文選英文、拼字練習。</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-sky-accent group-hover:gap-2 transition-all">
            開始測驗 →
          </span>
        </a>
        <a
          href="/favorites"
          className="rounded-xl2 p-5 bg-gradient-to-br from-rose-50 to-white shadow-card hover:shadow-lg transition group"
        >
          <div className="text-3xl">❤️</div>
          <h3 className="mt-2 font-bold text-ink">我的收藏</h3>
          <p className="text-sm text-muted">收集想複習的單字，隨時翻回來看。</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-rose-500 group-hover:gap-2 transition-all">
            打開收藏 →
          </span>
        </a>
        <a
          href="/progress"
          className="rounded-xl2 p-5 bg-gradient-to-br from-mint-soft to-white shadow-card hover:shadow-lg transition group"
        >
          <div className="text-3xl">📈</div>
          <h3 className="mt-2 font-bold text-ink">學習進度</h3>
          <p className="text-sm text-muted">查看已學單字、收藏與測驗紀錄。</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-600 group-hover:gap-2 transition-all">
            查看進度 →
          </span>
        </a>
      </section>
    </div>
  );
}
