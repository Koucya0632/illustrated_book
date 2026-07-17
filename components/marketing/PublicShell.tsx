import Link from "next/link";

const APP_ICON_SRC = "/brand/tuji-app-icon.png";

const NAV = [
  { href: "/#features", label: "產品特色" },
  { href: "/#atlas", label: "自製圖鑑" },
  { href: "/#how", label: "怎麼學" },
  { href: "/support", label: "支援" },
];

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-tuji-bg text-tuji-ink">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-tuji-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-7">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={APP_ICON_SRC} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="font-display text-[22px] font-extrabold tracking-tight text-tuji-ink">
              Tuji<span className="text-tuji-coral">.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-extrabold text-tuji-ink2 md:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-tuji-teal">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/download"
            className="tuji-press rounded-xl bg-tuji-yellow px-4 py-2.5 text-sm font-extrabold text-tuji-ink"
            style={{ ["--press-shadow" as string]: "#d7a900" }}
          >
            取得 iOS App
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-tuji-ink text-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-7">
          <div className="grid gap-10 sm:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl shadow-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={APP_ICON_SRC} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="font-display text-xl font-extrabold tracking-tight">
                  Tuji<span className="text-tuji-yellow">.</span>
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm font-semibold leading-6 text-white/70">
                圖鑑式單字學習。用日常生活的圖片，把英文和日文單字真正記進腦袋。
              </p>
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/50">
                產品
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-white/80">
                <Link href="/#features" className="transition hover:text-tuji-yellow">
                  產品特色
                </Link>
                <Link href="/#atlas" className="transition hover:text-tuji-yellow">
                  自製圖鑑
                </Link>
                <Link href="/download" className="transition hover:text-tuji-yellow">
                  iOS App
                </Link>
              </div>
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/50">
                支援與法律
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-white/80">
                <Link href="/support" className="transition hover:text-tuji-yellow">
                  支援中心
                </Link>
                <Link href="/privacy" className="transition hover:text-tuji-yellow">
                  隱私權政策
                </Link>
                <Link href="/terms" className="transition hover:text-tuji-yellow">
                  服務條款
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs font-semibold text-white/50 sm:flex-row sm:items-center sm:justify-between">
            <p>Provided by Hong Kuok Wai · nexflow0632@gmail.com</p>
            <p>© {new Date().getFullYear()} Tuji</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
