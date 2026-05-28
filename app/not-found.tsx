import Link from "next/link";
import Mascot from "@/components/tuji/Mascot";
import { shade, TUJI } from "@/components/tuji/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <Mascot pose="sleep" size={120} className="mx-auto" />
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-tuji-ink">找不到這個頁面</h1>
      <p className="mt-2 text-tuji-ink3">這個單字或分類可能還沒有收錄。</p>
      <Link
        href="/"
        className="tuji-press mt-6 inline-block rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white"
        style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
      >
        回今天
      </Link>
    </div>
  );
}
