"use client";

import { useState } from "react";

const REASONS: { value: string; label: string }[] = [
  { value: "inappropriate", label: "不當內容" },
  { value: "copyright", label: "侵權" },
  { value: "wrong", label: "資訊錯誤" },
  { value: "spam", label: "垃圾／廣告" },
  { value: "other", label: "其他" },
];

type Status = "idle" | "submitting" | "done" | "error";

export default function ReportButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("inappropriate");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setStatus("submitting");
    setMessage(null);
    try {
      const res = await fetch(`/api/atlas/public/${slug}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, detail }),
      });
      if (res.status === 401) {
        setStatus("error");
        setMessage("請先登入再檢舉。");
        return;
      }
      if (res.status === 429) {
        setStatus("error");
        setMessage("檢舉次數過多，請稍後再試。");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setMessage("送出失敗，請稍後再試。");
        return;
      }
      setStatus("done");
      setMessage("已收到你的檢舉，我們會盡快處理。");
    } catch {
      setStatus("error");
      setMessage("送出失敗，請稍後再試。");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-tuji-ink3 hover:text-tuji-coral hover:underline"
      >
        檢舉這個內容
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-black/10 bg-tuji-bg p-4">
      {status === "done" ? (
        <p className="text-sm font-semibold text-tuji-teal">{message}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-bold text-tuji-ink">檢舉這個公開內容</p>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="補充說明（選填）"
            maxLength={1000}
            rows={3}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
          {message && <p className="text-xs font-semibold text-tuji-coral">{message}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={status === "submitting"}
              className="rounded-lg bg-tuji-teal px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {status === "submitting" ? "送出中…" : "送出檢舉"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-tuji-ink3 hover:bg-black/5"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
