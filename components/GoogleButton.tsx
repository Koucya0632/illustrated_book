"use client";

import { createClient } from "@/lib/supabase/client";

export default function GoogleButton({
  next,
  label = "用 Google 繼續",
}: {
  next: string;
  label?: string;
}) {
  async function start() {
    const supabase = createClient();
    const redirectTo =
      typeof window === "undefined"
        ? "/auth/callback"
        : `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    // Supabase navigates the browser to Google; if we're still here, something
    // went wrong silently — surfaces below.
  }

  return (
    <button
      onClick={start}
      type="button"
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-soft transition hover:shadow-card"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.71A5.41 5.41 0 013.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 009 0 9 9 0 00.96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}
