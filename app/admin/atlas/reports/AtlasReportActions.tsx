"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AtlasReportActions({
  id,
  canTakeDown,
}: {
  id: string;
  canTakeDown: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Takedown is final for the author (no re-submit), and it sits next to two
  // harmless buttons — so it takes a second click.
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function post(body: { status: "reviewed" | "dismissed" } | { action: "takedown" }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/atlas/reports/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "更新失敗");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => post({ status: "reviewed" })}
        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        標記已處理
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => post({ status: "dismissed" })}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-black/5 disabled:opacity-60"
      >
        忽略
      </button>
      {canTakeDown && !confirming && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
        >
          下架
        </button>
      )}
      {canTakeDown && confirming && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => post({ action: "takedown" })}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? "下架中..." : "確定下架"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-black/5 disabled:opacity-60"
          >
            取消
          </button>
        </>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
