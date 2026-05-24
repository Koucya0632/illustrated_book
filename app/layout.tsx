import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { WordsProvider } from "@/components/WordsProvider";
import { UserProvider } from "@/components/UserProvider";
import HydrateUserState from "@/components/HydrateUserState";
import { getAllWords } from "@/lib/data";
import { getCurrentUserBundle } from "@/lib/current-user";

export const metadata: Metadata = {
  title: "Everyday English Picture Dictionary",
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
    <html lang="zh-Hant">
      <body className="min-h-screen flex flex-col">
        <WordsProvider words={words}>
          <UserProvider user={bundle?.user ?? null}>
            {bundle && (
              <HydrateUserState
                favorites={bundle.favorites}
                learned={bundle.learned}
              />
            )}
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </UserProvider>
        </WordsProvider>
      </body>
    </html>
  );
}
