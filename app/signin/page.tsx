import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import Mascot from "@/components/tuji/Mascot";
import { safeNextPath } from "@/lib/safe-redirect";
import SigninForm from "./SigninForm";

export const metadata = { title: "登入 · Tuji" };

export default function SigninPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNextPath(searchParams.next, "/me");
  return (
    <div className="w-full max-w-md">
      <div className="rounded-[28px] bg-white p-7 shadow-card">
        <div className="flex items-center gap-3">
          <Mascot pose="wave" size={48} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink">歡迎回來</h1>
            <p className="text-sm text-tuji-ink3">用電子郵件登入，繼續你的圖鑑。</p>
          </div>
        </div>

        {searchParams.error && (
          <p className="mt-4 rounded-xl bg-tuji-coral/10 px-3 py-2 text-sm font-semibold text-tuji-coral">
            {searchParams.error}
          </p>
        )}

        <div className="mt-6">
          <GoogleButton next={next} label="用 Google 登入" />
          <div className="my-4 flex items-center gap-3 text-xs font-semibold text-tuji-ink3">
            <span className="flex-1 border-t border-black/10" />
            <span>或</span>
            <span className="flex-1 border-t border-black/10" />
          </div>
          <SigninForm next={next} />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-tuji-ink3">
        還沒有帳號？{" "}
        <Link href="/register" className="font-extrabold text-tuji-teal hover:underline">
          建立一個
        </Link>
      </p>
    </div>
  );
}
