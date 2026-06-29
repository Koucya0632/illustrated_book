"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AtlasReviewActions({
  id,
  initialAttributionName,
  reviewStatus,
}: {
  id: string;
  initialAttributionName: string;
  reviewStatus: string;
}) {
  const router = useRouter();
  const [attributionName, setAttributionName] = useState(initialAttributionName);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submit(action: "approve" | "reject" | "takedown") {
    if (saving) return;
    setSaving(action);
    setError("");
    try {
      const res = await fetch(`/api/admin/atlas/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, attributionName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "更新失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-black/5 pt-4">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-ink">公開署名</span>
        <input
          value={attributionName}
          maxLength={80}
          onChange={(e) => setAttributionName(e.currentTarget.value)}
          className="w-full rounded-lg border border-black/10 px-3 py-2"
          placeholder="可留空；公開頁不顯示使用者 ID"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-rose-600">{error}</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => submit("reject")}
            disabled={Boolean(saving)}
            className="rounded-lg bg-cream px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
          >
            {saving === "reject" ? "退回中..." : "退回"}
          </button>
          {reviewStatus === "approved" && (
            <button
              type="button"
              onClick={() => submit("takedown")}
              disabled={Boolean(saving)}
              className="rounded-lg bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-40"
            >
              {saving === "takedown" ? "下架中..." : "下架公開項目"}
            </button>
          )}
          <button
            type="button"
            onClick={() => submit("approve")}
            disabled={Boolean(saving)}
            className="rounded-lg bg-sky-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving === "approve" ? "發布中..." : "核准公開"}
          </button>
        </div>
      </div>
    </div>
  );
}
