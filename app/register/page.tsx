import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "註冊 · Everyday English Picture Dictionary" };

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/me";
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">建立新帳號</h1>
      <p className="text-sm text-muted mt-1">
        免費註冊，跨裝置同步你的收藏與學習進度。
      </p>

      <div className="mt-6">
        <GoogleButton next={next} label="用 Google 註冊" />
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="flex-1 border-t border-black/10" />
          <span>或用 email 註冊</span>
          <span className="flex-1 border-t border-black/10" />
        </div>
        <RegisterForm next={next} />
      </div>

      <p className="mt-6 text-sm text-muted text-center">
        已經有帳號了？{" "}
        <Link href="/signin" className="text-sky-accent hover:underline">
          登入
        </Link>
      </p>
    </div>
  );
}
