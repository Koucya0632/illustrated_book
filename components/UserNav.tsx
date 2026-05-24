"use client";

import Link from "next/link";
import { useState } from "react";
import { useCurrentUser } from "./UserProvider";

export default function UserNav() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <div className="hidden sm:flex items-center gap-2">
        <Link
          href="/signin"
          className="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-ink hover:bg-black/5"
        >
          登入
        </Link>
        <Link
          href="/register"
          className="px-3 py-1.5 rounded-lg text-sm bg-sky-accent text-white hover:bg-sky-accent/90"
        >
          註冊
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/5"
      >
        <span className="w-7 h-7 rounded-full bg-sky-soft text-sky-accent flex items-center justify-center text-xs font-bold">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-sm text-ink font-medium hidden sm:inline">
          {user.username}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-card border border-black/5 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-black/5">
            <p className="text-sm font-semibold text-ink truncate">
              {user.username}
            </p>
            <p className="text-xs text-muted truncate">{user.email}</p>
          </div>
          <Link
            href="/me"
            className="block px-4 py-2 text-sm hover:bg-sky-soft text-ink"
          >
            我的帳號
          </Link>
          <Link
            href="/favorites"
            className="block px-4 py-2 text-sm hover:bg-sky-soft text-ink"
          >
            我的收藏
          </Link>
          <Link
            href="/progress"
            className="block px-4 py-2 text-sm hover:bg-sky-soft text-ink"
          >
            學習進度
          </Link>
          <button
            onClick={async () => {
              const { createClient } = await import("@/lib/supabase/client");
              await createClient().auth.signOut();
              window.location.href = "/";
            }}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-rose-50 text-rose-500 border-t border-black/5"
          >
            登出
          </button>
        </div>
      )}
    </div>
  );
}
