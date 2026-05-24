"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { categories } from "@/lib/categories";
import type { Word } from "@/types";

export default function WordsTable({ initial }: { initial: Word[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((w) => {
      if (cat !== "all" && w.category !== cat) return false;
      if (!needle) return true;
      const hay = [w.word, w.chinese, w.id, ...(w.alsoKnownAs ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, cat]);

  async function handleDelete(id: string, label: string) {
    if (!confirm(`確定刪除「${label}」嗎？此操作無法復原。`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/words/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "delete failed");
      }
      setItems((arr) => arr.filter((w) => w.id !== id));
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋 id / 英文 / 中文"
          className="flex-1 rounded-full bg-white shadow-soft px-4 py-2 outline-none focus:ring-2 ring-sky-accent"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-full bg-white shadow-soft px-4 py-2 outline-none focus:ring-2 ring-sky-accent"
        >
          <option value="all">全部分類</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name} · {c.nameZh}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs text-muted">{rows.length} 個結果</p>

      <div className="mt-2 bg-white rounded-xl2 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-muted">
            <tr>
              <th className="text-left px-3 py-2 w-12">圖</th>
              <th className="text-left px-3 py-2">id</th>
              <th className="text-left px-3 py-2">英文</th>
              <th className="text-left px-3 py-2">中文</th>
              <th className="text-left px-3 py-2 hidden sm:table-cell">分類</th>
              <th className="text-right px-3 py-2 w-28">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-t border-black/5 hover:bg-cream/40">
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.imageUrl} alt={w.word} className="w-10 h-10 rounded object-cover bg-cream" />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{w.id}</td>
                <td className="px-3 py-2 font-semibold text-ink">{w.word}</td>
                <td className="px-3 py-2">{w.chinese}</td>
                <td className="px-3 py-2 hidden sm:table-cell text-muted">{w.category}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/words/${w.id}/edit`}
                    className="text-sky-accent hover:underline mr-3"
                  >
                    編輯
                  </Link>
                  <button
                    onClick={() => handleDelete(w.id, `${w.word} / ${w.chinese}`)}
                    disabled={deleting === w.id}
                    className="text-rose-500 hover:underline disabled:opacity-50"
                  >
                    {deleting === w.id ? "刪除中" : "刪除"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  沒有資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
