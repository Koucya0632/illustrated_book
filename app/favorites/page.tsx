import FavoritesClient from "./FavoritesClient";

export const metadata = { title: "我的收藏 · Tuji" };

export default function FavoritesPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">我的收藏</div>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">收藏的單字 ❤️</h1>
      <p className="mt-1 text-sm font-semibold text-tuji-ink3">所有你想複習的單字都在這裡。</p>
      <FavoritesClient />
    </div>
  );
}
