import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_TC, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TujiShell from "@/components/tuji/Shell";
import { WordsProvider } from "@/components/WordsProvider";
import { UserProvider } from "@/components/UserProvider";
import HydrateUserState from "@/components/HydrateUserState";
import { getAllWords } from "@/lib/data";
import { getCurrentUserBundle } from "@/lib/current-user";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
const notoTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-tc",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tuji · 圖鑑式學英文",
  description:
    "看得見的英文，記得住的單字。透過圖片、分類、發音、例句與測驗，學會生活英文。",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [words, bundle] = await Promise.all([
    getAllWords(),
    getCurrentUserBundle(),
  ]);
  return (
    <html
      lang="zh-Hant"
      className={`${jakarta.variable} ${notoTC.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-tuji-bg text-tuji-ink">
        <WordsProvider words={words}>
          <UserProvider user={bundle?.user ?? null}>
            {bundle && (
              <HydrateUserState
                favorites={bundle.favorites}
                learned={bundle.learned}
              />
            )}
            <TujiShell
              user={
                bundle
                  ? { username: bundle.user.username, email: bundle.user.email }
                  : null
              }
            >
              {children}
            </TujiShell>
          </UserProvider>
        </WordsProvider>
      </body>
    </html>
  );
}
