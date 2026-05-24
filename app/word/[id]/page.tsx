import Link from "next/link";
import { notFound } from "next/navigation";
import FavoriteButton from "@/components/FavoriteButton";
import PronunciationButton from "@/components/PronunciationButton";
import { getCategory } from "@/lib/categories";
import { getAllWords, getWord } from "@/lib/data";
import MarkLearned from "./MarkLearned";
import EventTracker from "@/components/EventTracker";

export const revalidate = 60;

export async function generateStaticParams() {
  const all = await getAllWords();
  return all.map((w) => ({ id: w.id }));
}

export default async function WordDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const w = await getWord(params.id);
  if (!w) notFound();
  const cat = getCategory(w.category);

  const all = await getAllWords();
  const related = (w.relatedWords ?? [])
    .map((id) => all.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <MarkLearned id={w.id} />
      <EventTracker wordId={w.id} category={w.category} />

      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-ink">
          首頁
        </Link>{" "}
        /{" "}
        {cat && (
          <>
            <Link href={`/category/${cat.id}`} className="hover:text-ink">
              {cat.nameZh}
            </Link>{" "}
            /{" "}
          </>
        )}
        <span className="text-ink">{w.word}</span>
      </nav>

      <div className="mt-4 grid md:grid-cols-2 gap-6">
        <div className="rounded-xl2 overflow-hidden bg-white shadow-card aspect-[4/3] relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={w.imageUrl} alt={w.word} className="w-full h-full object-cover" />
          <div className="absolute top-3 right-3">
            <FavoriteButton id={w.id} size="lg" />
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-muted">
            {w.partOfSpeech}
          </span>
          <h1 className="mt-1 text-4xl sm:text-5xl font-bold text-ink">{w.word}</h1>
          {w.alsoKnownAs && w.alsoKnownAs.length > 0 && (
            <p className="mt-1 text-muted">
              又稱: <span className="font-medium text-ink">{w.alsoKnownAs.join(", ")}</span>
            </p>
          )}
          <p className="mt-2 text-2xl text-ink/80">{w.chinese}</p>

          <div className="mt-4 flex items-center gap-3">
            <span className="font-mono text-muted">{w.pronunciation}</span>
            <PronunciationButton text={w.word} size="lg" />
          </div>

          {w.note && (
            <p className="mt-4 text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
              💡 {w.note}
            </p>
          )}

          {w.collocations && w.collocations.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink">常見搭配詞</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {w.collocations.map((c) => (
                  <span
                    key={c}
                    className="px-3 py-1 rounded-full bg-mint-soft text-emerald-700 text-sm"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-ink">生活例句</h2>
        <ul className="mt-3 space-y-3">
          {w.examples.map((ex, i) => (
            <li
              key={i}
              className="rounded-xl2 bg-white shadow-soft px-4 sm:px-5 py-4 flex items-start gap-3"
            >
              <span className="shrink-0 mt-1">
                <PronunciationButton text={ex.en} size="sm" />
              </span>
              <div>
                <p className="text-ink text-lg leading-snug">{ex.en}</p>
                <p className="text-muted text-sm mt-1">{ex.zh}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {w.confusingWords && w.confusingWords.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-ink">容易混淆的詞</h2>
          <ul className="mt-3 space-y-3">
            {w.confusingWords.map((c) => (
              <li
                key={c.word}
                className="rounded-xl2 bg-amber-50 border border-amber-100 px-4 py-3"
              >
                <p className="font-semibold text-ink">{c.word}</p>
                <p className="text-sm text-amber-900/80 mt-0.5">{c.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-ink">相關單字</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/word/${r.id}`}
                className="rounded-xl bg-white shadow-soft hover:shadow-card px-3 py-3 flex items-center gap-3 transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.imageUrl}
                  alt={r.word}
                  className="w-12 h-12 rounded-lg object-cover bg-cream"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{r.word}</p>
                  <p className="text-xs text-muted truncate">{r.chinese}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
