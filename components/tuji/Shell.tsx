"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Mascot from "./Mascot";
import { useT } from "@/components/I18n";
import type { AvatarPose } from "@/lib/avatars";

interface NavItem {
  id: string;
  labelKey: string;
  href: string;
  icon: string;
  // pathname prefixes that should light this item up
  match: (p: string) => boolean;
}

const NAV: NavItem[] = [
  { id: "today", labelKey: "nav.today", href: "/today", icon: "☀️", match: (p) => p === "/today" },
  {
    id: "cards",
    labelKey: "nav.cards",
    href: "/cards",
    icon: "📖",
    match: (p) =>
      p.startsWith("/cards") ||
      p.startsWith("/word") ||
      p.startsWith("/category") ||
      p.startsWith("/search"),
  },
  {
    id: "atlas",
    labelKey: "nav.atlas",
    href: "/atlas",
    icon: "🖼️",
    match: (p) => p.startsWith("/atlas"),
  },
  { id: "play", labelKey: "nav.study", href: "/study", icon: "✏️", match: (p) => p.startsWith("/study") },
  { id: "dash", labelKey: "nav.progress", href: "/progress", icon: "📊", match: (p) => p.startsWith("/progress") },
  {
    id: "me",
    labelKey: "nav.me",
    href: "/me",
    icon: "👤",
    match: (p) => p.startsWith("/me") || p.startsWith("/settings") || p.startsWith("/favorites"),
  },
];

// Auth routes get a clean, sidebar-free layout — just the brand mark + the
// centered form, on the Tuji cream background.
const AUTH_PREFIXES = ["/signin", "/register", "/login"];
const PUBLIC_PATHS = new Set(["/", "/auth/confirmed", "/privacy", "/terms", "/support"]);

export default function TujiShell({
  user,
  children,
}: {
  user: {
    username: string;
    nickname: string | null;
    avatar: AvatarPose;
    email: string;
  } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const t = useT();

  if (PUBLIC_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  if (AUTH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tuji-teal">
              <span className="font-display text-lg font-black text-white">T</span>
            </span>
            <span className="font-display text-[22px] font-extrabold tracking-tight text-tuji-ink">
              Tuji<span className="text-tuji-coral">.</span>
            </span>
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-5 bg-tuji-ink p-4 text-white md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tuji-teal">
            <span className="font-display text-lg font-black text-white">T</span>
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-tight">
            Tuji<span className="text-tuji-yellow">.</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((it) => {
            const on = it.match(pathname);
            return (
              <Link
                key={it.id}
                href={it.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  on
                    ? "bg-tuji-teal font-extrabold text-white"
                    : "font-semibold text-white/85 hover:bg-white/5"
                }`}
              >
                <span className="w-4 text-center">{it.icon}</span>
                <span className="flex-1">{t(it.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          {user ? (
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-2xl bg-white/[0.06] p-3.5 transition hover:bg-white/10"
            >
              <span className="flex h-7 w-7 shrink-0 items-end justify-center overflow-hidden rounded-full bg-tuji-tealS">
                <Mascot pose={user.avatar} size={26} />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-extrabold">
                {user.nickname?.trim() || user.username}
              </span>
              <span className="shrink-0 text-sm text-white/70" aria-hidden="true">⚙</span>
            </Link>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.06] p-3.5">
              <Link
                href="/signin"
                className="rounded-xl bg-tuji-yellow py-2 text-center text-[13px] font-extrabold text-tuji-ink"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/register"
                className="rounded-xl py-2 text-center text-[13px] font-extrabold text-white/85 hover:bg-white/5"
              >
                {t("nav.register")}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile top header ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-black/5 bg-tuji-bg/85 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tuji-teal">
              <span className="font-display text-base font-black text-white">T</span>
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-tuji-ink">
              Tuji<span className="text-tuji-coral">.</span>
            </span>
          </Link>
          <Link
            href="/search"
            aria-label={t("common.search")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-tuji-ink shadow-soft"
          >
            🔍
          </Link>
        </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>

        {/* ── Mobile bottom tab bar ── */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-black/5 bg-white pb-[env(safe-area-inset-bottom)] pt-2 md:hidden">
          {NAV.map((it) => {
            const on = it.match(pathname);
            const center = it.id === "play";
            if (center) {
              return (
                <Link key={it.id} href={it.href} className="flex justify-start" aria-label={t(it.labelKey)}>
                  <span className="mx-auto -mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-tuji-teal shadow-[0_6px_18px_rgba(0,111,114,0.35)]">
                    <span className="text-2xl" aria-hidden="true">{it.icon}</span>
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={it.id}
                href={it.href}
                className="flex flex-col items-center gap-0.5 pb-5"
                aria-label={t(it.labelKey)}
              >
                <span className={`text-lg ${on ? "" : "opacity-40 grayscale"}`}>{it.icon}</span>
                <span className={`text-[10px] font-bold ${on ? "text-tuji-teal" : "text-tuji-ink4"}`}>
                  {t(it.labelKey)}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
