"use client";

import { useState } from "react";
import LoadingToast from "@/components/tuji/LoadingToast";
import { createClient } from "@/lib/supabase/client";
import { getProgress } from "@/lib/storage";

export default function SigninForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: e1 } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (e1) throw e1;

      // Sync local progress.
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
    <>
      <LoadingToast
        open={loading}
        title="登入中"
        description="正在同步你的學習進度"
      />
      <form onSubmit={handle} className="space-y-3">
        <label className="block">
          <span className="text-sm font-bold text-tuji-ink">電子郵件</span>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-tuji-ink">密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </label>

        {error && (
          <p className="rounded-xl bg-tuji-coral/10 px-3 py-2 text-sm font-semibold text-tuji-coral">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-40"
        >
          {loading ? "登入中..." : "登入"}
        </button>
      </form>
    </>
  );
}

const INPUT =
  "mt-1 w-full rounded-xl bg-tuji-bg px-3.5 py-2.5 text-tuji-ink outline-none border border-black/10 focus:ring-2 focus:ring-tuji-teal";
