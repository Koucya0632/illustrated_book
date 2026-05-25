import Link from "next/link";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-cream">
      <div className="bg-white border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm font-semibold text-ink">
              🛠️ Admin
            </Link>
            <NavLinks />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md hover:bg-black/5 text-muted hover:text-ink"
            >
              ← 回前台
            </Link>
            <LogoutButton />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
