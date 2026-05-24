import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="text-6xl">🔎</div>
      <h1 className="mt-4 text-2xl font-bold text-ink">找不到這個頁面</h1>
      <p className="mt-2 text-muted">這個單字或分類可能還沒有收錄。</p>
      <Link
        href="/"
        className="mt-6 inline-block px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90"
      >
        回首頁
      </Link>
    </div>
  );
}
