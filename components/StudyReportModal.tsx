"use client";

import { useState } from "react";
import { useT } from "@/components/I18n";
import packageJson from "@/package.json";

export interface StudyReportContext {
  requestId: string;
  wordId: string;
  cardId: number;
  mode: "new" | "review";
  phase: string;
  selectedAnswer: string | null;
  uiLang: "zh-Hant" | "zh-Hans" | "ja";
  snapshot: Record<string, unknown>;
}

const ISSUE_TYPES = ["image", "content", "audio", "answer", "ui", "other"] as const;

export default function StudyReportModal({
  context,
  onClose,
}: {
  context: StudyReportContext;
  onClose: () => void;
}) {
  const t = useT();
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = Boolean(issueType && description.trim() && !submitting);

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/study/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...context,
          issueType,
          description: description.trim(),
          platform: "web",
          appVersion: packageJson.version,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "submit failed");
      setSubmitted(true);
    } catch {
      setError(t("study.report.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-tuji-ink/50 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-report-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="study-report-title" className="font-display text-2xl font-extrabold text-tuji-ink">
              {t("study.report.title")}
            </h2>
            <p className="mt-1 text-sm text-tuji-ink3">
              {String(context.snapshot.word ?? context.wordId)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("common.close")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-tuji-bg text-lg text-tuji-ink2 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="py-10 text-center">
            <div className="text-5xl">✓</div>
            <p className="mt-4 font-bold leading-relaxed text-tuji-ink">{t("study.report.success")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-2xl bg-tuji-teal px-6 py-3 font-bold text-white"
            >
              {t("common.done")}
            </button>
          </div>
        ) : (
          <>
            <fieldset className="mt-6">
              <legend className="font-bold text-tuji-ink">{t("study.report.question")}</legend>
              <div className="mt-3 grid gap-2">
                {ISSUE_TYPES.map((type) => (
                  <label
                    key={type}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      issueType === type
                        ? "border-tuji-teal bg-tuji-bg text-tuji-teal"
                        : "border-black/10 text-tuji-ink hover:bg-tuji-bg"
                    }`}
                  >
                    <input
                      type="radio"
                      name="issueType"
                      value={type}
                      checked={issueType === type}
                      onChange={() => setIssueType(type)}
                      className="accent-tuji-teal"
                    />
                    {t(`study.report.type.${type}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-6 block">
              <span className="font-bold text-tuji-ink">{t("study.report.detail")}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={5}
                className="mt-3 w-full resize-none rounded-2xl border border-black/10 bg-tuji-bg px-4 py-3 text-[15px] leading-relaxed text-tuji-ink outline-none focus:border-tuji-teal focus:ring-2 focus:ring-tuji-teal/15"
                placeholder={t("study.report.placeholder")}
              />
              <span className="mt-1 block text-right text-xs text-tuji-ink3">{description.length}/1000</span>
            </label>

            {error && <p className="mt-2 text-sm font-semibold text-tuji-coral">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-tuji-teal px-5 py-3.5 font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-35"
            >
              {submitting ? t("study.report.submitting") : t("study.report.submit")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
