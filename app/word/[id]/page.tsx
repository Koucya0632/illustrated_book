import Link from "next/link";
import { notFound } from "next/navigation";
import FavoriteButton from "@/components/FavoriteButton";
import PronunciationButton from "@/components/PronunciationButton";
import { WordTile, scoreTier } from "@/components/tuji/ui";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getCurrentUserId } from "@/lib/current-user";
import { getLearningWord } from "@/lib/data";
import { applyDecay } from "@/lib/mastery";
import { getMasteryRow, getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { t } from "@/lib/i18n";
import MarkLearned from "./MarkLearned";
import EventTracker from "@/components/EventTracker";
import DefinitionTabs from "./DefinitionTabs";

// Dynamic so the page can render in the signed-in user's language + show their
// mastery. (It already read cookies for mastery, so it wasn't statically cached.)
export const dynamic = "force-dynamic";

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

function learningSentence(
  example: { target?: string; en: string },
  targetLanguage?: "en" | "ja",
): string {
  return example.target ?? (targetLanguage === "ja" ? "" : example.en);
}

export default async function WordDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getCurrentUserId();
  const settings = userId ? await getSettings(userId) : DEFAULT_SETTINGS;
  const lang = settings.uiLang;
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  const [w, cats] = await Promise.all([
    getLearningWord(params.id, lang, settings.learningDirection),
    getCategoriesFromDb(lang),
  ]);
  if (!w) notFound();
  const cat = cats.find((c) => c.id === w.category);

  // After localization, `definitions` carries only the chosen language. The
  // "other languages" panel below is reserved for definitions in OTHER
  // languages (e.g. ja shown when the user is viewing zh), which we don't
  // surface in this single-lang display path — keep it empty for now.
  const zhDefs = w.definitions;
  const otherDefs: typeof w.definitions = [];
  const headlineZh = zhDefs.length > 0 ? zhDefs.map((d) => d.definition).join("；") : w.chinese;

  let mastery: number | null = null;
  if (userId) {
    const row = await getMasteryRow(
      userId,
      w.id,
      settings.learningDirection === "zh-ja" ? "ja" : "en",
    );
    if (row) {
      mastery = applyDecay(row.mastery, row.last_reviewed_at ? new Date(row.last_reviewed_at) : null);
    }
  }
  const tier = mastery !== null ? scoreTier(mastery) : null;

  const tabs: { key: string; label: string; content: React.ReactNode }[] = [];
  if (w.chineseDefinition || w.targetDefinition) {
    tabs.push({
      key: "definitions",
      label: tr("word.tabDefinitions"),
      content: (
        <>
          {w.targetLanguage === "ja" && w.targetDefinition && (
            <div>
              <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-tuji-ink3">
                日本語
              </div>
              <div className="text-[14px] leading-relaxed text-tuji-ink">{w.targetDefinition}</div>
            </div>
          )}
          {w.chineseDefinition && (
            <div className={w.targetDefinition ? "mt-3" : ""}>
              <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-tuji-ink3">
                {tr("word.definitionLocal")}
              </div>
              <div className="text-[14px] leading-relaxed text-tuji-ink">{w.chineseDefinition}</div>
            </div>
          )}
          {w.targetLanguage !== "ja" && w.targetDefinition && (
            <div className={w.chineseDefinition ? "mt-3" : ""}>
              <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-tuji-ink3">
                {tr("word.definitionEnglish")}
              </div>
              <div className="text-[14px] leading-relaxed text-tuji-ink2">{w.targetDefinition}</div>
            </div>
          )}
        </>
      ),
    });
  }
  if (w.forms && w.forms.length > 0) {
    tabs.push({
      key: "forms",
      label: tr("word.forms"),
      content: (
        <div className="flex flex-wrap gap-2">
          {w.forms.map((f, i) => (
            <span key={i} className="rounded-full bg-tuji-bg px-3 py-1.5 text-xs text-tuji-ink2">
              <span className="font-bold text-tuji-ink3">{f.label}</span>
              <span className="mx-1 text-tuji-ink4">·</span>
              <span className="font-extrabold text-tuji-ink">{f.value}</span>
            </span>
          ))}
        </div>
      ),
    });
  }
  if (w.etymology) {
    tabs.push({
      key: "etymology",
      label: tr("word.etymology"),
      content: <div className="text-[14px] leading-relaxed text-tuji-ink2">{w.etymology}</div>,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <MarkLearned id={w.id} />
      <EventTracker wordId={w.id} category={w.category} />

      {/* Mastery progress bar */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
          <span>{tr("word.mastery")}</span>
          <span>{mastery !== null ? `${Math.round(mastery)}%` : tr("word.noRecord")}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-tuji-bg">
          {mastery !== null && tier && (
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(2, Math.round(mastery))}%`, backgroundColor: tier.color }}
            />
          )}
        </div>
      </div>

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
              <PronunciationButton text={w.word} audioUrls={w.audioUrls} size="lg" />
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
              <div className="mb-3 text-base font-extrabold tracking-tight text-tuji-ink">
                {tr("word.examplesTitle")}
              </div>
              <div className="flex flex-col gap-2.5">
                {w.examples.map((ex, i) => {
                  const sentence = learningSentence(ex, w.targetLanguage);
                  return (
                  <div key={i} className="flex items-center gap-3.5 rounded-[18px] bg-white px-4 py-3.5 shadow-soft">
                    <span className="shrink-0">
                      <PronunciationButton text={sentence} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-relaxed text-tuji-ink">
                        {highlight(sentence, w.word)}
                      </div>
                      {ex.zh && <div className="mt-0.5 text-[13px] text-tuji-ink3">{ex.zh}</div>}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: tabbed 譯義 / 詞形變化 / 來源故事 */}
        <div className="flex flex-col gap-4">
          <DefinitionTabs tabs={tabs} />
        </div>
      </div>

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
