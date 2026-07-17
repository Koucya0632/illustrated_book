"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
  ["pending", "待處理"],
  ["reviewing", "確認中"],
  ["resolved", "已處理"],
  ["rejected", "不採納"],
  ["duplicate", "重複意見"],
] as const;

export default function FeedbackActions({
  id,
  initialStatus,
  initialNote,
}: {
  id: number;
  initialStatus: string;
  initialNote: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, internalNote: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "更新失敗");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-black/5 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">處理狀態</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2"
          >
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-ink">
          內部備註{status === "rejected" ? "（必填）" : ""}
        </span>
        <textarea
          value={note}
          maxLength={2000}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-black/10 px-3 py-2"
          placeholder="處理結果、採納情況或不採納原因…"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-rose-600">{error}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || (status === "rejected" && !note.trim())}
          className="rounded-lg bg-sky-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "儲存中…" : "儲存處理結果"}
        </button>
      </div>
    </div>
  );
}
