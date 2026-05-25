import Link from "next/link";
import { listAll } from "@/lib/words-db";
import WordsTable from "./WordsTable";

export const dynamic = "force-dynamic";

export default async function AdminWordsPage() {
  const words = await listAll();
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink">單字管理</h1>
        <Link
          href="/admin/words/new"
          className="px-4 py-2 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90"
        >
          + 新增單字
        </Link>
      </div>

      <div className="mt-6">
        <WordsTable initial={words} />
      </div>
    </div>
  );
}
