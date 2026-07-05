import Mascot from "@/components/tuji/Mascot";

export const metadata = { title: "信箱驗證完成 · Tuji" };

export default function EmailConfirmedPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-5 py-10">
      <section className="w-full rounded-[28px] bg-white p-7 text-center shadow-card">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-tuji-tealS">
          <Mascot pose="cheer" size={58} />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-tuji-ink">
          信箱驗證完成
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-tuji-ink3">
          你的 Tuji 帳號已完成驗證。請回到 Tuji App，使用剛剛註冊的 Email 和密碼登入。
        </p>
      </section>
    </main>
  );
}
