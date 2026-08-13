import Link from "next/link";
import { getPublicLang } from "@/lib/public-lang";
import { mt } from "@/lib/marketing-i18n";
import LangSwitcher from "./LangSwitcher";

const APP_ICON_SRC = "/brand/tuji-app-icon.png";

const NAV = [
  { href: "/#features", key: "nav.features" },
  { href: "/#atlas", key: "nav.atlas" },
  { href: "/#community", key: "nav.community" },
  { href: "/#how", key: "nav.how" },
  { href: "/support", key: "nav.support" },
];

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const lang = getPublicLang();
  return (
    <div className={`min-h-screen bg-tuji-bg text-tuji-ink${lang === "ja" ? " font-ja" : ""}`}>
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
          {/* lg, not md: five items at English label widths (~460px) plus the
              logo, language switcher and CTA overflow a 768px header. Every
              target here is also in the footer, so hiding it costs no reach. */}
          <nav className="hidden items-center gap-6 text-sm font-extrabold text-tuji-ink2 lg:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-tuji-teal">
                {mt(lang, item.key)}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitcher current={lang} />
            <Link
              href="/download"
              className="tuji-press rounded-xl bg-tuji-yellow px-4 py-2.5 text-sm font-extrabold text-tuji-ink"
              style={{ ["--press-shadow" as string]: "#d7a900" }}
            >
              {mt(lang, "cta.getApp")}
            </Link>
          </div>
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
                {mt(lang, "foot.tagline")}
              </p>
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/50">
                {mt(lang, "foot.product")}
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-white/80">
                <Link href="/#features" className="transition hover:text-tuji-yellow">
                  {mt(lang, "nav.features")}
                </Link>
                <Link href="/#atlas" className="transition hover:text-tuji-yellow">
                  {mt(lang, "nav.atlas")}
                </Link>
                <Link href="/#community" className="transition hover:text-tuji-yellow">
                  {mt(lang, "nav.community")}
                </Link>
                <Link href="/download" className="transition hover:text-tuji-yellow">
                  {mt(lang, "foot.iosApp")}
                </Link>
              </div>
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/50">
                {mt(lang, "foot.supportLegal")}
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-white/80">
                <Link href="/support" className="transition hover:text-tuji-yellow">
                  {mt(lang, "foot.supportCenter")}
                </Link>
                <Link href="/privacy" className="transition hover:text-tuji-yellow">
                  {mt(lang, "foot.privacy")}
                </Link>
                <Link href="/terms" className="transition hover:text-tuji-yellow">
                  {mt(lang, "foot.terms")}
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
