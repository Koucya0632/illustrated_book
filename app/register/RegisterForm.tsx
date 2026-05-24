"use client";

import { useState } from "react";
import { getProgress } from "@/lib/storage";

export default function RegisterForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "註冊失敗");
      }
      // Sync local favorites/learned to the server now that we're logged in.
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
      setError(err instanceof Error ? err.message : "註冊失敗");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-ink">用戶名</span>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="3-24 字，限英數與 _ . -"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">電子郵件</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">密碼</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 6 個字元"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">再次輸入密碼</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={INPUT}
        />
      </label>

      {error && (
        <p className="text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !username || !email || !password}
        className="w-full px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90 disabled:opacity-40"
      >
        {loading ? "建立中..." : "建立帳號"}
      </button>
    </form>
  );
}

const INPUT =
  "mt-1 w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent";
