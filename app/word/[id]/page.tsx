import Link from "next/link";
import { notFound } from "next/navigation";
import FavoriteButton from "@/components/FavoriteButton";
import MasteryBar from "@/components/MasteryBar";
import PronunciationButton from "@/components/PronunciationButton";
import { getCategory } from "@/lib/categories";
import { getCurrentUserId } from "@/lib/current-user";
import { getAllWords, getWord } from "@/lib/data";
import { applyDecay } from "@/lib/mastery";
import { getMasteryRow } from "@/lib/users-db";
import type { RelationType, Word, WordRelation } from "@/types";
import MarkLearned from "./MarkLearned";
import EventTracker from "@/components/EventTracker";

export const revalidate = 60;

export async function generateStaticParams() {
  const all = await getAllWords();
  return all.map((w) => ({ id: w.id }));
}

// Group relations by type and union both directions ("foo see-also bar"
// shown on `/word/bar` as well, so symmetry of synonyms / antonyms is visible
// without the admin having to enter the inverse).
const RELATION_GROUPS: { type: RelationType; label: string; tint: string }[] = [
  { type: "synonym",   label: "同義詞",       tint: "bg-sky-soft text-sky-accent" },
  { type: "antonym",   label: "反義詞",       tint: "bg-rose-50 text-rose-600" },
  { type: "hypernym",  label: "上位詞",       tint: "bg-purple-50 text-purple-700" },
  { type: "hyponym",   label: "下位詞",       tint: "bg-purple-50 text-purple-700" },
  { type: "confusing", label: "容易混淆",     tint: "bg-amber-50 text-amber-800 border border-amber-100" },
  { type: "see-also",  label: "相關單字",     tint: "bg-mint-soft text-emerald-700" },
];

function gatherRelations(
  current: Word,
  all: Word[],
): Map<RelationType, Array<{ wordId: string; word?: Word; note?: string }>> {
  const out = new Map<RelationType, Array<{ wordId: string; word?: Word; note?: string }>>();
  const push = (type: RelationType, wordId: string, note?: string) => {
    const list = out.get(type) ?? [];
    if (!list.some((x) => x.wordId === wordId)) {
      list.push({ wordId, word: all.find((x) => x.id === wordId), note });
    }
    out.set(type, list);
  };
  // Outgoing — the relations stored on this word.
  for (const r of current.relations) push(r.type, r.wordId, r.note);
  // Incoming — other words that point at us with a symmetric relation type.
  const symmetric: RelationType[] = ["synonym", "antonym", "confusing", "see-also"];
  for (const other of all) {
    if (other.id === current.id) continue;
    for (const r of other.relations) {
      if (r.wordId === current.id && symmetric.includes(r.type)) {
        push(r.type, other.id, r.note);
      }
    }
  }
  return out;
}

const CEFR_TINT: Record<string, string> = {
  A1: "bg-emerald-50 text-emerald-700 border-emerald-200",
  A2: "bg-emerald-50 text-emerald-700 border-emerald-200",
  B1: "bg-amber-50 text-amber-700 border-amber-200",
  B2: "bg-amber-50 text-amber-700 border-amber-200",
  C1: "bg-rose-50 text-rose-700 border-rose-200",
  C2: "bg-rose-50 text-rose-700 border-rose-200",
};

export default async function WordDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const w = await getWord(params.id);
  if (!w) notFound();
  const cat = getCategory(w.category);

  const all = await getAllWords();
  const groupedRelations = gatherRelations(w, all);

  // Definitions grouped by language so we can render zh prominently and any
  // other languages as collapsible secondary sections.
  const zhDefs = w.definitions.filter((d) => d.language === "zh");
  const otherDefs = w.definitions.filter((d) => d.language !== "zh");
  const headlineZh =
    zhDefs.length > 0 ? zhDefs.map((d) => d.definition).join("；") : w.chinese;

  // If logged in, show this user's mastery for the word.
  let mastery: number | null = null;
  const userId = await getCurrentUserId();
  if (userId) {
    const row = await getMasteryRow(userId, w.id);
    if (row) {
      mastery = applyDecay(
        row.mastery,
        row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
      );
    }
  }

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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wider text-muted">
              {w.partOfSpeech}
            </span>
            {w.cefrLevel && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${CEFR_TINT[w.cefrLevel] ?? "bg-cream text-ink border-black/10"}`}
                title={`CEFR ${w.cefrLevel}`}
              >
                {w.cefrLevel}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-4xl sm:text-5xl font-bold text-ink">{w.word}</h1>
          {w.alsoKnownAs && w.alsoKnownAs.length > 0 && (
            <p className="mt-1 text-muted">
              又稱: <span className="font-medium text-ink">{w.alsoKnownAs.join(", ")}</span>
            </p>
          )}
          <p className="mt-2 text-2xl text-ink/80">{headlineZh}</p>

          <div className="mt-4 flex items-center gap-3">
            <span className="font-mono text-muted">{w.pronunciation}</span>
            <PronunciationButton text={w.word} size="lg" />
          </div>

          {mastery !== null && (
            <div className="mt-4 max-w-xs">
              <MasteryBar score={mastery} size="md" />
            </div>
          )}

          {w.note && (
            <p className="mt-4 text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
              💡 {w.note}
            </p>
          )}

          {w.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {w.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full bg-cream text-muted text-xs"
                  title={`tag: ${t}`}
                >
                  #{t}
                </span>
              ))}
            </div>
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

      {otherDefs.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-ink">其他語言釋義</h2>
          <ul className="mt-3 space-y-2">
            {otherDefs.map((d, i) => (
              <li
                key={`${d.language}-${i}`}
                className="rounded-xl bg-white shadow-soft px-4 py-3 flex items-baseline gap-3"
              >
                <span className="text-xs uppercase tracking-wider text-muted shrink-0 w-12">
                  {d.language}
                </span>
                <span className="text-ink">{d.definition}</span>
                {d.cefrLevel && (
                  <span
                    className={`ml-auto text-xs font-semibold px-1.5 py-0.5 rounded border ${CEFR_TINT[d.cefrLevel] ?? "bg-cream text-ink border-black/10"}`}
                  >
                    {d.cefrLevel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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
              <div className="flex-1">
                <p className="text-ink text-lg leading-snug">{ex.en}</p>
                {ex.zh && <p className="text-muted text-sm mt-1">{ex.zh}</p>}
                {Object.entries(ex.translations)
                  .filter(([lang]) => lang !== "zh")
                  .map(([lang, text]) => (
                    <p key={lang} className="text-muted text-sm mt-1">
                      <span className="text-xs uppercase mr-1">{lang}</span>
                      {text}
                    </p>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {RELATION_GROUPS.map(({ type, label, tint }) => {
        const items = groupedRelations.get(type) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={type} className="mt-10">
            <h2 className="text-xl font-bold text-ink">{label}</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((item) => {
                const body = (
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink truncate">
                      {item.word ? item.word.word : item.wordId}
                    </p>
                    {item.word ? (
                      <p className="text-xs text-muted truncate">{item.word.chinese}</p>
                    ) : (
                      item.note && <p className="text-xs text-muted truncate">{item.note}</p>
                    )}
                    {item.word && item.note && (
                      <p className="text-xs text-muted mt-0.5">{item.note}</p>
                    )}
                  </div>
                );
                const inner = item.word ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.word.imageUrl}
                      alt={item.word.word}
                      className="w-12 h-12 rounded-lg object-cover bg-cream shrink-0"
                      loading="lazy"
                      decoding="async"
                    />
                    {body}
                  </>
                ) : (
                  <div className="flex-1">{body}</div>
                );
                return item.word ? (
                  <Link
                    key={`${type}-${item.wordId}`}
                    href={`/word/${item.word.id}`}
                    className={`rounded-xl px-3 py-3 flex items-center gap-3 transition hover:shadow-card shadow-soft bg-white`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={`${type}-${item.wordId}`}
                    className={`rounded-xl px-3 py-3 flex items-center gap-3 ${tint}`}
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
