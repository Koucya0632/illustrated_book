import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import Mascot from "@/components/tuji/Mascot";
import { safeNextPath } from "@/lib/safe-redirect";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "註冊 · Tuji" };

export default async function RegisterPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next, "/me");
  return (
    <div className="w-full max-w-md">
      <div className="rounded-[28px] bg-white p-7 shadow-card">
        <div className="flex items-center gap-3">
          <Mascot pose="cheer" size={48} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink">建立新帳號</h1>
            <p className="text-sm text-tuji-ink3">免費註冊，跨裝置同步收藏與進度。</p>
          </div>
        </div>

        <div className="mt-6">
          <GoogleButton next={next} label="用 Google 註冊" />
          <div className="my-4 flex items-center gap-3 text-xs font-semibold text-tuji-ink3">
            <span className="flex-1 border-t border-black/10" />
            <span>或用 email 註冊</span>
            <span className="flex-1 border-t border-black/10" />
          </div>
          <RegisterForm next={next} />
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-tuji-ink3">
        已經有帳號了？{" "}
        <Link href="/signin" className="font-extrabold text-tuji-teal hover:underline">
          登入
        </Link>
      </p>
    </div>
  );
}
