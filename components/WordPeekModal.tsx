"use client";

import { useEffect, useState } from "react";
import { WordTile } from "@/components/tuji/ui";
import PronunciationButton from "@/components/PronunciationButton";
import { useT } from "@/components/I18n";
import type { Word } from "@/types";

// Compact "peek" at a word's key content, opened after answering a study card
// (so the user doesn't have to leave the session). Full detail still one tap
// away via the footer link. Fetches through /api/words/[id] because getWord is
// server-only.
export default function WordPeekModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const [word, setWord] = useState<Word | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/words/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => {
        if (alive) setWord(w);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const examples = word?.examples?.slice(0, 2) ?? [];
  const synonyms = word?.relations?.filter((r) => r.type === "synonym").map((r) => r.wordId) ?? [];
  const antonyms = word?.relations?.filter((r) => r.type === "antonym").map((r) => r.wordId) ?? [];
  const forms = word?.forms ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-tuji-bg p-5 shadow-cardHover sm:rounded-[24px]"
      >
        <div className="mb-3 flex justify-end">
          <button
            onClick={onClose}
            aria-label={t("common.back")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-lg text-tuji-ink shadow-soft"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-tuji-ink3">{t("common.loading")}</div>
        ) : !word ? (
          <div className="py-16 text-center text-sm text-tuji-ink3">—</div>
        ) : (
          <>
            <div className="rounded-[20px] bg-white p-4 shadow-card">
              <WordTile imageUrl={word.imageUrl} word={word.word} height={170} rounded={16} />
              <div className="mt-3 flex items-center gap-3">
                <PronunciationButton text={word.word} size="lg" />
                <div className="min-w-0">
                  <div className="text-2xl font-extrabold tracking-tight text-tuji-ink">{word.word}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-tuji-ink2">{word.pronunciation || "—"}</span>
                    {word.partOfSpeech && (
                      <span className="rounded-full bg-tuji-tealS px-2 py-0.5 text-[11px] font-extrabold text-tuji-teal">
                        {word.partOfSpeech}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {word.chinese && <div className="mt-2.5 text-[15px] font-bold text-tuji-ink2">{word.chinese}</div>}
              {word.alsoKnownAs && word.alsoKnownAs.length > 0 && (
                <div className="mt-1 text-xs text-tuji-ink3">
                  {t("word.alsoKnownAs")}: {word.alsoKnownAs.join(" / ")}
                </div>
              )}
            </div>

            {examples.length > 0 && (
              <div className="mt-3 rounded-[20px] bg-white p-4 shadow-card">
                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-tuji-ink3">
                  {t("word.examplesTitle")}
                </div>
                <ul className="flex flex-col gap-2.5">
                  {examples.map((ex, i) => (
                    <li key={i}>
                      <div className="text-sm font-semibold text-tuji-ink">{ex.en}</div>
                      {ex.zh && <div className="text-xs text-tuji-ink3">{ex.zh}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(synonyms.length > 0 || antonyms.length > 0) && (
              <div className="mt-3 rounded-[20px] bg-white p-4 shadow-card">
                {synonyms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs font-extrabold text-tuji-ink3">{t("word.rel.synonym")}</span>
                    {synonyms.map((s, i) => (
                      <span key={i} className="rounded-full bg-tuji-tealS px-2.5 py-1 text-xs font-bold text-tuji-teal">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {antonyms.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs font-extrabold text-tuji-ink3">{t("word.rel.antonym")}</span>
                    {antonyms.map((s, i) => (
                      <span key={i} className="rounded-full bg-tuji-bg px-2.5 py-1 text-xs font-bold text-tuji-ink2">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {forms.length > 0 && (
              <div className="mt-3 rounded-[20px] bg-white p-4 shadow-card">
                <div className="mb-2 text-xs font-extrabold text-tuji-ink3">{t("word.forms")}</div>
                <div className="flex flex-wrap gap-2">
                  {forms.map((f, i) => (
                    <span key={i} className="rounded-full bg-tuji-bg px-2.5 py-1 text-xs text-tuji-ink2">
                      <span className="font-bold text-tuji-ink3">{f.label}</span>
                      <span className="mx-1 text-tuji-ink4">·</span>
                      <span className="font-extrabold text-tuji-ink">{f.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {word.etymology && (
              <div className="mt-3 rounded-[20px] bg-white p-4 shadow-card">
                <div className="mb-1 text-xs font-extrabold text-tuji-ink3">{t("word.etymology")}</div>
                <div className="text-[13px] leading-relaxed text-tuji-ink2">{word.etymology}</div>
              </div>
            )}

            {word.note && (
              <div className="mt-3 rounded-[20px] bg-tuji-yellow/25 p-4">
                <div className="mb-1 text-xs font-extrabold text-tuji-ink2">💡 {t("word.mnemonic")}</div>
                <div className="text-sm text-tuji-ink2">{word.note}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
