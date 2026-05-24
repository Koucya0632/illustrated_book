import SearchClient from "./SearchClient";

export default function SearchPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">搜尋單字</h1>
      <p className="text-sm text-muted mt-1">輸入中文或英文，例如「冰箱」或「fridge」。</p>
      <SearchClient />
    </div>
  );
}
