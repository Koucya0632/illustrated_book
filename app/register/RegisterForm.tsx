"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProgress } from "@/lib/storage";

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;

export default function RegisterForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!USERNAME_RE.test(username)) {
      setError("用戶名須為 3-24 字，限英數與 _ . -");
      return;
    }
    if (password.length < 6) {
      setError("密碼至少 6 個字元");
      return;
    }
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: e1 } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Used by the SQL trigger handle_new_user() to seed profiles.username.
          data: { username },
          // Make the email confirmation link land back on *this* origin
          // (otherwise Supabase falls back to the configured Site URL).
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (e1) throw e1;

      // If email confirmation is enabled, signUp may not return a session.
      if (!data.session) {
        setInfo(
          "已寄發認證信。請收信點連結完成註冊後再回來登入。",
        );
        setLoading(false);
        return;
      }

      // Sync local progress now that we're authenticated.
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
        <span className="text-sm font-bold text-tuji-ink">用戶名</span>
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="3-24 字，限英數與 _ . -"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-tuji-ink">電子郵件</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-tuji-ink">密碼</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 6 個字元"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-tuji-ink">再次輸入密碼</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={INPUT}
        />
      </label>

      {error && (
        <p className="rounded-xl bg-tuji-coral/10 px-3 py-2 text-sm font-semibold text-tuji-coral">{error}</p>
      )}
      {info && (
        <p className="rounded-xl bg-tuji-green/10 px-3 py-2 text-sm font-semibold text-tuji-green">{info}</p>
      )}

      <button
        type="submit"
        disabled={loading || !username || !email || !password}
        className="w-full rounded-xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-soft transition hover:brightness-105 disabled:opacity-40"
      >
        {loading ? "建立中..." : "建立帳號"}
      </button>
    </form>
  );
}

const INPUT =
  "mt-1 w-full rounded-xl bg-tuji-bg px-3.5 py-2.5 text-tuji-ink outline-none border border-black/10 focus:ring-2 focus:ring-tuji-teal";
