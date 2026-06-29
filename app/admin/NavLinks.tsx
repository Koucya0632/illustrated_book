"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  // When true, /admin/words/* (etc.) is treated as active too. When false,
  // only an exact pathname match counts — needed for `/admin` itself so that
  // visiting /admin/words doesn't also highlight 總覽.
  prefix?: boolean;
}

const LINKS: NavLink[] = [
  { href: "/admin", label: "總覽" },
  { href: "/admin/words", label: "單字管理", prefix: true },
  { href: "/admin/reports", label: "報錯中心", prefix: true },
  { href: "/admin/atlas", label: "圖鑑審核", prefix: true },
  { href: "/admin/stats", label: "統計", prefix: true },
];

export default function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.prefix
          ? pathname === l.href || pathname.startsWith(`${l.href}/`)
          : pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "px-3 py-1.5 rounded-md bg-sky-soft text-sky-accent font-medium"
                : "px-3 py-1.5 rounded-md hover:bg-black/5 text-muted hover:text-ink"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
