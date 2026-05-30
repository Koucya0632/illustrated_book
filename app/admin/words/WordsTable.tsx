"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCategories } from "@/components/CategoriesProvider";
import type { Word } from "@/types";

type SortKey = "word" | "chinese" | "category";
type SortDir = "asc" | "desc";

export default function WordsTable({ initial }: { initial: Word[] }) {
  const router = useRouter();
  const categories = useCategories();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("word");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((w) => {
      if (cat !== "all" && w.category !== cat) return false;
      if (!needle) return true;
      const hay = [w.word, w.chinese, w.id, ...(w.alsoKnownAs ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    const sign = sortDir === "asc" ? 1 : -1;
    // locale-aware compare so Chinese sorts sensibly and "Apple" beats "banana".
    const collator = new Intl.Collator(["en", "zh-Hant"], { sensitivity: "base" });
    return filtered.slice().sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sign * collator.compare(av, bv);
    });
  }, [items, q, cat, sortKey, sortDir]);

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
              <SortHeader label="英文" sortKey="word" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortHeader label="中文" sortKey="chinese" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortHeader
                label="分類"
                sortKey="category"
                current={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                className="hidden sm:table-cell"
              />
              <th className="text-right px-3 py-2 w-28">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-t border-black/5 hover:bg-cream/40">
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={w.imageUrl}
                    alt={w.word}
                    title={w.id}
                    loading="lazy"
                    decoding="async"
                    className="w-10 h-10 rounded object-cover bg-cream"
                  />
                </td>
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
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
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

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={`text-left px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={
          "inline-flex items-center gap-1 hover:text-ink " +
          (active ? "text-ink font-semibold" : "")
        }
      >
        <span>{label}</span>
        <span className="text-xs w-3 inline-block">{arrow}</span>
      </button>
    </th>
  );
}
