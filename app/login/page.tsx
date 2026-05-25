import { safeNextPath } from "@/lib/safe-redirect";
import LoginForm from "./LoginForm";

export const metadata = { title: "Admin · Login" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNextPath(searchParams.next, "/admin");
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-ink">後台登入</h1>
      <p className="text-sm text-muted mt-1">
        輸入 <code className="font-mono">ADMIN_PASSWORD</code> 進入後台。
      </p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
