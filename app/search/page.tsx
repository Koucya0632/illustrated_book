import SearchClient from "./SearchClient";

export const metadata = { title: "搜尋 · Tuji" };

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">搜尋</div>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">找一個單字</h1>
      <p className="mt-1 text-sm font-semibold text-tuji-ink3">輸入中文或英文，例如「冰箱」或「fridge」。</p>
      <SearchClient />
    </div>
  );
}
