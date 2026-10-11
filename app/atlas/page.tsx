import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import CreditAtlasClient from "./CreditAtlasClient";
import { usesCreditBilling } from "@/lib/credits/legacy-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "自制圖鑑 · Tuji" };

export default async function AtlasPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/signin?next=/atlas");
  if (await usesCreditBilling(userId)) return <CreditAtlasClient key={userId} userId={userId} />;
  // 拍照新增 runs only on 罐頭點數 — there is no second flow to fall back to.
  // Cards a former member already made stay reviewable.
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-6 text-tuji-ink">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">自製圖鑑</h1>
        <Link href="/atlas/study">開始複習</Link>
      </header>
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <h2 className="font-bold">自製圖鑑是永久會員功能</h2>
        <p className="mt-2 text-sm text-tuji-ink3">在 Tuji App 成為永久會員後，就能拍照建立自己的卡片。</p>
      </section>
    </div>
  );
}
