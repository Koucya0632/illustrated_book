"use client";

import { useState } from "react";
import { getProgress } from "@/lib/storage";

export default function SigninForm({ next }: { next: string }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "登入失敗");
      }
      // Sync local progress to the account.
      try {
        const p = getProgress();
        await fetch("/api/users/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            favorites: p.favoriteIds,
            learned: p.learnedIds,
          }),
        });
      } catch {
        /* non-fatal */
      }
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-ink">電子郵件或用戶名</span>
        <input
          autoFocus
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">密碼</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
      </label>

      {error && (
        <p className="text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !identifier || !password}
        className="w-full px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90 disabled:opacity-40"
      >
        {loading ? "登入中..." : "登入"}
      </button>
    </form>
  );
}

const INPUT =
  "mt-1 w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent";
