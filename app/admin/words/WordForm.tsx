"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { categories } from "@/lib/categories";
import type { CategoryId, ConfusingWord, Example, Word } from "@/types";

type Mode = "create" | "edit";

// Phase 2b will replace this form with new-field repeaters (CEFR, status,
// tags, definitions, typed relations). For now the form still edits the
// legacy fields (chinese, examples.zh, relatedWords, confusingWords) and
// we synthesize the v2 sub-arrays at save time.
function makeExample(en = "", zh = "", sortOrder = 0): Example {
  return { en, zh, translations: { zh }, sortOrder };
}

const empty: Word = {
  id: "",
  word: "",
  alsoKnownAs: [],
  category: "kitchen" as CategoryId,
  partOfSpeech: "noun",
  pronunciation: "",
  imageUrl: "",
  status: "published",
  definitions: [{ language: "zh", definition: "", sortOrder: 0 }],
  chinese: "",
  collocations: [],
  examples: [makeExample()],
  tags: [],
  relations: [],
  relatedWords: [],
  confusingWords: [],
  note: "",
};

export default function WordForm({
  mode,
  initial,
}: {
  mode: Mode;
  initial?: Word;
}) {
  const router = useRouter();
  const [w, setW] = useState<Word>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Word>(key: K, value: Word[K]) {
    setW((prev) => ({ ...prev, [key]: value }));
  }

  function setListString(key: "alsoKnownAs" | "collocations" | "relatedWords", value: string) {
    const arr = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    set(key, arr as Word[typeof key]);
  }

  function updateExample(i: number, patch: Partial<Example>) {
    const next = w.examples.map((ex, idx) => {
      if (idx !== i) return ex;
      const merged = { ...ex, ...patch };
      // Keep the zh shortcut and the translations map in lockstep when the
      // legacy UI edits `zh` directly.
      if (patch.zh !== undefined) {
        merged.translations = { ...merged.translations, zh: patch.zh };
      }
      return merged;
    });
    set("examples", next);
  }
  function addExample() {
    set("examples", [...w.examples, makeExample("", "", w.examples.length)]);
  }
  function removeExample(i: number) {
    if (w.examples.length <= 1) return;
    set("examples", w.examples.filter((_, idx) => idx !== i));
  }

  function updateConfusing(i: number, patch: Partial<ConfusingWord>) {
    const cur = w.confusingWords ?? [];
    const next = cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    set("confusingWords", next);
  }
  function addConfusing() {
    set("confusingWords", [...(w.confusingWords ?? []), { word: "", note: "" }]);
  }
  function removeConfusing(i: number) {
    const cur = w.confusingWords ?? [];
    set("confusingWords", cur.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const url = mode === "create"
        ? "/api/admin/words"
        : `/api/admin/words/${encodeURIComponent(initial!.id)}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const cleaned: Word = {
        ...w,
        confusingWords: (w.confusingWords ?? []).filter((c) => c.word.trim()),
        note: w.note?.trim() || undefined,
      };
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cleaned),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "save failed");
      }
      router.push("/admin/words");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <p className="text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="id (kebab-case, 唯一)" required>
          <input
            value={w.id}
            onChange={(e) => set("id", e.target.value)}
            disabled={mode === "edit"}
            placeholder="例如 fridge / coffee-table"
            className="w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent disabled:bg-cream"
          />
        </Field>
        <Field label="分類" required>
          <select
            value={w.category}
            onChange={(e) => set("category", e.target.value as CategoryId)}
            className="w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name} · {c.nameZh}
              </option>
            ))}
          </select>
        </Field>
        <Field label="英文" required>
          <input value={w.word} onChange={(e) => set("word", e.target.value)} className={INPUT} />
        </Field>
        <Field label="中文" required>
          <input value={w.chinese} onChange={(e) => set("chinese", e.target.value)} className={INPUT} />
        </Field>
        <Field label="詞性" required>
          <input value={w.partOfSpeech} onChange={(e) => set("partOfSpeech", e.target.value)} className={INPUT} placeholder="noun, verb, adjective..." />
        </Field>
        <Field label="音標" required>
          <input value={w.pronunciation} onChange={(e) => set("pronunciation", e.target.value)} className={INPUT} placeholder="/frɪdʒ/" />
        </Field>
        <Field label="圖片 URL" required>
          <input value={w.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} className={INPUT} placeholder="https://..." />
        </Field>
        <Field label="同義 / 別稱 (逗號分隔)">
          <input
            defaultValue={(w.alsoKnownAs ?? []).join(", ")}
            onBlur={(e) => setListString("alsoKnownAs", e.target.value)}
            className={INPUT}
            placeholder="refrigerator, ice box"
          />
        </Field>
        <Field label="搭配詞 (逗號分隔)">
          <input
            defaultValue={(w.collocations ?? []).join(", ")}
            onBlur={(e) => setListString("collocations", e.target.value)}
            className={INPUT}
            placeholder="open the fridge, put in the fridge"
          />
        </Field>
        <Field label="相關單字 (逗號分隔 id)">
          <input
            defaultValue={(w.relatedWords ?? []).join(", ")}
            onBlur={(e) => setListString("relatedWords", e.target.value)}
            className={INPUT}
            placeholder="freezer, milk, kitchen"
          />
        </Field>
      </div>

      <Field label="備註（顯示在詳情頁的小提示）">
        <textarea
          value={w.note ?? ""}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          className={INPUT + " resize-y"}
          placeholder="例如：thyme 的 th 不發音。"
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">例句</legend>
        {w.examples.map((ex, i) => (
          <div key={i} className="grid sm:grid-cols-2 gap-2 bg-cream rounded-lg p-3">
            <input
              value={ex.en}
              onChange={(e) => updateExample(i, { en: e.target.value })}
              placeholder="English example"
              className={INPUT}
            />
            <input
              value={ex.zh}
              onChange={(e) => updateExample(i, { zh: e.target.value })}
              placeholder="中文翻譯"
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => removeExample(i)}
              className="text-xs text-rose-500 hover:underline justify-self-start"
            >
              移除這句
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addExample}
          className="text-sm text-sky-accent hover:underline"
        >
          + 加一句例句
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold text-ink">易混淆的詞</legend>
        {(w.confusingWords ?? []).map((c, i) => (
          <div key={i} className="grid sm:grid-cols-3 gap-2 bg-cream rounded-lg p-3">
            <input
              value={c.word}
              onChange={(e) => updateConfusing(i, { word: e.target.value })}
              placeholder="word"
              className={INPUT}
            />
            <input
              value={c.note}
              onChange={(e) => updateConfusing(i, { note: e.target.value })}
              placeholder="note"
              className={INPUT + " sm:col-span-2"}
            />
            <button
              type="button"
              onClick={() => removeConfusing(i)}
              className="text-xs text-rose-500 hover:underline justify-self-start"
            >
              移除
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addConfusing}
          className="text-sm text-sky-accent hover:underline"
        >
          + 加一組混淆詞
        </button>
      </fieldset>

      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90 disabled:opacity-50"
        >
          {saving ? "儲存中..." : mode === "create" ? "建立" : "儲存變更"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/words")}
          className="px-5 py-3 rounded-full bg-white text-ink shadow-card hover:shadow-lg"
        >
          取消
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-lg bg-white px-3 py-2 outline-none border border-black/10 focus:ring-2 ring-sky-accent";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink font-medium">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
