"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "登入失敗");
      }
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="ADMIN_PASSWORD"
        className="w-full rounded-xl border border-black/10 bg-tuji-bg px-3.5 py-2.5 text-tuji-ink outline-none focus:ring-2 focus:ring-tuji-teal"
      />
      {error && (
        <p className="rounded-xl bg-tuji-coral/10 px-3 py-2 text-sm font-semibold text-tuji-coral">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full rounded-xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-40"
      >
        {loading ? "登入中..." : "登入"}
      </button>
    </form>
  );
}
