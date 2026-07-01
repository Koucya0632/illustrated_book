"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AtlasReportActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve(status: "reviewed" | "dismissed") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/atlas/reports/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => resolve("reviewed")}
        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        標記已處理
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => resolve("dismissed")}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-black/5 disabled:opacity-60"
      >
        忽略
      </button>
    </div>
  );
}
