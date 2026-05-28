import Link from "next/link";
import Mascot from "@/components/tuji/Mascot";

const types = [
  { id: "image", title: "看圖選英文", en: "Image → English", desc: "看圖片，選出正確的英文單字。", emoji: "🖼️", bg: "#D4ECEC" },
  { id: "chinese", title: "看中文選英文", en: "Chinese → English", desc: "看中文意思，選出對應的英文。", emoji: "🈶", bg: "#FFF4D6" },
  { id: "spelling", title: "拼字練習", en: "Spelling", desc: "看中文與圖片，輸入正確的英文拼法。", emoji: "✍️", bg: "#FFCDD2" },
];

export default function QuizIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">小測驗</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">挑戰一回合 🎯</h1>
          <p className="mt-1 text-sm font-semibold text-tuji-ink3">選擇想練習的類型，每回合 10 題。</p>
        </div>
        <div className="hidden sm:block">
          <Mascot pose="wave" size={84} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {types.map((t) => (
          <Link
            key={t.id}
            href={`/quiz/${t.id}`}
            className="group relative overflow-hidden rounded-[20px] p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
            style={{ background: t.bg }}
          >
            <div className="text-4xl">{t.emoji}</div>
            <h2 className="mt-3 text-lg font-extrabold tracking-tight text-tuji-ink">{t.title}</h2>
            <p className="text-xs font-bold text-tuji-ink3">{t.en}</p>
            <p className="mt-2 text-sm text-tuji-ink2">{t.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-tuji-teal transition-all group-hover:gap-2">
              開始 →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
