import FavoritesClient from "./FavoritesClient";

export default function FavoritesPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">我的收藏 ❤️</h1>
      <p className="text-sm text-muted mt-1">所有你想複習的單字都在這裡。</p>
      <FavoritesClient />
    </div>
  );
}
