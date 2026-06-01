import Link from "next/link";
import { notFound } from "next/navigation";
import FavoriteButton from "@/components/FavoriteButton";
import PronunciationButton from "@/components/PronunciationButton";
import Mascot from "@/components/tuji/Mascot";
import { WordTile, ProfRing, scoreTier } from "@/components/tuji/ui";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getCurrentUserId } from "@/lib/current-user";
import { getAllWords, getWord } from "@/lib/data";
import { applyDecay } from "@/lib/mastery";
import { getMasteryRow, getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { t } from "@/lib/i18n";
import type { RelationType, Word } from "@/types";
import MarkLearned from "./MarkLearned";
import EventTracker from "@/components/EventTracker";

// Dynamic so the page can render in the signed-in user's language + show their
// mastery. (It already read cookies for mastery, so it wasn't statically cached.)
export const dynamic = "force-dynamic";

const RELATION_GROUPS: { type: RelationType; labelKey: string }[] = [
  { type: "synonym", labelKey: "word.rel.synonym" },
  { type: "antonym", labelKey: "word.rel.antonym" },
  { type: "hypernym", labelKey: "word.rel.hypernym" },
  { type: "hyponym", labelKey: "word.rel.hyponym" },
  { type: "confusing", labelKey: "word.rel.confusing" },
  { type: "see-also", labelKey: "word.rel.seeAlso" },
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
  for (const r of current.relations) push(r.type, r.wordId, r.note);
  const symmetric: RelationType[] = ["synonym", "antonym", "confusing", "see-also"];
  for (const other of all) {
    if (other.id === current.id) continue;
    for (const r of other.relations) {
      if (r.wordId === current.id && symmetric.includes(r.type)) push(r.type, other.id, r.note);
    }
  }
  return out;
}

// Highlight occurrences of `term` inside a sentence with a yellow chip.
function highlight(sentence: string, term: string) {
  if (!term) return sentence;
  const parts = sentence.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <span key={i} className="rounded bg-tuji-yellow px-1.5 font-extrabold text-tuji-ink">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default async function WordDetailPage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const settings = userId ? await getSettings(userId) : DEFAULT_SETTINGS;
  const lang = settings.uiLang;
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  const [w, all, cats] = await Promise.all([
    getWord(params.id, lang),
    getAllWords(lang),
    getCategoriesFromDb(lang),
  ]);
  if (!w) notFound();
  const cat = cats.find((c) => c.id === w.category);
  const groupedRelations = gatherRelations(w, all);
  const sameCategory = all.filter((x) => x.id !== w.id && x.category === w.category).slice(0, 4);

  // After localization, `definitions` carries only the chosen language. The
  // "other languages" panel below is reserved for definitions in OTHER
  // languages (e.g. ja shown when the user is viewing zh), which we don't
  // surface in this single-lang display path — keep it empty for now.
  const zhDefs = w.definitions;
  const otherDefs: typeof w.definitions = [];
  const headlineZh = zhDefs.length > 0 ? zhDefs.map((d) => d.definition).join("；") : w.chinese;

  let mastery: number | null = null;
  if (userId) {
    const row = await getMasteryRow(userId, w.id);
    if (row) {
      mastery = applyDecay(row.mastery, row.last_reviewed_at ? new Date(row.last_reviewed_at) : null);
    }
  }
  const tier = mastery !== null ? scoreTier(mastery) : null;
  // Localized mastery tier label (thresholds match scoreTier).
  const tierKey =
    mastery === null ? null : mastery >= 70 ? "word.tierMastered" : mastery >= 40 ? "word.tierLearning" : "word.tierWeak";

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <MarkLearned id={w.id} />
      <EventTracker wordId={w.id} category={w.category} />

      {/* Breadcrumb + actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-tuji-ink3">
        <Link href="/cards" className="hover:text-tuji-ink">
          {tr("nav.cards")}
        </Link>
        <span>›</span>
        {cat && (
          <>
            <Link href={`/category/${cat.id}`} className="hover:text-tuji-ink">
              {cat.nameZh}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="font-extrabold text-tuji-ink">{w.word}</span>
        <div className="ml-auto flex items-center gap-2">
          <FavoriteButton id={w.id} size="md" />
          <Link
            href="/study"
            className="rounded-xl bg-tuji-teal px-3.5 py-2 text-[13px] font-extrabold text-white shadow-soft"
          >
            {tr("word.practiceNow")}
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <div className="relative rounded-[28px] bg-white p-4 shadow-cardHover">
            {cat && (
              <span className="absolute right-6 top-6 z-10 rounded-full bg-tuji-tealS px-3 py-1.5 text-[11px] font-extrabold tracking-[0.08em] text-tuji-teal">
                {cat.name.toUpperCase()} · {cat.nameZh}
              </span>
            )}
            <WordTile imageUrl={w.imageUrl} word={w.word} height={300} rounded={20} />
            <div className="flex items-end justify-between px-1.5 pt-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-tuji-ink sm:text-5xl">
                    {w.word}
                  </h1>
                  {w.cefrLevel && (
                    <span className="rounded-md border border-tuji-ink/10 bg-tuji-bg px-1.5 py-0.5 text-xs font-bold text-tuji-ink2">
                      {w.cefrLevel}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3.5">
                  <span className="font-mono text-base text-tuji-ink2">{w.pronunciation}</span>
                  <span className="text-[13px] italic text-tuji-ink3">{w.partOfSpeech}</span>
                </div>
                <div className="mt-2 text-lg font-bold text-tuji-ink">{headlineZh}</div>
                {w.alsoKnownAs && w.alsoKnownAs.length > 0 && (
                  <div className="mt-1 text-xs text-tuji-ink3">
                    {tr("word.alsoKnownAs")}：<span className="font-semibold text-tuji-ink2">{w.alsoKnownAs.join(", ")}</span>
                  </div>
                )}
              </div>
              <PronunciationButton text={w.word} size="lg" />
            </div>

            {w.collocations && w.collocations.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 px-1.5">
                {w.collocations.map((c) => (
                  <span key={c} className="rounded-full bg-tuji-tealS px-3 py-1 text-sm font-semibold text-tuji-teal">
                    {c}
                  </span>
                ))}
              </div>
            )}
            {w.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 px-1.5">
                {w.tags.map((t) => (
                  <span key={t} className="rounded-full bg-tuji-bg px-2 py-0.5 text-xs text-tuji-ink3">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Examples */}
          {w.examples.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <Mascot pose="wave" size={36} />
                <span className="text-base font-extrabold tracking-tight text-tuji-ink">{tr("word.examplesTitle")}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {w.examples.map((ex, i) => (
                  <div key={i} className="flex items-center gap-3.5 rounded-[18px] bg-white px-4 py-3.5 shadow-soft">
                    <span className="shrink-0">
                      <PronunciationButton text={ex.en} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-relaxed text-tuji-ink">
                        {highlight(ex.en, w.word)}
                      </div>
                      {ex.zh && <div className="mt-0.5 text-[13px] text-tuji-ink3">{ex.zh}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Mastery card (dark) */}
          <div className="relative overflow-hidden rounded-[22px] bg-tuji-ink p-5 text-white">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/65">{tr("word.mastery")}</div>
            {mastery !== null && tier && tierKey ? (
              <div className="mt-3.5 flex items-center gap-4">
                <ProfRing
                  value={mastery}
                  size={84}
                  stroke={8}
                  color={tier.color}
                  track="rgba(255,255,255,.15)"
                  label={<span className="text-white">{Math.round(mastery)}%</span>}
                />
                <div className="flex-1">
                  <div className="text-base font-extrabold">{tr(tierKey)}</div>
                  <div className="mt-1 text-xs text-white/70">{tr("word.masteryDecay")}</div>
                </div>
              </div>
            ) : (
              <div className="mt-3.5 flex items-center gap-4">
                <Mascot pose="think" size={64} />
                <div className="flex-1">
                  <div className="text-sm font-bold">{tr("word.noRecord")}</div>
                </div>
              </div>
            )}
          </div>

          {/* Mnemonic / note */}
          {w.note && (
            <div className="flex items-start gap-3 rounded-[22px] bg-white p-4 shadow-soft">
              <Mascot pose="think" size={48} />
              <div>
                <div className="mb-1 text-[13px] font-extrabold text-tuji-ink">{tr("word.mnemonic")}</div>
                <div className="text-[13px] leading-relaxed text-tuji-ink2">{w.note}</div>
              </div>
            </div>
          )}

          {/* Word forms (詞形變化) */}
          {w.forms && w.forms.length > 0 && (
            <div className="rounded-[22px] bg-white p-4 shadow-soft">
              <div className="mb-2 text-[13px] font-extrabold text-tuji-ink">{tr("word.forms")}</div>
              <div className="flex flex-wrap gap-2">
                {w.forms.map((f, i) => (
                  <span key={i} className="rounded-full bg-tuji-bg px-3 py-1.5 text-xs text-tuji-ink2">
                    <span className="font-bold text-tuji-ink3">{f.label}</span>
                    <span className="mx-1 text-tuji-ink4">·</span>
                    <span className="font-extrabold text-tuji-ink">{f.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Etymology (詞源) */}
          {w.etymology && (
            <div className="rounded-[22px] bg-white p-4 shadow-soft">
              <div className="mb-1 text-[13px] font-extrabold text-tuji-ink">{tr("word.etymology")}</div>
              <div className="text-[13px] leading-relaxed text-tuji-ink2">{w.etymology}</div>
            </div>
          )}

          {/* Same theme */}
          {sameCategory.length > 0 && (
            <div>
              <div className="mb-2.5 text-[13px] font-extrabold text-tuji-ink">{tr("word.sameTheme")}</div>
              <div className="grid grid-cols-2 gap-2.5">
                {sameCategory.map((rw) => (
                  <Link key={rw.id} href={`/word/${rw.id}`} className="rounded-[14px] bg-white p-2.5 shadow-soft transition hover:shadow-card">
                    <WordTile imageUrl={rw.imageUrl} word={rw.word} height={70} rounded={10} />
                    <div className="mt-2 text-[13px] font-extrabold text-tuji-ink">{rw.word}</div>
                    <div className="text-[11px] text-tuji-ink3">{rw.chinese}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Typed relations */}
      {RELATION_GROUPS.map(({ type, labelKey }) => {
        const items = groupedRelations.get(type) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={type} className="mt-8">
            <h2 className="mb-3 text-base font-extrabold tracking-tight text-tuji-ink">{tr(labelKey)}</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) =>
                item.word ? (
                  <Link
                    key={`${type}-${item.wordId}`}
                    href={`/word/${item.word.id}`}
                    className="flex items-center gap-3 rounded-[14px] bg-white px-3 py-3 shadow-soft transition hover:shadow-card"
                  >
                    <div className="w-12 shrink-0">
                      <WordTile imageUrl={item.word.imageUrl} word={item.word.word} height={48} rounded={10} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-tuji-ink">{item.word.word}</p>
                      <p className="truncate text-xs text-tuji-ink3">{item.word.chinese}</p>
                      {item.note && <p className="mt-0.5 truncate text-xs text-tuji-ink3">{item.note}</p>}
                    </div>
                  </Link>
                ) : (
                  <div key={`${type}-${item.wordId}`} className="rounded-[14px] bg-tuji-bg px-3 py-3 text-sm text-tuji-ink2 shadow-soft">
                    <p className="font-bold">{item.wordId}</p>
                    {item.note && <p className="mt-0.5 text-xs text-tuji-ink3">{item.note}</p>}
                  </div>
                ),
              )}
            </div>
          </section>
        );
      })}

      {/* Other-language definitions */}
      {otherDefs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-extrabold tracking-tight text-tuji-ink">{tr("word.otherDefs")}</h2>
          <ul className="flex flex-col gap-2">
            {otherDefs.map((d, i) => (
              <li key={`${d.language}-${i}`} className="flex items-baseline gap-3 rounded-[14px] bg-white px-4 py-3 shadow-soft">
                <span className="w-10 shrink-0 text-xs font-extrabold uppercase tracking-wider text-tuji-ink3">
                  {d.language}
                </span>
                <span className="text-tuji-ink">{d.definition}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
