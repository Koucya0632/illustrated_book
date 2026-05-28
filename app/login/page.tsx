import Mascot from "@/components/tuji/Mascot";
import { safeNextPath } from "@/lib/safe-redirect";
import LoginForm from "./LoginForm";

export const metadata = { title: "後台登入 · Tuji" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNextPath(searchParams.next, "/admin");
  return (
    <div className="w-full max-w-md">
      <div className="rounded-[28px] bg-white p-7 shadow-card">
        <div className="flex items-center gap-3">
          <Mascot pose="think" size={48} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink">後台登入</h1>
            <p className="text-sm text-tuji-ink3">
              輸入 <code className="rounded bg-tuji-bg px-1.5 py-0.5 font-mono text-xs">ADMIN_PASSWORD</code> 進入後台。
            </p>
          </div>
        </div>
        <div className="mt-6">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
