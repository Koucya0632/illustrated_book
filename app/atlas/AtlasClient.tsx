"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WordTile, TUJI } from "@/components/tuji/ui";

interface AtlasImage {
  id: string;
  status: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  imageUrl: string;
  thumbUrl: string;
}

interface CandidateRow {
  id: string;
  level: "primary" | "fine" | "attribute";
  label: string;
  normalized_label: string;
  zh_hant: string | null;
  confidence: number;
  rank: number;
}

interface AtlasItem {
  id: string;
  lemma: string;
  display_zh_hant: string;
  primary_label: string;
  fine_label: string | null;
  target_language: "en" | "ja";
}

const EMPTY_FORM = {
  primaryLabel: "",
  fineLabel: "",
  lemma: "",
  displayZhHant: "",
  partOfSpeech: "noun",
  category: "",
};

function confidencePct(value: number): string {
  return `${Math.round(Number(value) * 100)}%`;
}

export default function AtlasClient() {
  const [images, setImages] = useState<AtlasImage[]>([]);
  const [selected, setSelected] = useState<AtlasImage | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createdItem, setCreatedItem] = useState<AtlasItem | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadImages() {
    setError(null);
    const res = await fetch("/api/atlas/images", { cache: "no-store" });
    if (!res.ok) {
      setError("讀取自制圖鑑失敗");
      return;
    }
    const data = await res.json();
    setImages(data.images ?? []);
    setSelected((current) => current ?? data.images?.[0] ?? null);
  }

  useEffect(() => {
    loadImages().catch(() => setError("讀取自制圖鑑失敗"));
  }, []);

  const primaryCandidates = useMemo(
    () => candidates.filter((c) => c.level === "primary"),
    [candidates],
  );
  const fineCandidates = useMemo(
    () => candidates.filter((c) => c.level === "fine"),
    [candidates],
  );

  async function upload(file: File) {
    setBusy("upload");
    setError(null);
    setCandidates([]);
    setCreatedItem(null);
    setPublishStatus(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/atlas/images", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上傳失敗");
      setSelected(data.image);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setBusy(null);
    }
  }

  async function recognize(mode: "primary" | "fine" | "escalate" = "primary") {
    if (!selected) return;
    setBusy(mode === "primary" ? "recognize" : mode);
    setError(null);
      setCreatedItem(null);
      setPublishStatus(null);
    try {
      const res = await fetch(`/api/atlas/images/${selected.id}/recognize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "辨識失敗");
      const rows = data.candidates ?? [];
      setCandidates(rows);
      const best = rows.find((c: CandidateRow) => c.level === "fine") ?? rows[0];
      if (best) applyCandidate(best);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "辨識失敗");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    if (!selected || busy) return;
    if (!window.confirm("確定要刪除這張圖鑑圖片與相關卡片、複習紀錄嗎？")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/atlas/images/${selected.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "刪除失敗");
      setSelected(null);
      setCandidates([]);
      setCreatedItem(null);
      setPublishStatus(null);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setBusy(null);
    }
  }

  function applyCandidate(candidate: CandidateRow) {
    setSelectedCandidateId(candidate.id);
    setForm((prev) => ({
      ...prev,
      primaryLabel: candidate.level === "primary" ? candidate.label : prev.primaryLabel || candidate.label,
      fineLabel: candidate.level === "fine" ? candidate.label : prev.fineLabel,
      lemma: candidate.label,
      displayZhHant: candidate.zh_hant || prev.displayZhHant || candidate.label,
    }));
  }

  async function confirmAndCreateCards() {
    if (!selected) return;
    setBusy("confirm");
    setError(null);
    try {
      const confirmRes = await fetch(`/api/atlas/images/${selected.id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, selectedCandidateId }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "校正失敗");
      const item = confirmData.item as AtlasItem;
      const cardsRes = await fetch(`/api/atlas/items/${item.id}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardTypes: ["image_recall", "flashcard"] }),
      });
      const cardsData = await cardsRes.json();
      if (!cardsRes.ok) throw new Error(cardsData.error || "生成卡片失敗");
      setCreatedItem(item);
      setPublishStatus(null);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "校正或生成卡片失敗");
    } finally {
      setBusy(null);
    }
  }

  async function submitPublicReview() {
    if (!createdItem) return;
    setBusy("publish");
    setError(null);
    try {
      const res = await fetch(`/api/atlas/items/${createdItem.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送審失敗");
      setPublishStatus("已送出公開圖鑑審核");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送審失敗");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            Custom Atlas
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">
            自制圖鑑
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/atlas/friends"
            className="inline-flex items-center justify-center rounded-2xl bg-tuji-pink px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-soft transition hover:-translate-y-0.5"
          >
            朋友圖鑑
          </Link>
          <Link
            href="/atlas/public"
            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-soft transition hover:-translate-y-0.5"
          >
            公開圖鑑
          </Link>
          <Link
            href="/atlas/study"
            className="inline-flex items-center justify-center rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            開始複習
          </Link>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-[18px] bg-[#FBE6E1] px-4 py-3 text-sm font-bold text-tuji-coral">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-[18px] bg-white p-4 shadow-soft">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-tuji-tealS bg-tuji-bg px-4 py-8 text-center transition hover:bg-white">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy === "upload"}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) upload(file);
              }}
            />
            <span className="text-3xl">＋</span>
            <span className="mt-2 text-sm font-extrabold text-tuji-ink">
              {busy === "upload" ? "上傳中..." : "上傳圖片"}
            </span>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {images.map((image) => (
              <button
                key={image.id}
                onClick={() => {
                  setSelected(image);
                  setCandidates([]);
                  setCreatedItem(null);
                }}
                className={`rounded-[14px] p-1 text-left transition ${
                  selected?.id === image.id ? "bg-tuji-tealS" : "bg-tuji-bg hover:bg-white"
                }`}
              >
                <WordTile imageUrl={image.thumbUrl} word="atlas" height={92} rounded={12} />
                <div className="mt-1 truncate px-1 text-[11px] font-bold text-tuji-ink3">
                  {image.status}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-[18px] bg-white p-4 shadow-soft sm:p-5">
          {!selected ? (
            <div className="flex min-h-[360px] items-center justify-center text-sm font-bold text-tuji-ink3">
              先上傳一張想學的圖片
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(240px,420px)_1fr]">
              <div>
                <WordTile imageUrl={selected.imageUrl} word="atlas" height={360} rounded={18} fit="contain" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => recognize("primary")}
                    disabled={Boolean(busy)}
                    className="rounded-2xl bg-tuji-yellow px-4 py-2.5 text-sm font-extrabold text-tuji-ink disabled:opacity-50"
                  >
                    {busy === "recognize" ? "辨識中..." : "AI 識別"}
                  </button>
                  <button
                    onClick={() => recognize("fine")}
                    disabled={Boolean(busy)}
                    className="rounded-2xl bg-tuji-tealS px-4 py-2.5 text-sm font-extrabold text-tuji-teal disabled:opacity-50"
                  >
                    細分類
                  </button>
                  <button
                    onClick={() => recognize("escalate")}
                    disabled={Boolean(busy)}
                    className="rounded-2xl bg-tuji-ink px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    高精度
                  </button>
                  <button
                    onClick={deleteSelected}
                    disabled={Boolean(busy)}
                    className="rounded-2xl bg-[#FBE6E1] px-4 py-2.5 text-sm font-extrabold text-tuji-coral disabled:opacity-50"
                  >
                    {busy === "delete" ? "刪除中..." : "刪除"}
                  </button>
                </div>
              </div>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-tuji-ink">候選與校正</h2>
                  <span className="rounded-full bg-tuji-bg px-3 py-1 text-[11px] font-extrabold text-tuji-ink3">
                    {selected.status}
                  </span>
                </div>

                <CandidateList title="主要類別" rows={primaryCandidates} onPick={applyCandidate} />
                <CandidateList title="細分類" rows={fineCandidates} onPick={applyCandidate} />

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="主要單字" value={form.primaryLabel} onChange={(v) => setForm((f) => ({ ...f, primaryLabel: v }))} />
                  <Field label="細分類" value={form.fineLabel} onChange={(v) => setForm((f) => ({ ...f, fineLabel: v }))} />
                  <Field label="卡片答案" value={form.lemma} onChange={(v) => setForm((f) => ({ ...f, lemma: v }))} />
                  <Field label="中文名稱" value={form.displayZhHant} onChange={(v) => setForm((f) => ({ ...f, displayZhHant: v }))} />
                  <Field label="詞性" value={form.partOfSpeech} onChange={(v) => setForm((f) => ({ ...f, partOfSpeech: v }))} />
                  <Field label="分類" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
                </div>

                <button
                  onClick={confirmAndCreateCards}
                  disabled={Boolean(busy) || !form.lemma.trim() || !form.displayZhHant.trim()}
                  className="mt-4 w-full rounded-2xl bg-tuji-coral px-5 py-3 text-sm font-extrabold text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover disabled:opacity-50"
                >
                  {busy === "confirm" ? "生成中..." : "確認並生成卡片"}
                </button>

                {createdItem && (
                  <div className="mt-4 rounded-[16px] bg-[#E8F5EC] p-4 text-sm font-bold text-[#2F7D4A]">
                    <div>
                      已建立 {createdItem.lemma} 的學習卡片。
                      <Link href="/atlas/study" className="ml-2 underline">
                        去複習
                      </Link>
                    </div>
                    <button
                      onClick={submitPublicReview}
                      disabled={busy === "publish" || Boolean(publishStatus)}
                      className="mt-3 rounded-2xl bg-white px-4 py-2 text-xs font-extrabold text-[#2F7D4A] shadow-soft disabled:opacity-50"
                    >
                      {publishStatus ?? (busy === "publish" ? "送審中..." : "送公開圖鑑審核")}
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CandidateList({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: CandidateRow[];
  onPick: (row: CandidateRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-2 text-xs font-extrabold text-tuji-ink3">{title}</div>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <button
            key={row.id}
            onClick={() => onPick(row)}
            className="rounded-full bg-tuji-bg px-3 py-2 text-xs font-extrabold text-tuji-ink transition hover:bg-tuji-tealS"
          >
            {row.label}
            {row.zh_hant ? ` · ${row.zh_hant}` : ""} · {confidencePct(row.confidence)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-extrabold text-tuji-ink3">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="w-full rounded-2xl border border-black/5 bg-tuji-bg px-3 py-2.5 text-sm font-bold text-tuji-ink outline-none focus:border-tuji-teal"
      />
    </label>
  );
}
