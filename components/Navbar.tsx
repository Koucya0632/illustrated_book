"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import UserNav from "./UserNav";
import { useCurrentUser } from "./UserProvider";

const links = [
  { href: "/", label: "首頁", en: "Home" },
  { href: "/search", label: "搜尋", en: "Search" },
  { href: "/study", label: "複習", en: "Study" },
  { href: "/quiz", label: "測驗", en: "Quiz" },
  { href: "/favorites", label: "收藏", en: "Favorites" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = useCurrentUser();

  return (
    <header className="sticky top-0 z-50 bg-cream/80 backdrop-blur border-b border-black/5">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-2xl">📖</span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm sm:text-base font-semibold text-ink group-hover:text-sky-accent transition">
              Everyday English
            </span>
            <span className="text-[10px] sm:text-xs text-muted">Picture Dictionary</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? "bg-sky-soft text-ink font-semibold"
                    : "text-muted hover:text-ink hover:bg-black/5"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <UserNav />
          <button
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-black/5"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#2D3748" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden border-t border-black/5 bg-cream">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-3 rounded-lg text-sm ${
                    active ? "bg-sky-soft font-semibold" : "hover:bg-black/5"
                  }`}
                >
                  {l.label} · <span className="text-muted">{l.en}</span>
                </Link>
              );
            })}
            {!user && (
              <div className="border-t border-black/5 mt-1 pt-1 flex gap-2">
                <Link
                  href="/signin"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-3 rounded-lg text-sm text-center hover:bg-black/5"
                >
                  登入
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-3 rounded-lg text-sm text-center bg-sky-accent text-white"
                >
                  註冊
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
