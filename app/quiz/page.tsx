import Link from "next/link";

const types = [
  {
    id: "image",
    title: "看圖選英文",
    en: "Image → English",
    desc: "看圖片，選出正確的英文單字。",
    emoji: "🖼️",
    color: "from-sky-soft to-white",
  },
  {
    id: "chinese",
    title: "看中文選英文",
    en: "Chinese → English",
    desc: "看中文意思，選出對應的英文。",
    emoji: "🈶",
    color: "from-mint-soft to-white",
  },
  {
    id: "spelling",
    title: "拼字練習",
    en: "Spelling",
    desc: "看中文與圖片，輸入正確的英文拼法。",
    emoji: "✍️",
    color: "from-amber-50 to-white",
  },
];

export default function QuizIndexPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">小測驗 🎯</h1>
      <p className="text-sm text-muted mt-1">選擇你想練習的類型，每回合 10 題。</p>

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        {types.map((t) => (
          <Link
            key={t.id}
            href={`/quiz/${t.id}`}
            className={`group rounded-xl2 p-5 bg-gradient-to-br ${t.color} shadow-card hover:shadow-lg transition`}
          >
            <div className="text-4xl">{t.emoji}</div>
            <h2 className="mt-3 text-lg font-bold text-ink">{t.title}</h2>
            <p className="text-xs text-muted">{t.en}</p>
            <p className="mt-2 text-sm text-ink/80">{t.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sky-accent group-hover:gap-2 transition-all">
              開始 →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
