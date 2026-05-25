import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import { safeNextPath } from "@/lib/safe-redirect";
import SigninForm from "./SigninForm";

export const metadata = { title: "登入 · Everyday English Picture Dictionary" };

export default function SigninPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNextPath(searchParams.next, "/me");
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">登入</h1>
      <p className="text-sm text-muted mt-1">用電子郵件登入。</p>

      {searchParams.error && (
        <p className="mt-4 text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">
          {searchParams.error}
        </p>
      )}

      <div className="mt-6">
        <GoogleButton next={next} label="用 Google 登入" />
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="flex-1 border-t border-black/10" />
          <span>或</span>
          <span className="flex-1 border-t border-black/10" />
        </div>
        <SigninForm next={next} />
      </div>

      <p className="mt-6 text-sm text-muted text-center">
        還沒有帳號？{" "}
        <Link href="/register" className="text-sky-accent hover:underline">
          建立一個
        </Link>
      </p>
    </div>
  );
}
